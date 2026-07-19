FROM python:3.11-slim

# WeasyPrint system deps for PDF rendering
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

# Copy application code only — NO model files baked in.
# Model files are downloaded at container startup via download_models.sh
# using Google Drive IDs set as environment variables in Render.
COPY app/ ./app/
COPY start.sh ./start.sh
COPY download_models.sh ./download_models.sh
RUN chmod +x ./start.sh ./download_models.sh

RUN mkdir -p ./app/models

EXPOSE 8000
