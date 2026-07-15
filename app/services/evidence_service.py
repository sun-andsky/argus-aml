"""
Evidence Gathering Service
=============================
Combines everything the system knows about a case into one structured
bundle: the account's risk scores, its fund flow trace, and any case notes
already on file. This bundle is what gets handed to the LLM to draft a
narrative from — the LLM never sees raw data it has to interpret, only
this already-organized summary.
"""

from datetime import datetime, timezone


class EvidenceService:
    """
    Not a standalone connection like ScoringService/Neo4jService/CaseService —
    this reads FROM those three, so it's instantiated with references to
    them rather than opening its own connections.
    """

    def __init__(self, scoring_service, neo4j_service, case_service):
        self.scoring_service = scoring_service
        self.neo4j_service = neo4j_service
        self.case_service = case_service

    def build_evidence_bundle(self, case_id: int) -> dict:
        """
        Assembles one case's full evidence bundle:
          - case metadata (status, assigned investigator, notes)
          - current risk score (re-scored live, not just what was stored
            when the case was opened, in case the model/data has updated)
          - outbound fund flow trace (where money went)
          - inbound fund flow trace (where money came from)
        """
        case = self.case_service.get_case(case_id)
        account_id = case["account_id"]

        risk_result = self.scoring_service.score_account(account_id)

        outbound_trace = None
        inbound_trace = None
        if self.neo4j_service is not None:
            try:
                outbound_trace = self.neo4j_service.trace_fund_flow(
                    account_id, hops=3, direction="out"
                )
            except KeyError:
                outbound_trace = {"paths_found": 0, "paths": []}

            try:
                inbound_trace = self.neo4j_service.trace_fund_flow(
                    account_id, hops=3, direction="in"
                )
            except KeyError:
                inbound_trace = {"paths_found": 0, "paths": []}

        return {
            "case": case,
            "account_id": account_id,
            "risk_assessment": risk_result,
            "outbound_fund_flow": outbound_trace,
            "inbound_fund_flow": inbound_trace,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }