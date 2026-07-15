"""
Per-worker service instances.

Celery workers run in separate processes from the FastAPI app — they
can't share app.state. Each worker process builds its OWN copy of
ScoringService/Neo4jService/CaseService once, at process startup, using
the exact same classes the API uses. This guarantees identical scoring
logic between the live API and the background worker — there is only
ONE ScoringService implementation, used in two places.
"""

import os
from celery.signals import worker_process_init

from app.services.scoring_service import ScoringService
from app.services.neo4j_service import Neo4jService
from app.services.case_service import CaseService

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Populated by _init_worker_services below, once per worker process
scoring_service = None
neo4j_service = None
case_service = None


@worker_process_init.connect
def _init_worker_services(**kwargs):
    global scoring_service, neo4j_service, case_service

    print("[Worker] Initializing services for this worker process...")
    scoring_service = ScoringService(models_dir=MODELS_DIR, device="cpu")

    try:
        neo4j_service = Neo4jService()
    except RuntimeError as e:
        print(f"[Worker WARNING] Neo4j unavailable: {e}")
        neo4j_service = None

    try:
        case_service = CaseService()
    except Exception as e:
        print(f"[Worker WARNING] PostgreSQL unavailable: {e}")
        case_service = None

    print("[Worker] Services ready.")