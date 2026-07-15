"""
Scoring endpoints.

GET  /score/{account_id}   -> score one account
POST /score/batch          -> score a list of accounts in one call
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List

router = APIRouter(prefix="/score", tags=["scoring"])


class BatchScoreRequest(BaseModel):
    account_ids: List[str] = Field(
        ..., description="List of account IDs to score", min_length=1, max_length=1000
    )


@router.get("/{account_id}")
def score_single_account(account_id: str, request: Request):
    """
    Score one account using the locked-in 0.5 RF / 0.5 GraphSAGE ensemble.

    Returns 404 if the account isn't found in the feature table rather than
    raising a raw exception, so API consumers get a clean, expected response.
    """
    scoring_service = request.app.state.scoring_service

    try:
        result = scoring_service.score_account(account_id)
        return result
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Account '{account_id}' not found in the feature table."
        )


@router.post("/batch")
def score_batch_accounts(payload: BatchScoreRequest, request: Request):
    """
    Score multiple accounts in one call. Unlike the single-account endpoint,
    this does NOT 404 on unknown accounts — it returns them separately in
    'not_found' so a dashboard scoring hundreds of accounts doesn't fail
    entirely because of one bad ID.
    """
    scoring_service = request.app.state.scoring_service
    result = scoring_service.score_batch(payload.account_ids)
    return result