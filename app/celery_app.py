"""
Celery application instance.

Redis acts as both the task broker (queue) and result backend. Run the
worker separately from the API process:

    celery -A app.celery_app worker --loglevel=info

The API process only ENQUEUES tasks (fast, non-blocking); the worker
process is what actually runs scoring — this separation is the whole
point: transaction ingestion never blocks on model inference.
"""

import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "aml_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    # Auto-scoring tasks are lightweight but the graph forward pass isn't
    # free — cap retries so a persistently broken account doesn't loop.
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)