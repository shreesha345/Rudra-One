"""
Shared mutable state used across the backend.

Keeping this in one module avoids circular imports and makes it easy to
reset state during tests.
"""
from __future__ import annotations

import threading
from queue import Queue
from typing import Dict, Set

from backend import config

# ── Audio ──────────────────────────────────────────────────────────────────────
phone_audio_recording: list[bytes] = []
recording_lock = threading.Lock()
audio_to_phone: "Queue[str]" = Queue(maxsize=500)

# ── Sessions ───────────────────────────────────────────────────────────────────
sessions: Dict[str, dict] = {}
transcription_clients: Dict[str, Set] = {}
notification_clients: Set = set()
active_transcribers: Dict[str, dict] = {}
browser_transcribers: Dict[str, dict] = {}
location_requests: Dict[str, dict] = {}

# ── Language state ────────────────────────────────────────────────────────────
caller_languages: Dict[str, str] = {}
dispatcher_languages: Dict[str, str] = {}
dispatcher_should_translate: Dict[str, bool] = {}

# ── Training state ────────────────────────────────────────────────────────────
training_sessions: Dict[str, dict] = {}
training_scenarios: list = []
training_client = None  # UnifiedTrainingClient instance

# ── Public URL (set by lifespan) ──────────────────────────────────────────────
ws_url: str | None = None
public_domain: str | None = None
public_url: str | None = None
