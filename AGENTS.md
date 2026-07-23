# RudraOne — Agent Guide

## Quick Start

```bash
# 1. Create environment file from template
cp .env.example .env
# Edit .env and fill in your API keys

# 2. Docker (recommended)
docker compose up -d --build

# 3. Or run manually
uv sync                          # install Python deps
docker compose up -d postgres    # start database
uv run python -m backend.main    # start backend (port 8000)
cd frontend && npm install && npm run dev  # start frontend (port 8082)
```

## Run Commands

| Task | Command |
|------|---------|
| Start backend | `uv run python -m backend.main` |
| Initialize database | `uv run python -m backend.init_database` |
| Lint / typecheck | `uv run ruff check backend/` |
| Run tests | (no test suite yet) |
| Build frontend | `cd frontend && npm run build` |
| Docker (all services) | `docker compose up -d --build` |
| Docker (DB only) | `docker compose up -d postgres` |

## Environment

A single root `.env` file is shared by backend and frontend.
Vite reads it via `envDir: "../"` in `frontend/vite.config.ts`.
Copy `.env.example` to `.env` and fill in keys.

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_API_KEY` | OpenAI-compatible API key | — |
| `LLM_BASE_URL` | LLM endpoint URL | `https://api.openai.com/v1` |
| `LLM_MODEL` | Model name | `gpt-4o` |
| `DATABASE_URL` | PostgreSQL async connection string | `postgresql+asyncpg://postgres:postgres@localhost:5432/rudraone` |
| `DEEPGRAM_API_KEY` | Speech-to-text API key | — |
| `TUNNEL_TOKEN` | Cloudflare named tunnel token (empty = quick tunnel) | — |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | — |
| `ELEVENLABS_API_KEY` | TTS API key | — |
| `SARVAM_API_KEY` | Indian-language TTS API key | — |
| `DEFAULT_USERNAME` | Default login username (seeded on first run) | `Shreesha` |
| `DEFAULT_PASSWORD` | Default login password (seeded on first run) | `Shreesha123admin` |
| `VITE_API_URL` | Backend URL for frontend | `http://localhost:8000` |

### LLM Providers

Any OpenAI-compatible endpoint works. Set `LLM_BASE_URL` and `LLM_MODEL`:

| Provider | `LLM_BASE_URL` | `LLM_MODEL` example |
|----------|----------------|---------------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Ollama | `http://localhost:11434/v1` | `llama3.1` |
| Groq | `https://api.groq.com/openai` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |

## Project Structure

```
RudraOne/
├── .env.example          # Universal env template (backend + frontend)
├── Dockerfile            # Backend container image
├── docker-compose.yml    # postgres + backend + cloudflared
├── pyproject.toml        # Python dependencies (uv)
├── 911_calls.json        # Training scenario data
├── agency_settings.json  # Default agency settings
│
├── backend/             # All backend Python code
│   ├── __init__.py
│   ├── config.py         # Centralized env-var config
│   ├── state.py          # Shared mutable state (sessions, queues, languages)
│   ├── app.py            # FastAPI app factory + lifespan
│   ├── main.py           # Entry point (uvicorn launcher)
│   ├── database.py       # SQLAlchemy engine + session factory
│   ├── models.py         # ORM models (User, Call, Transcript, etc.)
│   ├── prompts.py        # All AI system prompts
│   ├── stations.py       # Emergency station data + nearest-station lookup
│   ├── audio_ops.py      # NumPy-based u-law codec (audioop replacement)
│   ├── db_helpers.py     # DB query helpers (save, update, mark ended)
│   ├── init_database.py  # Standalone DB init script
│   │
│   ├── agents/           # AI agents
│   │   ├── rudra_agent.py    # Emergency-call AI agent (LLM factory)
│   │   └── analytics.py      # Analytics + dashboard generation (LLM factory)
│   │
│   ├── services/         # Business logic services
│   │   ├── llm.py            # OpenAI-compatible LLM client factory
│   │   ├── tunnel.py         # Cloudflare Tunnel (replaces ngrok)
│   │   ├── transcriber.py    # Deepgram realtime WebSocket transcriber
│   │   ├── tts.py            # ElevenLabs + Sarvam TTS (combined)
│   │   ├── translation.py    # MyMemory translation + language detection
│   │   ├── twilio.py         # Twilio SMS + call formatting (LLM factory)
│   │   ├── training.py       # Dispatcher training (LLM factory)
│   │   └── audio.py          # Audio format conversion + recording save
│   │
│   └── routes/           # FastAPI route modules
│       ├── schemas.py       # All Pydantic request/response models
│       ├── misc.py          # /, /health, /api/login, /api/analytics/chat
│       ├── twilio.py        # /twiml, /recordings/fetch
│       ├── training.py      # /training/start, /message, /end
│       ├── location.py      # /location, /location-request
│       ├── sms.py           # /sms/emergency, /call/emergency, /api/send-sms
│       ├── calls.py         # /api/calls, /audio/stream, insights, takeover
│       ├── settings.py      # /api/settings (GET + POST)
│       └── websocket.py     # /ws, /client/notifications, /client/{caller}
│
├── frontend/            # Vite + React + TypeScript frontend
│   ├── vite.config.ts    # envDir: "../" reads root .env
│   └── src/
│
└── extra/               # Experimental/standalone scripts
    ├── RudraOne_agent.py      # Standalone CLI agent (moved from root)
    ├── fix_stuck_calls.py     # DB maintenance (imports backend.*)
    ├── add_protocol_column.py # DB migration (imports backend.*)
    └── ...                    # Other legacy scripts
```

