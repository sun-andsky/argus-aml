"""
Transaction ingestion endpoint — the real-time entry point.

POST /transactions writes a transaction into Neo4j immediately, then
enqueues background scoring for both parties. The endpoint itself returns
fast (write + enqueue only) — scoring and case creation happen
asynchronously in the Celery worker, so ingestion never blocks on model
inference.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional

from app.tasks import score_and_maybe_alert

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionIn(BaseModel):
    sender_id: str
    receiver_id: str
    amount: float = Field(..., gt=0)
    timestamp: Optional[str] = None
    payment_format: Optional[str] = None
    is_laundering: bool = False


@router.post("")
def ingest_transaction(payload: TransactionIn, request: Request):
    """
    Writes the transaction to Neo4j, then enqueues async re-scoring for
    both the sender and receiver. Returns immediately after the write —
    does NOT wait for scoring to complete.
    """
    neo4j_service = request.app.state.neo4j_service

    if neo4j_service is None:
        raise HTTPException(
            status_code=503,
            detail="Neo4j service unavailable — cannot ingest transactions."
        )

    timestamp = payload.timestamp or datetime.now(timezone.utc).isoformat()

    try:
        result = neo4j_service.create_transaction(
            sender_id=payload.sender_id,
            receiver_id=payload.receiver_id,
            amount=payload.amount,
            timestamp=timestamp,
            payment_format=payload.payment_format,
            is_laundering=payload.is_laundering,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write transaction: {e}")

    # Enqueue background scoring for both parties — fire-and-forget,
    # the API does not wait for these to complete
    task_sender = score_and_maybe_alert.delay(payload.sender_id)
    task_receiver = score_and_maybe_alert.delay(payload.receiver_id)

    return {
        "status": "ingested",
        "sender_id": result["sender_id"],
        "receiver_id": result["receiver_id"],
        "timestamp": timestamp,
        "scoring_tasks": {
            "sender_task_id": task_sender.id,
            "receiver_task_id": task_receiver.id,
        },
    }