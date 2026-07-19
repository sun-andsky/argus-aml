#!/bin/bash
# download_models.sh
# Downloads model artifacts from Google Drive at container startup.
# Only downloads if the file doesn't already exist — safe to re-run.
# Set each GDRIVE_* env var to the FILE ID from your Drive share link.
# Share link: https://drive.google.com/file/d/FILE_ID_HERE/view
# Extract just the FILE_ID part and set it as the env var.

set -e

MODELS_DIR="/app/app/models"
mkdir -p "$MODELS_DIR"

download_if_missing() {
    local filename="$1"
    local file_id="$2"
    local filepath="$MODELS_DIR/$filename"

    if [ -f "$filepath" ]; then
        echo "[models] $filename already present — skipping download"
        return
    fi

    if [ -z "$file_id" ]; then
        echo "[models] WARNING: $filename — no GDRIVE file ID set, skipping"
        return
    fi

    echo "[models] Downloading $filename from Google Drive..."
    # Use gdown for reliable large-file Drive downloads (handles virus-scan bypass)
    gdown "https://drive.google.com/uc?id=${file_id}" -O "$filepath"
    echo "[models] $filename downloaded ($(du -sh "$filepath" | cut -f1))"
}

download_if_missing "rf_model.pkl"                  "$GDRIVE_RF_MODEL_ID"
download_if_missing "graphsage_weights.pt"          "$GDRIVE_SAGE_WEIGHTS_ID"
download_if_missing "account_level_features.csv"   "$GDRIVE_FEATURES_ID"
download_if_missing "edge_list.csv"                "$GDRIVE_EDGES_ID"

echo "[models] All model files ready"
