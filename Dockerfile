# Single image used by both the `api` and `worker` Compose services.
# The difference is only in the CMD — api runs uvicorn, worker runs celery.

FROM python:3.11-slim

# WeasyPrint needs these system libs for PDF rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Models directory is mounted as a volume at runtime (not baked in)
# so you can swap model files without rebuilding the image.
RUN mkdir -p ./app/models

EXPOSE 8000