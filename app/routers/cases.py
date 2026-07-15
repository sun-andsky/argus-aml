"""
Case management endpoints (PostgreSQL-backed).

POST /cases              -> open a new case for an account
GET  /cases/{case_id}    -> get one case
GET  /cases              -> list cases, optionally filtered
PATCH /cases/{case_id}   -> update case status/notes
"""

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/cases", tags=["cases"])


class CreateCaseRequest(BaseModel):
    account_id: str
    risk_score: Optional[float] = None
    risk_tier: Optional[str] = None
    assigned_to: Optional[str] = None


class UpdateCaseRequest(BaseModel):
    status: str
    notes: Optional[str] = None


@router.post("")
def create_case(payload: CreateCaseRequest, request: Request):
    case_service = request.app.state.case_service
    result = case_service.create_case(
        account_id=payload.account_id,
        risk_score=payload.risk_score,
        risk_tier=payload.risk_tier,
        assigned_to=payload.assigned_to,
    )
    return result


@router.get("/{case_id}")
def get_case(case_id: int, request: Request):
    case_service = request.app.state.case_service
    try:
        return case_service.get_case(case_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found.")


@router.get("")
def list_cases(
    request: Request,
    status: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
):
    case_service = request.app.state.case_service
    return case_service.list_cases(status=status, account_id=account_id)


@router.patch("/{case_id}")
def update_case(case_id: int, payload: UpdateCaseRequest, request: Request):
    case_service = request.app.state.case_service
    try:
        return case_service.update_case_status(case_id, payload.status, payload.notes)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))