"""
Twilio webhook, recordings, and TwiML routes.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import config, state
from backend.database import get_db
from backend.db_helpers import load_settings_db
from backend.models import Call
from backend.routes.schemas import RecordingRequest, RecordingResponse

logger = logging.getLogger(__name__)
router = APIRouter()


def _update_twilio_webhook(domain: str) -> bool:
    if not all([config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN, config.TWILIO_PHONE_NUMBER]):
        logger.warning("Twilio credentials missing; webhook update skipped.")
        return False
    try:
        from twilio.rest import Client
        client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
        webhook_url = f"https://{domain}/twiml"
        numbers = client.incoming_phone_numbers.list(phone_number=config.TWILIO_PHONE_NUMBER)
        if not numbers:
            logger.warning("Phone number %s not found on Twilio account", config.TWILIO_PHONE_NUMBER)
            return False
        client.incoming_phone_numbers(numbers[0].sid).update(voice_url=webhook_url, voice_method="POST")
        logger.info("Twilio webhook updated: %s", webhook_url)
        return True
    except ImportError:
        logger.error("Twilio library not installed")
        return False
    except Exception as e:
        logger.warning("Failed to update Twilio webhook: %s", str(e)[:100])
        return False


def fetch_twilio_recordings(date_str: str, call_sid: Optional[str] = None):
    if not all([config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN]):
        logger.error("Twilio credentials not configured")
        return {"status": "error", "message": "Twilio credentials not configured", "recordings_saved": 0, "recordings": []}

    try:
        from twilio.rest import Client
        client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
        recordings_dir = config.RECORDINGS_DIR
        os.makedirs(recordings_dir, exist_ok=True)

        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        next_date = target_date + timedelta(days=1)
        logger.info("Fetching recordings for date: %s", date_str)

        if call_sid:
            recordings = client.recordings.list(call_sid=call_sid)
        else:
            recordings = client.recordings.list(date_created_after=target_date, date_created_before=next_date)

        saved = []
        for recording in recordings:
            try:
                recording_sid = recording.sid
                call_sid_val = recording.call_sid
                date_created = recording.date_created.strftime("%Y%m%d_%H%M%S")
                duration = recording.duration
                recording_url = f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Recordings/{recording_sid}.wav"
                resp = http_requests.get(recording_url, auth=(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN), timeout=30)
                if resp.status_code == 200:
                    filename = f"twilio_{call_sid_val}_{date_created}.wav"
                    filepath = os.path.join(recordings_dir, filename)
                    with open(filepath, 'wb') as f:
                        f.write(resp.content)
                    logger.info("Saved recording: %s (Duration: %ss)", filename, duration)
                    saved.append({
                        "recording_sid": recording_sid, "call_sid": call_sid_val,
                        "filename": filename, "duration": duration,
                        "date_created": recording.date_created.isoformat(),
                    })
                else:
                    logger.error("Failed to download recording %s: HTTP %s", recording_sid, resp.status_code)
            except Exception as e:
                logger.error("Error processing recording %s: %s", recording.sid, e)
                continue

        return {"status": "success", "message": f"Fetched {len(saved)} recordings for {date_str}", "recordings_saved": len(saved), "recordings": saved}
    except ImportError:
        return {"status": "error", "message": "Twilio library not installed", "recordings_saved": 0, "recordings": []}
    except ValueError as e:
        return {"status": "error", "message": "Invalid date format. Use YYYY-MM-DD", "recordings_saved": 0, "recordings": []}
    except Exception as e:
        logger.error("Error fetching recordings: %s", e)
        return {"status": "error", "message": str(e), "recordings_saved": 0, "recordings": []}


@router.post("/twiml")
async def twiml_endpoint(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        form_data = await request.form()
        From = form_data.get("From")
        if not From:
            From = request.query_params.get("caller_number")
        To = form_data.get("To")
        CallSid = form_data.get("CallSid")
        CallerName = form_data.get("CallerName")
        CallerCity = form_data.get("CallerCity")
        CallerState = form_data.get("CallerState")
        CallerCountry = form_data.get("CallerCountry")

        logger.info("TwiML endpoint - CallSid: %s, From: %s", CallSid, From)

        if CallSid and From:
            state.sessions[CallSid] = {
                "caller_number": From, "to_number": To, "caller_name": CallerName,
                "caller_city": CallerCity, "caller_state": CallerState,
                "caller_country": CallerCountry, "active": False,
            }
            logger.info("Incoming call: %s -> %s", From, To)

            try:
                settings = await load_settings_db()
                default_lang = settings.get("default_translation_language", "en")
                state.caller_languages[From] = default_lang
            except Exception as e:
                logger.error("Error initializing caller language: %s", e)

            try:
                result = await db.execute(
                    select(Call).where(Call.caller_number == From, Call.is_live == True)
                )
                for old_call in result.scalars().all():
                    logger.warning("Stuck live call %s from %s, marking ended", old_call.call_sid, From)
                    old_call.is_live = False
                    if not old_call.end_time:
                        if old_call.start_time and old_call.start_time.tzinfo:
                            from datetime import timezone
                            old_call.end_time = datetime.now(timezone.utc)
                        else:
                            old_call.end_time = datetime.now()

                new_call = Call(
                    call_sid=CallSid, caller_number=From, to_number=To,
                    caller_name=CallerName, caller_city=CallerCity,
                    caller_state=CallerState, caller_country=CallerCountry,
                    language="English", is_live=True,
                )
                db.add(new_call)
                await db.commit()
                logger.info("Call %s saved to database", CallSid)
            except Exception as e:
                logger.error("Error saving call to database: %s", e)
                await db.rollback()

        ws_url = getattr(request.app.state, 'ws_url', state.ws_url)
        xml_response = f"""<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Connect>
            <Stream url="{ws_url}">
              <Parameter name="track" value="both_tracks" />
              <Parameter name="caller_number" value="{From}" />
            </Stream>
          </Connect>
        </Response>"""
        return Response(content=xml_response, media_type="text/xml")
    except Exception as e:
        logger.error("Error in twiml endpoint: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/recordings/fetch", response_model=RecordingResponse)
async def fetch_recordings(request: RecordingRequest):
    result = fetch_twilio_recordings(request.date, request.call_sid)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return RecordingResponse(**result)


@router.get("/recordings/fetch/{date}")
async def fetch_recordings_by_date(date: str, call_sid: Optional[str] = None):
    result = fetch_twilio_recordings(date, call_sid)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result
