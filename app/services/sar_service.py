"""
SAR (Suspicious Activity Report) Generation Service
=====================================================
Two-stage pipeline:
  1. Send the evidence bundle to a local Llama 3.1 (via Ollama's HTTP API)
     to draft a plain-English narrative.
  2. Render that narrative, plus the structured evidence, into a PDF
     using WeasyPrint + a Jinja2 HTML template.

Ollama runs as its own local server — this talks to it over HTTP, same
pattern as any external API call, just pointed at localhost.
"""

import os
import requests
from datetime import datetime, timezone
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")


class SARService:
    def __init__(self):
        self.jinja_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

    def _build_prompt(self, evidence: dict) -> str:
        """
        Constructs the prompt sent to Llama 3.1. Deliberately instructs the
        model to stick to the facts provided and flag uncertainty rather
        than invent details — SAR narratives are compliance documents,
        not creative writing, so hallucination risk needs to be actively
        suppressed in the instructions.
        """
        risk = evidence["risk_assessment"]
        case = evidence["case"]
        outbound = evidence.get("outbound_fund_flow") or {"paths_found": 0}
        inbound = evidence.get("inbound_fund_flow") or {"paths_found": 0}

        prompt = f"""You are drafting a factual Suspicious Activity Report (SAR) narrative
for a financial compliance team. Use ONLY the facts provided below. Do not
invent transaction details, dates, or amounts that are not given. If
information is missing or uncertain, state that explicitly rather than
guessing. Write in a neutral, factual, third-person tone appropriate for
a regulatory filing. Keep it to 3-4 paragraphs.

ACCOUNT: {evidence['account_id']}
CASE STATUS: {case['status']}
RISK SCORE: {risk['risk_score']} (tier: {risk['risk_tier']})
  - Random Forest component score: {risk['rf_score']}
  - GraphSAGE component score: {risk['graphsage_score']}

FUND FLOW SUMMARY:
  - Outbound chains detected (up to 3 hops): {outbound['paths_found']}
  - Inbound chains detected (up to 3 hops): {inbound['paths_found']}

EXISTING INVESTIGATOR NOTES: {case.get('notes') or 'None on file.'}

Draft the narrative now, covering: (1) why this account was flagged,
(2) what the fund flow pattern shows, (3) the risk basis, and
(4) a recommendation for next steps (e.g. continued monitoring,
escalation, or filing)."""
        return prompt

    def generate_narrative(self, evidence: dict, timeout: int = 120) -> str:
        """
        Calls the local Ollama server to generate the narrative. Raises a
        clear error if Ollama isn't running, rather than a raw connection
        exception, so the API layer can return a sensible HTTP error.
        """
        prompt = self._build_prompt(evidence)

        try:
            response = requests.post(
                OLLAMA_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                },
                timeout=timeout,
            )
            response.raise_for_status()
        except requests.exceptions.ConnectionError:
            raise RuntimeError(
                f"Could not connect to Ollama at {OLLAMA_URL}. "
                "Is 'ollama serve' running?"
            )
        except requests.exceptions.Timeout:
            raise RuntimeError(
                f"Ollama did not respond within {timeout}s. The model may "
                "still be loading, or the prompt may be too large."
            )

        result = response.json()
        return result.get("response", "").strip()

    def render_pdf(self, evidence: dict, narrative: str, output_path: str) -> str:
        """
        Renders the SAR template with the narrative and structured evidence
        into a PDF file on disk, returning the file path.
        """
        template = self.jinja_env.get_template("sar_report.html")

        html_content = template.render(
            account_id=evidence["account_id"],
            case=evidence["case"],
            risk=evidence["risk_assessment"],
            outbound=evidence.get("outbound_fund_flow") or {"paths_found": 0, "paths": []},
            inbound=evidence.get("inbound_fund_flow") or {"paths_found": 0, "paths": []},
            narrative=narrative,
            generated_at=evidence["generated_at"],
        )

        HTML(string=html_content).write_pdf(output_path)
        return output_path