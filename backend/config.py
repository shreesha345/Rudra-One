"""
Centralized configuration for the RudraOne backend.
All environment variables are read here once and exposed as typed constants.
"""
import os
from dotenv import load_dotenv

load_dotenv()


def _get_bool(key: str, default: bool = False) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def _get_int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except (ValueError, TypeError):
        return default


# ── General ──────────────────────────────────────────────────────────────────
PORT = _get_int("PORT", 8000)
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "")

# ── Default login (seeded on first run) ───────────────────────────────────────
DEFAULT_USERNAME = os.getenv("DEFAULT_USERNAME", "Shreesha")
DEFAULT_PASSWORD = os.getenv("DEFAULT_PASSWORD", "Shreesha123admin")

# ── Database ──────────────────────────────────────────────────────────────────
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "rudraone")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql+asyncpg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:5432/{POSTGRES_DB}",
)

# ── LLM (OpenAI-compatible) ───────────────────────────────────────────────────
# A single OpenAI-compatible endpoint powers the agent, analytics, training,
# and SMS formatting.  Works with OpenAI, Azure OpenAI, Ollama, vLLM, LM Studio,
# Groq, Together, OpenRouter, DeepSeek, etc.
LLM_API_KEY = os.getenv("LLM_API_KEY", os.getenv("OPENAI_API_KEY", ""))
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.7"))
LLM_MAX_TOKENS = _get_int("LLM_MAX_TOKENS", 150)
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))

# Analytics LLM can use a different model (e.g. cheaper/faster for code-gen)
ANALYTICS_LLM_MODEL = os.getenv("ANALYTICS_LLM_MODEL", LLM_MODEL)
ANALYTICS_LLM_TEMPERATURE = float(os.getenv("ANALYTICS_LLM_TEMPERATURE", "0"))

# Training LLM can also be configured separately
TRAINING_LLM_MODEL = os.getenv("TRAINING_LLM_MODEL", LLM_MODEL)

# ── Deepgram (speech-to-text) ─────────────────────────────────────────────────
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
DEEPGRAM_MODEL = os.getenv("DEEPGRAM_MODEL", "nova-3-general")

# ── Twilio (phone system) ──────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID") or os.getenv("VITE_TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN") or os.getenv("VITE_TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER") or os.getenv("VITE_TWILIO_PHONE_NUMBER")

# ── ElevenLabs (TTS) ───────────────────────────────────────────────────────────
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY") or os.getenv("VITE_ELEVENLABS_API_KEY")
ELEVENLABS_VOICE = os.getenv("ELEVENLABS_VOICE", "pNInz6obpgDQGcFmaJgB")

# ── Sarvam AI (TTS for Indian languages) ──────────────────────────────────────
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

# ── Cloudflare Tunnel ──────────────────────────────────────────────────────────
# Replaces ngrok.  Set TUNNEL_TOKEN to use a named tunnel, or leave empty to
# use a quick tunnel (ephemeral URL, no account required).
TUNNEL_TOKEN = os.getenv("TUNNEL_TOKEN", "")
TUNNEL_URL = os.getenv("TUNNEL_URL", "")  # Pre-known tunnel hostname (optional)

# ── Audio ──────────────────────────────────────────────────────────────────────
AUDIO_RATE = _get_int("AUDIO_RATE", 16000)
AUDIO_CHANNELS = 1
AUDIO_CHUNK = 320

# ── Recordings ─────────────────────────────────────────────────────────────────
RECORDINGS_DIR = os.getenv("RECORDINGS_DIR", "recordings")
TRANSCRIPTS_DIR = os.getenv("TRANSCRIPTS_DIR", "transcripts")
