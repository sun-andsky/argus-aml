#!/bin/bash
bash /app/download_models.sh
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}