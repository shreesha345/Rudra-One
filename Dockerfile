# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

# System deps:
#   gcc + python3-dev  → build C extensions (psycopg2, etc.)
#   libpq-dev          → PostgreSQL client headers (psycopg2)
#   ffmpeg             → audio format conversion (pydub)
# cloudflared is NOT installed here: docker-compose runs it as its own
# `cloudflared` sidecar service, and the backend's own tunnel fallback
# (backend/services/tunnel.py) is disabled via TUNNEL_MANAGED_EXTERNALLY
# when running under compose — see docker-compose.yml.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for fast dependency resolution
RUN --mount=type=cache,target=/root/.cache/pip pip install uv

# Copy dependency manifest first for better layer caching
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

# Copy application code
COPY backend/ ./backend/
COPY static/ ./static/
COPY 911_calls.json ./
COPY agency_settings.json ./
COPY frontend/public/location.html ./frontend/public/location.html

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
