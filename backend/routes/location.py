"""
Location routes — receive location data, serve location page.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import config, state
from backend.database import get_db, AsyncSessionLocal
from backend.db_helpers import save_location_to_db
from backend.models import Call, CallInsight, LocationData
from backend.routes.schemas import LocationDataRequest
from backend.services.transcriber import convert_and_queue_ai_audio
from backend.stations import get_nearest_station

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/location-request")
async def get_location_page(id: str = None, caller: str = None):
    logger.info("Location page requested: id=%s, caller=%s", id, caller)
    return FileResponse("frontend/public/location.html")


@router.post("/api/location-request")
async def create_location_request(caller_number: str, call_sid: str = None):
    request_id = str(uuid.uuid4())[:8]
    state.location_requests[request_id] = {
        "caller_number": caller_number, "call_sid": call_sid,
        "timestamp": datetime.now().isoformat(), "status": "pending",
    }
    logger.info("Created location request: %s for %s", request_id, caller_number)
    public_url = getattr(state, "public_url", f"http://localhost:{config.PORT}")
    if public_url and public_url.endswith('/'):
        public_url = public_url[:-1]
    link = f"{public_url}/location-request?id={request_id}"
    return {"request_id": request_id, "link": link}


@router.post("/location")
async def receive_location(data: LocationDataRequest, db: AsyncSession = Depends(get_db)):
    logger.info("Received location: Lat=%s, Lon=%s, Caller=%s, RequestID=%s", data.latitude, data.longitude, data.caller_number, data.request_id)

    caller_number = data.caller_number
    if data.request_id and data.request_id in state.location_requests:
        req_data = state.location_requests[data.request_id]
        caller_number = req_data.get("caller_number") or caller_number
        state.location_requests[data.request_id]["status"] = "completed"

    # Find call_sid
    call_sid = None
    input_number_clean = ''.join(filter(str.isdigit, caller_number)) if caller_number else ""

    # 1. Active sessions
    for sid, session in state.sessions.items():
        session_number = session.get("caller_number", "")
        session_number_clean = ''.join(filter(str.isdigit, session_number))
        if session_number == data.caller_number or \
           (input_number_clean and session_number_clean and len(input_number_clean) >= 10 and len(session_number_clean) >= 10 and input_number_clean[-10:] == session_number_clean[-10:]):
            call_sid = sid
            break

    # 2. Active transcribers
    if not call_sid:
        for sid, transcriber_data in state.active_transcribers.items():
            phone_transcriber = transcriber_data.get("phone_transcriber")
            if phone_transcriber and phone_transcriber.caller_number:
                t_clean = ''.join(filter(str.isdigit, phone_transcriber.caller_number))
                if t_clean and input_number_clean and len(t_clean) >= 10 and len(input_number_clean) >= 10 and t_clean[-10:] == input_number_clean[-10:]:
                    call_sid = sid
                    break

    # 3. Database
    if not call_sid:
        try:
            result = await db.execute(
                select(Call).where(Call.caller_number == data.caller_number).order_by(Call.start_time.desc()).limit(1)
            )
            recent_call = result.scalars().first()
            if recent_call:
                call_sid = recent_call.call_sid
        except Exception as e:
            logger.error("Error finding call in database: %s", e)

    if not call_sid:
        logger.warning("No call_sid found for caller %s", data.caller_number)

    if call_sid and data.caller_number:
        asyncio.create_task(save_location_to_db(call_sid, data.caller_number, data.latitude, data.longitude, None))

        if call_sid in state.active_transcribers:
            transcriber_data = state.active_transcribers[call_sid]
            phone_transcriber = transcriber_data.get("phone_transcriber")

            if phone_transcriber and hasattr(phone_transcriber, "rudra_agent") and phone_transcriber.rudra_agent:
                address = f"Latitude: {data.latitude}, Longitude: {data.longitude}"
                try:
                    headers = {'User-Agent': 'RudraOne/1.0'}
                    url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={data.latitude}&lon={data.longitude}&zoom=18&addressdetails=1"
                    async with aiohttp.ClientSession() as session:
                        async with session.get(url, headers=headers) as resp:
                            if resp.status == 200:
                                geo_data = await resp.json()
                                display_name = geo_data.get('display_name')
                                if display_name:
                                    address = display_name
                except Exception as e:
                    logger.error("Server-side geocoding failed: %s", e)

                confirmation_text = "I have received your location."
                lang = state.caller_languages.get(data.caller_number, "en")

                phone_transcriber.rudra_agent.receive_location_update(address, lang)

                await convert_and_queue_ai_audio(confirmation_text, lang, data.caller_number, call_sid)

                try:
                    ai_response_text, transferred, _ = await asyncio.to_thread(phone_transcriber.rudra_agent.process_system_event)
                    if ai_response_text:
                        logger.info("AI post-location response: %s", ai_response_text)
                        await convert_and_queue_ai_audio(ai_response_text, lang, data.caller_number, call_sid)
                        await phone_transcriber.broadcast_to_clients({
                            "speaker": "AI Agent", "message": ai_response_text,
                            "timestamp": datetime.now().isoformat(), "caller_number": data.caller_number,
                            "is_final": True, "type": "transcription", "language": lang, "translation_needed": False,
                        })
                        await phone_transcriber.buffer_transcript("AI Agent", ai_response_text, None, lang)
                        if transferred:
                            await phone_transcriber.broadcast_to_clients({
                                "type": "ai_transfer", "reason": "Location received and emergency confirmed",
                                "timestamp": datetime.now().isoformat(),
                            })
                except Exception as e:
                    logger.error("Error generating AI response after location: %s", e)

                await phone_transcriber.broadcast_to_clients({
                    "speaker": "AI Agent", "message": confirmation_text,
                    "timestamp": datetime.now().isoformat(), "caller_number": data.caller_number,
                    "is_final": True, "type": "transcription", "language": lang, "translation_needed": False,
                })
                await phone_transcriber.buffer_transcript("AI Agent", confirmation_text, None, lang)
                phone_transcriber.rudra_agent.chat_history.append({"role": "assistant", "content": confirmation_text})
            else:
                logger.warning("RudraAgent not found for call_sid %s", call_sid)

    # Broadcast to notification clients
    dispatch_proposal = None
    if call_sid:
        try:
            result = await db.execute(select(CallInsight).where(CallInsight.call_sid == call_sid))
            insight = result.scalar_one_or_none()
            emergency_type = "police"
            incident_summary = "Emergency reported"
            if insight and insight.incident:
                incident_type = insight.incident.get("type", "").lower()
                if "fire" in incident_type:
                    emergency_type = "fire"
                elif "medical" in incident_type or "health" in incident_type or "ambulance" in incident_type:
                    emergency_type = "hospital"
                incident_summary = insight.summary or incident_summary
            nearest = get_nearest_station(data.latitude, data.longitude, emergency_type)
            if nearest:
                dispatch_proposal = {
                    "type": "dispatch_proposal", "call_sid": call_sid, "caller_number": data.caller_number,
                    "location": {"latitude": data.latitude, "longitude": data.longitude, "address": nearest.get("address", "Unknown location")},
                    "emergency_type": emergency_type, "suggested_station": nearest,
                    "incident_summary": incident_summary, "timestamp": datetime.now().isoformat(),
                }
        except Exception as e:
            logger.error("Error generating dispatch proposal: %s", e)

    for client in state.notification_clients:
        try:
            await client.send_json({
                "type": "location_update",
                "location": {"latitude": data.latitude, "longitude": data.longitude, "accuracy": data.accuracy, "caller_number": data.caller_number, "call_sid": call_sid},
                "timestamp": datetime.now().isoformat(),
            })
            if dispatch_proposal:
                await client.send_json(dispatch_proposal)
        except Exception as e:
            logger.error("Failed to send location/dispatch to client: %s", e)

    return {"status": "success", "message": "Location received", "call_sid": call_sid}