## Architecture

### LLM Factory (`backend/services/llm.py`)

All AI components (agent, analytics, training, SMS formatting) call
`get_chat_completion()` or `get_langchain_llm()` instead of instantiating
their own clients. Swap providers by changing env vars only:

```python
from backend.services.llm import get_chat_completion

response = get_chat_completion(
    messages=[{"role": "user", "content": "Hello"}],
    temperature=0.7,
    max_tokens=150,
)
```

### Cloudflare Tunnel (`backend/services/tunnel.py`)

Replaces ngrok. Two modes:
- **Quick tunnel** (no account): `TUNNEL_TOKEN` empty → ephemeral `trycloudflare.com` URL
- **Named tunnel**: set `TUNNEL_TOKEN` from Cloudflare dashboard

Docker Compose includes a `cloudflared` service that tunnels to the backend.

### Shared State (`backend/state.py`)

Mutable global state (sessions, transcription clients, language maps,
audio queue) lives in one module to avoid circular imports.

### App Factory (`backend/app.py`)

`create_app()` wires up middleware, lifespan (DB init + tunnel startup),
and all route routers. `backend/main.py` calls it and runs uvicorn.

### Docker

Three services in `docker-compose.yml`:
1. **postgres** — PostgreSQL 16 database
2. **backend** — FastAPI app (builds from `Dockerfile`, includes `cloudflared` binary)
3. **cloudflared** — Cloudflare tunnel container

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root info + public URL |
| GET | `/health` | Health check |
| POST | `/api/login` | Login |
| POST | `/api/analytics/chat` | Analytics chat |
| GET | `/ws/status` | WebSocket status |
| POST | `/twiml` | Twilio webhook |
| POST | `/recordings/fetch` | Fetch Twilio recordings |
| GET | `/recordings/fetch/{date}` | Fetch recordings by date |
| POST | `/training/start` | Start training session |
| POST | `/training/message` | Send training message |
| POST | `/training/end` | End training + evaluate |
| GET | `/training/session/{id}` | Get training session |
| GET | `/location-request` | Serve location HTML page |
| POST | `/location` | Receive GPS location |
| POST | `/sms/emergency` | Send emergency SMS |
| POST | `/call/emergency` | Initiate emergency call |
| POST | `/api/send-sms` | Send raw SMS |
| POST | `/audio/stream` | Stream browser audio |
| GET | `/api/calls` | List calls |
| GET | `/api/calls/{sid}/transcripts` | Call transcripts |
| GET | `/api/calls/{sid}/insights` | Call insights |
| POST | `/api/calls/{sid}/insights` | Save insights |
| GET | `/api/calls/{sid}/location` | Call location |
| POST | `/api/calls/{sid}/takeover` | Human takeover |
| GET | `/api/settings` | Get agency settings |
| POST | `/api/settings` | Update settings |
| DELETE | `/api/database/clear` | Clear database |
| WS | `/ws` | Twilio Media Stream |
| WS | `/client/notifications` | Call notifications |
| WS | `/client/{caller_number}` | Transcription stream |

## Default Login

Configured via the root `.env` file (`DEFAULT_USERNAME` / `DEFAULT_PASSWORD`).
The user is seeded on first database init.

- Defaults: `Shreesha` / `Shreesha123admin`

## Ports

| Service | Port |
|---------|------|
| Backend (FastAPI) | 8000 |
| Frontend (Vite) | 8082 |
| PostgreSQL | 5432 |

## Dependencies

Managed with `uv` (Python) and `npm` (frontend). See `pyproject.toml` for
the full list. Key backend deps: `fastapi`, `uvicorn`, `sqlalchemy`,
`asyncpg`, `openai`, `langchain-openai`, `twilio`, `elevenlabs`,
`deepgram-sdk`, `sarvamai`, `pydub`, `websockets`, `aiohttp`.

## What Changed (Refactor Summary)

1. **OpenAI-compatible LLM**: Single `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL`
   powers agent, analytics, training, and SMS formatting. Removed
   `google-genai` dependency from the backend.
2. **Cloudflare Tunnel**: Replaced ngrok with `cloudflared` (quick tunnel
   or named tunnel via `TUNNEL_TOKEN`).
3. **Docker**: Added `Dockerfile` and updated `docker-compose.yml` with
   `postgres` + `backend` + `cloudflared` services.
4. **Universal `.env`**: Single root `.env` shared by backend and frontend
   (Vite `envDir: "../"`).
5. **Clean structure**: All backend code moved into `backend/` package.
   Root directory has zero Python files. Old root `.py` files removed.
   `extra/` scripts updated to import from `backend.*`.
