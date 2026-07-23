"""
Database helper functions used by route handlers.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import AsyncSessionLocal
from backend.models import Call, CallInsight, LocationData, Transcript

logger = logging.getLogger(__name__)


async def save_transcript_to_db(call_sid: str, speaker: str, message: str, translated_message: str = None, language: str = None):
    try:
        async with AsyncSessionLocal() as db:
            transcript = Transcript(
                call_sid=call_sid, speaker=speaker, message=message,
                translated_message=translated_message, language=language, is_final=True,
            )
            db.add(transcript)
            await db.commit()
            logger.info("Saved transcript for %s: %s", call_sid, speaker)
    except Exception as e:
        logger.error("Error saving transcript to DB: %s", e)


async def save_or_update_insights_to_db(call_sid: str, insights_data: dict):
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(CallInsight).where(CallInsight.call_sid == call_sid))
            existing = result.scalar_one_or_none()
            if existing:
                existing.summary = insights_data.get('summary', '')
                existing.location = insights_data.get('location', [])
                existing.persons_described = insights_data.get('persons_described', [])
                existing.additional_info = insights_data.get('additional_info', [])
                existing.incident = insights_data.get('incident', {})
                existing.time_info = insights_data.get('time_info', {})
                existing.protocol_questions = insights_data.get('protocol_questions', [])
            else:
                insight = CallInsight(
                    call_sid=call_sid,
                    summary=insights_data.get('summary', ''),
                    location=insights_data.get('location', []),
                    persons_described=insights_data.get('persons_described', []),
                    additional_info=insights_data.get('additional_info', []),
                    incident=insights_data.get('incident', {}),
                    time_info=insights_data.get('time_info', {}),
                    protocol_questions=insights_data.get('protocol_questions', []),
                )
                db.add(insight)
            await db.commit()
            logger.info("Saved insights for %s", call_sid)
    except Exception as e:
        logger.error("Error saving insights to DB: %s", e)


async def save_location_to_db(call_sid: str, caller_number: str, latitude: float, longitude: float, address: str = None):
    try:
        async with AsyncSessionLocal() as db:
            location = LocationData(
                call_sid=call_sid, caller_number=caller_number,
                latitude=latitude, longitude=longitude, address=address,
            )
            db.add(location)
            await db.commit()
            logger.info("Saved location for %s: %s", call_sid, address)
    except Exception as e:
        logger.error("Error saving location to DB: %s", e)


async def mark_call_ended(call_sid: str):
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Call).where(Call.call_sid == call_sid))
            call = result.scalar_one_or_none()
            if call:
                call.is_live = False
                if call.start_time and call.start_time.tzinfo:
                    call.end_time = datetime.now(timezone.utc)
                else:
                    call.end_time = datetime.now()
                if call.start_time and call.end_time:
                    try:
                        duration = (call.end_time - call.start_time).total_seconds()
                        call.duration = int(duration)
                    except TypeError:
                        call.duration = 0
                await db.commit()
                logger.info("Marked call %s as ended", call_sid)
    except Exception as e:
        logger.error("Error marking call as ended: %s", e)


# ── Agency settings ────────────────────────────────────────────────────────

async def load_settings_db() -> dict:
    from backend.models import AgencySetting
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AgencySetting).limit(1))
        row = result.scalar_one_or_none()

        if not row:
            row = AgencySetting()
            row.call_forward_number = "+918277785093"
            session.add(row)
            await session.commit()
            await session.refresh(row)
            logger.info("Created default AgencySetting row")
        elif row.call_forward_number is None:
            row.call_forward_number = "+918277785093"
            session.add(row)
            await session.commit()
            await session.refresh(row)

        return {
            "call_forward_number": row.call_forward_number,
            "default_translation_language": row.default_translation_language or "en",
            "emergency_hospital": row.emergency_hospital,
            "emergency_police": row.emergency_police,
            "emergency_fire": row.emergency_fire,
        }


async def save_settings_db(new_values: dict) -> dict:
    from backend.models import AgencySetting
    logger.info("Saving settings to database: %s", new_values)
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AgencySetting).limit(1))
        row = result.scalar_one_or_none()
        if not row:
            row = AgencySetting()
            session.add(row)

        if 'call_forward_number' in new_values:
            row.call_forward_number = new_values['call_forward_number']
        if 'default_translation_language' in new_values and new_values['default_translation_language']:
            row.default_translation_language = new_values['default_translation_language']
        if 'emergency_hospital' in new_values:
            row.emergency_hospital = new_values['emergency_hospital']
        if 'emergency_police' in new_values:
            row.emergency_police = new_values['emergency_police']
        if 'emergency_fire' in new_values:
            row.emergency_fire = new_values['emergency_fire']

        await session.commit()
        await session.refresh(row)

        return {
            "call_forward_number": row.call_forward_number,
            "default_translation_language": row.default_translation_language or "en",
            "emergency_hospital": row.emergency_hospital,
            "emergency_police": row.emergency_police,
            "emergency_fire": row.emergency_fire,
        }
