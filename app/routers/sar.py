"""
SAR generation endpoint.

POST /sar/{case_id}/generate -> generates narrative + PDF, returns PDF file
"""

import os
import tempfile
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

router = APIRouter(prefix="/sar", tags=["sar"])


@router.post("/{case_id}/generate")
def generate_sar_report(case_id: int, request: Request):
    """
    Builds the evidence bundle for a case, drafts a narrative via local
    Llama 3.1, renders it to PDF, and returns the file. This can take
    30-90+ seconds depending on your machine's Ollama inference speed —
    that's expected for local LLM generation, not a bug.
    """
    evidence_service = request.app.state.evidence_service
    sar_service = request.app.state.sar_service

    if evidence_service is None or sar_service is None:
        raise HTTPException(
            status_code=503,
            detail="SAR generation services unavailable — check server startup logs."
        )

    try:
        evidence = evidence_service.build_evidence_bundle(case_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found.")

    try:
        narrative = sar_service.generate_narrative(evidence)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    output_path = os.path.join(
        tempfile.gettempdir(), f"sar_report_case_{case_id}.pdf"
    )
    sar_service.render_pdf(evidence, narrative, output_path)

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"SAR_case_{case_id}.pdf",
    )