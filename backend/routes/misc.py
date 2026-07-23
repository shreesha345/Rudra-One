"""
Misc routes: root, health, login, analytics chat.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import config, state
from backend.database import get_db
from backend.models import User, LoginLog
from backend.routes.schemas import HealthResponse, LoginRequest, AnalyticsRequest
from backend.agents.analytics import RudraAnalyst

logger = logging.getLogger(__name__)
router = APIRouter()

rudra_analyst = RudraAnalyst()


@router.get("/")
async def root(request: Request):
    public_url = getattr(request.app.state, 'public_url', None)
    if not public_url:
        public_url = state.public_url or f"http://localhost:{config.PORT}"
        if public_url and not public_url.startswith("http"):
            public_url = f"https://{public_url}"
    return {
        "status": "online",
        "service": "RudraOne API",
        "public_url": public_url,
    }


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        environment=config.ENVIRONMENT,
        deepgram_configured=bool(config.DEEPGRAM_API_KEY),
        twilio_configured=bool(config.TWILIO_ACCOUNT_SID and config.TWILIO_AUTH_TOKEN),
    )


@router.post("/api/login")
async def login(request: Request, login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    ip = request.client.host
    user_agent = request.headers.get("user-agent")

    result = await db.execute(select(User).where(User.username == login_data.username))
    user = result.scalar_one_or_none()

    success = bool(user and user.password == login_data.password)

    log = LoginLog(username=login_data.username, ip_address=ip, user_agent=user_agent, success=success)
    db.add(log)
    await db.commit()

    if success:
        return {"message": "Login successful", "agent_id": user.username}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/api/analytics/chat")
async def analytics_chat(request: AnalyticsRequest):
    try:
        response = await asyncio.to_thread(rudra_analyst.chat, request.message)
        return response
    except Exception as e:
        logger.error("Analytics error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
