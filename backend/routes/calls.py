"""
Call history, insights, takeover, and audio stream routes.
"""
from __future__ import annotations

import base64
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend import config, state
from backend.database import get_db
from backend.db_helpers import save_or_update_insights_to_db
from backend.models import Call, CallInsight, LocationData, Transcript, LoginLog
from backend.routes.schemas import AudioStreamRequest

# audioop shim
try:
    import audioop  # type: ignore
except ImportError:
    from backend import audio_ops as audioop  # type: ignore

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/audio/stream")
async def stream_audio_from_browser(request: AudioStreamRequest):
    try:
        audio_data = base64.b64decode(request.audio)
        try:
            audio_data = audioop.mul(audio_data, 2, 2.0)
        except Exception as e:
            logger.warning("Could not apply gain boost: %s", e)

        caller_number = request.caller_number
        caller_lang = state.caller_languages.get(caller_number, 'en')
        dispatcher_lang = state.dispatcher_languages.get(caller_number, 'en')
        needs_translation = dispatcher_lang != caller_lang

        if not needs_translation:
            try:
                audio_8khz = audioop.ratecv(audio_data, 2, 1, config.AUDIO_RATE, 8000, None)[0]
            except Exception as e:
                logger.error("Failed to resample audio: %s", e)
                audio_8khz = audio_data
            ulaw_data = audioop.lin2ulaw(audio_8khz, 2)
            ulaw_base64 = base64.b64encode(ulaw_data).decode("utf-8")
            try:
                state.audio_to_phone.put_nowait(ulaw_base64)
            except Exception:
                try:
                    state.audio_to_phone.get_nowait()
                    state.audio_to_phone.put_nowait(ulaw_base64)
                except Exception:
                    pass

        if caller_number in state.browser_transcribers:
            browser_trans = state.browser_transcribers[caller_number].get("browser_transcriber")
            if browser_trans:
                try:
                    browser_trans.stream_audio(audio_data)
                except Exception as e:
                    logger.error("Error streaming to browser transcriber: %s", e)

        return {"status": "success", "message": "Audio queued and transcribed"}
    except ValueError as e:
        logger.error("Invalid audio data: %s", e)
        raise HTTPException(status_code=400, detail="Invalid audio data")
    except Exception as e:
        logger.error("Audio processing error: %s", e)
        raise HTTPException(status_code=500, detail="Audio processing error")


@router.get("/api/calls")
async def get_calls(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Call).order_by(Call.start_time.desc()).limit(50))
        calls = result.scalars().all()
        return {
            "status": "success",
            "calls": [
                {
                    "id": call.id, "call_sid": call.call_sid, "phone": call.caller_number,
                    "to_number": call.to_number, "caller_name": call.caller_name,
                    "language": call.language,
                    "start_time": call.start_time.isoformat() if call.start_time else None,
                    "end_time": call.end_time.isoformat() if call.end_time else None,
                    "duration": call.duration, "is_live": call.is_live,
                    "date": call.start_time.strftime("%m/%d/%y") if call.start_time else "",
                    "time": call.start_time.strftime("%H:%M") if call.start_time else "",
                }
                for call in calls
            ],
        }
    except Exception as e:
        logger.error("Error fetching calls: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/calls/{call_sid}/transcripts")
async def get_call_transcripts(call_sid: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Transcript).where(Transcript.call_sid == call_sid).order_by(Transcript.timestamp.asc())
        )
        transcripts = result.scalars().all()
        return {
            "status": "success",
            "transcripts": [
                {
                    "id": t.id, "speaker": t.speaker, "message": t.message,
                    "translated_message": t.translated_message, "language": t.language,
                    "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                    "time": t.timestamp.strftime("%I:%M %p") if t.timestamp else "",
                }
                for t in transcripts
            ],
        }
    except Exception as e:
        logger.error("Error fetching transcripts for %s: %s", call_sid, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/calls/{call_sid}/insights")
async def get_call_insights(call_sid: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(CallInsight).where(CallInsight.call_sid == call_sid))
        insight = result.scalar_one_or_none()
        if not insight:
            return {"status": "success", "insights": {"summary": "", "location": [], "persons_described": [], "additional_info": [], "incident": {}, "time_info": {}}}
        return {
            "status": "success",
            "insights": {
                "summary": insight.summary or "", "location": insight.location or [],
                "persons_described": insight.persons_described or [], "additional_info": insight.additional_info or [],
                "incident": insight.incident or {}, "time_info": insight.time_info or {},
                "protocol_questions": insight.protocol_questions or [],
            },
        }
    except Exception as e:
        logger.error("Error fetching insights for %s: %s", call_sid, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/calls/{call_sid}/takeover")
async def takeover_call(call_sid: str):
    try:
        logger.info("Takeover requested for call %s", call_sid)
        if call_sid in state.active_transcribers:
            transcriber = state.active_transcribers[call_sid].get("phone_transcriber")
            if transcriber and transcriber.rudra_agent:
                transcriber.rudra_agent.is_active = False
                transcriber.rudra_agent.has_been_transferred = True
                logger.info("AI Agent permanently stopped for call %s", call_sid)
                return {"status": "success", "message": "AI Agent stopped"}
        return {"status": "success", "message": "No active AI agent found, but takeover acknowledged"}
    except Exception as e:
        logger.error("Error taking over call %s: %s", call_sid, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/calls/{call_sid}/insights")
async def save_call_insights(call_sid: str, insights: dict):
    try:
        await save_or_update_insights_to_db(call_sid, insights)
        return {"status": "success", "message": "Insights saved"}
    except Exception as e:
        logger.error("Error saving insights for %s: %s", call_sid, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/calls/{call_sid}/location")
async def get_call_location(call_sid: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(LocationData).where(LocationData.call_sid == call_sid).order_by(LocationData.timestamp.desc())
        )
        location = result.scalars().first()
        if not location:
            return {"status": "success", "location": None}
        return {
            "status": "success",
            "location": {
                "latitude": location.latitude, "longitude": location.longitude,
                "address": location.address,
                "timestamp": location.timestamp.isoformat() if location.timestamp else None,
            },
        }
    except Exception as e:
        logger.error("Error fetching location for %s: %s", call_sid, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/database/clear")
async def clear_database(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(delete(LocationData))
        await db.execute(delete(CallInsight))
        await db.execute(delete(Transcript))
        await db.execute(delete(Call))
        await db.execute(delete(LoginLog))
        await db.commit()
        return {"status": "success", "message": "Database cleared successfully"}
    except Exception as e:
        await db.rollback()
        logger.error("Error clearing database: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))
