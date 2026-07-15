"""
Ensemble Scoring Service
=========================
Loads the Random Forest and GraphSAGE models plus the account feature table
and transaction graph ONCE at application startup, then serves scores on
demand. This avoids reloading multi-megabyte model files and rebuilding the
graph on every single request, which would make the API unusably slow.

Locked-in production configuration (from the model comparison notebook):
    RF weight       : 0.5
    GraphSAGE weight: 0.5
    Detection threshold: 0.5
"""

import os
import joblib
import torch
import torch.nn.functional as F
import pandas as pd
import numpy as np
from torch_geometric.data import Data

from .model_defs import load_graphsage_model

# ── Locked-in ensemble configuration ─────────────────────────────────
RF_WEIGHT = 0.5
SAGE_WEIGHT = 0.5
DETECTION_THRESHOLD = 0.5

# Risk tier boundaries — same as used throughout the detection notebooks
TIER_BOUNDARIES = [
    (0.75, "CRITICAL"),
    (0.50, "HIGH"),
    (0.25, "MEDIUM"),
    (0.00, "LOW"),
]


def assign_risk_tier(score: float) -> str:
    for boundary, tier in TIER_BOUNDARIES:
        if score >= boundary:
            return tier
    return "LOW"


class ScoringService:
    """
    Holds all loaded models and data in memory. Instantiate ONCE at app
    startup (see app/main.py) and reuse across every request.
    """

    def __init__(self, models_dir: str, device: str = "cpu"):
        self.device = device
        self.models_dir = models_dir

        print("[ScoringService] Loading account feature table...")
        features_path = os.path.join(models_dir, "account_level_features.csv")
        self.account_features_df = pd.read_csv(features_path)
        self.account_features_df = self.account_features_df.set_index(
            "account_id", drop=False
        )

        # Feature columns are everything except account_id and label —
        # must match the exact column order used during training
        self.feature_cols = [
            c for c in self.account_features_df.columns
            if c not in ("account_id", "label")
        ]

        print(f"[ScoringService] Loaded {len(self.account_features_df)} accounts, "
              f"{len(self.feature_cols)} features: {self.feature_cols}")

        print("[ScoringService] Loading Random Forest model...")
        rf_path = os.path.join(models_dir, "rf_model.pkl")
        self.rf_model = joblib.load(rf_path)

        print("[ScoringService] Loading transaction edge list & building graph...")
        edges_path = os.path.join(models_dir, "edge_list.csv")
        self.edge_df = pd.read_csv(edges_path)

        # Build a consistent account_id -> node index mapping, matching
        # the order of account_features_df exactly (must match training)
        self.node_id_to_idx = {
            acc: i for i, acc in enumerate(self.account_features_df["account_id"])
        }
        self.idx_to_node_id = {
            i: acc for acc, i in self.node_id_to_idx.items()
        }

        edges = []
        for _, row in self.edge_df.iterrows():
            sender = row["sender"]
            receiver = row["receiver"]
            if sender in self.node_id_to_idx and receiver in self.node_id_to_idx:
                edges.append((self.node_id_to_idx[sender], self.node_id_to_idx[receiver]))

        edge_index = torch.tensor(edges, dtype=torch.long).t().contiguous()

        # Same min-max normalisation approach used during training
        feature_matrix = self.account_features_df[self.feature_cols].values.astype(np.float32)
        self._feat_min = feature_matrix.min(axis=0)
        self._feat_max = feature_matrix.max(axis=0)
        self._feat_range = np.where(
            self._feat_max - self._feat_min == 0, 1, self._feat_max - self._feat_min
        )
        feature_matrix_norm = (feature_matrix - self._feat_min) / self._feat_range

        self.x = torch.tensor(feature_matrix_norm, dtype=torch.float)
        self.edge_index = edge_index
        self.pyg_data = Data(x=self.x, edge_index=self.edge_index).to(device)

        print(f"[ScoringService] Graph built: {self.pyg_data.num_nodes} nodes, "
              f"{self.pyg_data.num_edges} edges")

        print("[ScoringService] Loading GraphSAGE model...")
        sage_weights_path = os.path.join(models_dir, "graphsage_weights.pt")
        self.sage_model = load_graphsage_model(
            weights_path=sage_weights_path,
            in_channels=len(self.feature_cols),
            hidden_channels=64,
            out_channels=2,
            device=device,
        )

        # Precompute GraphSAGE probabilities for ALL nodes once — the whole
        # point of message passing is that a node's score depends on its
        # neighbors, so there's no cheaper way to score one account without
        # running the full forward pass anyway. Caching this avoids redundant
        # forward passes across repeated single-account requests.
        print("[ScoringService] Precomputing GraphSAGE scores for all accounts...")
        with torch.no_grad():
            logits = self.sage_model(self.pyg_data.x, self.pyg_data.edge_index)
            self.sage_probs_all = F.softmax(logits, dim=1)[:, 1].cpu().numpy()

        print("[ScoringService] Ready.")

    def _get_rf_probability(self, account_id) -> float:
        row = self.account_features_df.loc[[account_id], self.feature_cols]
        prob = self.rf_model.predict_proba(row)[0, 1]
        return float(prob)

    def _get_sage_probability(self, account_id) -> float:
        idx = self.node_id_to_idx.get(account_id)
        if idx is None:
            raise KeyError(f"Account {account_id} not found in graph node mapping")
        return float(self.sage_probs_all[idx])

    def score_account(self, account_id) -> dict:
        """
        Score a single account using the locked-in 0.5/0.5 ensemble.
        Raises KeyError if the account isn't found in the feature table.
        """
        if account_id not in self.account_features_df.index:
            raise KeyError(f"Account {account_id} not found")

        rf_prob = self._get_rf_probability(account_id)
        sage_prob = self._get_sage_probability(account_id)

        ensemble_prob = (RF_WEIGHT * rf_prob) + (SAGE_WEIGHT * sage_prob)
        is_suspicious = ensemble_prob >= DETECTION_THRESHOLD
        tier = assign_risk_tier(ensemble_prob)

        return {
            "account_id": account_id,
            "risk_score": round(ensemble_prob, 4),
            "risk_tier": tier,
            "is_suspicious": bool(is_suspicious),
            "rf_score": round(rf_prob, 4),
            "graphsage_score": round(sage_prob, 4),
        }

    def score_batch(self, account_ids: list) -> dict:
        """
        Score multiple accounts in one call. Returns both successfully
        scored accounts and a list of any account IDs that weren't found,
        rather than failing the whole batch on one bad ID.
        """
        results = []
        not_found = []

        for account_id in account_ids:
            try:
                results.append(self.score_account(account_id))
            except KeyError:
                not_found.append(account_id)

        return {
            "scored": results,
            "not_found": not_found,
            "total_requested": len(account_ids),
            "total_scored": len(results),
        }