FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# System deps:
#   gcc + python3-dev  → build C extensions (psycopg2, etc.)
#   libpq-dev          → PostgreSQL client headers (psycopg2)
#   ffmpeg             → audio format conversion (pydub)
#   curl               → download cloudflared
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    ffmpeg \
    curl \
    && curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install uv

# Copy dependency manifest first for better layer caching
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev

# Copy application code
COPY backend/ ./backend/
COPY static/ ./static/
COPY 911_calls.json ./
COPY agency_settings.json ./
COPY frontend/public/location.html ./frontend/public/location.html

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
