"""
Celery tasks — background scoring and automatic case creation.

score_and_maybe_alert is the core of the real-time pipeline: given an
account_id, re-score it with the live ensemble, and if the score crosses
the alert threshold AND there isn't already an active case for that
account, open one automatically. This is what replaces manually running
seed_cases.py — new transactions trigger this instead of a human.
"""

from app.celery_app import celery_app
from app import worker_context

# Only auto-create cases for HIGH or CRITICAL — MEDIUM/LOW scoring
# accounts don't need investigator attention just because a transaction
# happened; this keeps the queue meaningful rather than flooded.
ALERT_TIERS = {"HIGH", "CRITICAL"}


@celery_app.task(name="score_and_maybe_alert", bind=True, max_retries=2)
def score_and_maybe_alert(self, account_id: str):
    """
    Re-scores one account and opens a case automatically if it's newly
    HIGH/CRITICAL risk and doesn't already have an active case open.
    """
    if worker_context.scoring_service is None:
        raise RuntimeError("Worker's ScoringService not initialized.")

    try:
        result = worker_context.scoring_service.score_account(account_id)
    except KeyError:
        # Account not in the feature table yet (e.g. brand new account
        # never seen during training) — nothing to score, skip silently.
        return {"account_id": account_id, "status": "skipped_unknown_account"}

    if result["risk_tier"] not in ALERT_TIERS:
        return {"account_id": account_id, "status": "below_alert_threshold", **result}

    if worker_context.case_service is None:
        return {"account_id": account_id, "status": "case_service_unavailable", **result}

    # Avoid duplicate cases — only open a new one if this account doesn't
    # already have something active in the queue
    existing = worker_context.case_service.list_cases(account_id=account_id)
    active_existing = [c for c in existing if c["status"] in ("open", "under_review", "escalated")]

    if active_existing:
        return {"account_id": account_id, "status": "case_already_active", **result}

    new_case = worker_context.case_service.create_case(
        account_id=account_id,
        risk_score=result["risk_score"],
        risk_tier=result["risk_tier"],
    )

    print(f"[Worker] Auto-opened case #{new_case['id']} for {account_id} "
          f"({result['risk_tier']}, score={result['risk_score']})")

    return {"account_id": account_id, "status": "case_created", "case_id": new_case["id"], **result}