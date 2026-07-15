"""
Live graph context endpoints — separate from /score, since this queries
Neo4j directly rather than the static exported snapshot.

GET /graph/{account_id}/neighbors -> live immediate transaction neighbors
"""

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/{account_id}/neighbors")
def get_account_neighbors(account_id: str, request: Request):
    """
    Returns an account's live immediate incoming and outgoing transaction
    neighbors, pulled directly from Neo4j — reflects the current state of
    the database, not the frozen snapshot used for scoring.
    """
    neo4j_service = request.app.state.neo4j_service

    try:
        result = neo4j_service.get_account_neighbors(account_id)
        return result
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Account '{account_id}' not found in Neo4j."
        )
    

@router.get("/{account_id}/trace")
def trace_fund_flow(
    account_id: str,
    request: Request,
    hops: int = 3,
    direction: str = "out",
):
    """
    Multi-hop fund flow trace. direction='out' shows where money went
    (outgoing chains up to N hops); direction='in' shows where money
    came from (incoming chains up to N hops).

    hops is caller-configurable, default 3, hard-capped at 5 — beyond
    that the query is rejected rather than silently truncated, since an
    uncapped trace on a high-degree hub account can blow up combinatorially.
    """
    neo4j_service = request.app.state.neo4j_service

    if neo4j_service is None:
        raise HTTPException(
            status_code=503,
            detail="Neo4j service unavailable — check server logs for connection errors."
        )

    if hops < 1 or hops > 5:
        raise HTTPException(
            status_code=400,
            detail="hops must be between 1 and 5."
        )

    if direction not in ("out", "in"):
        raise HTTPException(
            status_code=400,
            detail="direction must be 'out' or 'in'."
        )

    try:
        result = neo4j_service.trace_fund_flow(account_id, hops=hops, direction=direction)
        return result
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Account '{account_id}' not found in Neo4j."
        )