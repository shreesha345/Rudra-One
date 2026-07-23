"""
FastAPI application factory — wires up middleware, lifespan, and routes.
"""
from __future__ import annotations

import asyncio
import logging
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import select

from backend import config, state
from backend.database import init_db, AsyncSessionLocal
from backend.models import Call, User
from backend.services.tunnel import start_tunnel, stop_tunnel
from backend.services.training import load_scenarios, get_training_client
from backend.services.audio import save_recordings
from backend.routes.twilio import _update_twilio_webhook
from backend.signoz_seeder import seed_signoz_metadata

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    # ── Startup ────────────────────────────────────────────────────────────
    logger.info("Starting RudraOne server (Browser-only audio mode)...")

    # Database init + seed
    try:
        await init_db()
        logger.info("Database initialized")
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).where(User.username == config.DEFAULT_USERNAME))
            if not result.scalar_one_or_none():
                session.add(User(username=config.DEFAULT_USERNAME, password=config.DEFAULT_PASSWORD))
                await session.commit()
                logger.info("Default user seeded: %s", config.DEFAULT_USERNAME)

            # Fix stuck live calls
            result = await session.execute(select(Call).where(Call.is_live == True))
            stuck = result.scalars().all()
            if stuck:
                logger.info("Fixing %d stuck live calls...", len(stuck))
                for call in stuck:
                    call.is_live = False
                    if not call.end_time:
                        call.end_time = datetime.now(timezone.utc) if (call.start_time and call.start_time.tzinfo) else datetime.now()
                    if call.start_time and call.end_time and not call.duration:
                        try:
                            call.duration = int((call.end_time - call.start_time).total_seconds())
                        except TypeError:
                            call.duration = 0
                await session.commit()
        
        # Auto-seed SigNoz metastore
        await seed_signoz_metadata()

    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
        logger.error(
            "  Make sure PostgreSQL is running:  docker compose up -d postgres"
        )

    # Training system
    try:
        state.training_scenarios = load_scenarios("911_calls.json")
        state.training_client = get_training_client()
        if state.training_client:
            logger.info("Training system initialized with %d scenarios", len(state.training_scenarios))
        else:
            state.training_scenarios = []
    except Exception as e:
        logger.error("Failed to initialize training system: %s", e)
        state.training_scenarios = []

    # Cloudflare Tunnel (replaces ngrok)
    domain = config.TUNNEL_URL
    if not domain and config.ENVIRONMENT == "development":
        domain = start_tunnel(config.PORT)

    is_public = bool(domain) and not domain.startswith("localhost")

    if not domain:
        domain = f"localhost:{config.PORT}"

    state.public_domain = domain
    state.ws_url = f"wss://{domain}/ws" if is_public else f"ws://{domain}/ws"
    app.state.ws_url = state.ws_url
    app.state.domain = domain

    if not is_public:
        app.state.public_url = f"http://{domain}"
        state.public_url = f"http://{domain}"
    elif not domain.startswith("http"):
        app.state.public_url = f"https://{domain}"
        state.public_url = f"https://{domain}"
    else:
        app.state.public_url = domain
        state.public_url = domain

    logger.info("WebSocket URL: %s", state.ws_url)
    logger.info("Public URL: %s", state.public_url)

    # Update Twilio webhook — only when we have a real public URL
    # (Twilio rejects localhost and http URLs)
    if is_public and config.TWILIO_ACCOUNT_SID and config.TWILIO_AUTH_TOKEN:
        _update_twilio_webhook(domain)
    elif config.TWILIO_ACCOUNT_SID:
        logger.warning(
            "Skipping Twilio webhook update — no public tunnel URL. "
            "Install cloudflared or set TUNNEL_TOKEN/TUNNEL_URL in .env "
            "to enable incoming calls."
        )

    logger.info("Server ready on port %s", config.PORT)
    yield

    # ── Shutdown ───────────────────────────────────────────────────────────
    logger.info("Shutting down server...")
    stop_tunnel()

    # Stop transcribers
    for transcribers in list(state.active_transcribers.values()):
        if transcribers.get("phone_transcriber"):
            try:
                await transcribers["phone_transcriber"].stop()
            except Exception as e:
                logger.error("Error stopping phone transcriber: %s", e)
    for transcribers in list(state.browser_transcribers.values()):
        if transcribers.get("browser_transcriber"):
            try:
                await transcribers["browser_transcriber"].stop()
            except Exception as e:
                logger.error("Error stopping browser transcriber: %s", e)

    save_recordings(state.phone_audio_recording, state.recording_lock)
    logger.info("Server shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title="RudraOne API",
        description="Real-time voice call transcription, AI agent, and emergency dispatch",
        version="2.0.0",
        lifespan=lifespan,
        docs_url="/docs" if config.ENVIRONMENT == "development" else None,
        redoc_url="/redoc" if config.ENVIRONMENT == "development" else None,
    )

    # Initialize OpenTelemetry telemetry & instrumentation
    from backend.telemetry import init_telemetry
    init_telemetry(app)

    # Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    if config.ENVIRONMENT == "production":
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["*"] if not config.ALLOWED_HOSTS else config.ALLOWED_HOSTS.split(","),
        )

    # Register routers
    from backend.routes.misc import router as misc_router
    from backend.routes.twilio import router as twilio_router
    from backend.routes.training import router as training_router
    from backend.routes.location import router as location_router
    from backend.routes.sms import router as sms_router
    from backend.routes.calls import router as calls_router
    from backend.routes.settings import router as settings_router
    from backend.routes.websocket import router as ws_router

    app.include_router(misc_router)
    app.include_router(twilio_router)
    app.include_router(training_router)
    app.include_router(location_router)
    app.include_router(sms_router)
    app.include_router(calls_router)
    app.include_router(settings_router)
    app.include_router(ws_router)

    return app
