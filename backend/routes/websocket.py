"""
WebSocket routes — notifications, transcription clients, and the main
Twilio Media Stream endpoint.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend import config, state
from backend.agents.rudra_agent import RudraAgent
from backend.db_helpers import mark_call_ended
from backend.services.transcriber import DeepgramRealtimeTranscriber
from backend.services.audio import save_recordings

# audioop shim
try:
    import audioop  # type: ignore
except ImportError:
    from backend import audio_ops as audioop  # type: ignore

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/ws/status")
async def websocket_status():
    return {
        "status": "available",
        "notification_clients": len(state.notification_clients),
        "transcription_sessions": len(state.transcription_clients),
        "active_calls": len([s for s in state.sessions.values() if s.get("active")]),
        "caller_languages": dict(state.caller_languages),
        "timestamp": datetime.now().isoformat(),
    }


@router.websocket("/client/notifications")
async def notification_websocket(websocket: WebSocket):
    await websocket.accept()
    state.notification_clients.add(websocket)
    logger.info("Notification client connected (total: %d)", len(state.notification_clients))

    try:
        await websocket.send_json({"type": "connected", "timestamp": datetime.now().isoformat(), "message": "Connected to call notifications"})
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                try:
                    message = json.loads(data)
                    if message.get("type") == "address_update":
                        call_sid = message.get("call_sid")
                        address = message.get("address")
                        if call_sid and address:
                            logger.info("Address update for %s: %s", call_sid, address)
                            if call_sid in state.active_transcribers:
                                transcriber_data = state.active_transcribers[call_sid]
                                phone_transcriber = transcriber_data.get("phone_transcriber")
                                if phone_transcriber and hasattr(phone_transcriber, "rudra_agent") and phone_transcriber.rudra_agent:
                                    phone_transcriber.rudra_agent.receive_location_update(address)
                except json.JSONDecodeError:
                    pass
                except Exception as e:
                    logger.error("Error processing notification message: %s", e)
                await websocket.send_json({"type": "keepalive", "timestamp": datetime.now().isoformat()})
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "keepalive", "timestamp": datetime.now().isoformat()})
    except WebSocketDisconnect:
        state.notification_clients.discard(websocket)
        logger.info("Notification client disconnected (remaining: %d)", len(state.notification_clients))
    except Exception as e:
        logger.error("Error in notification websocket: %s", e)
        state.notification_clients.discard(websocket)


@router.websocket("/client/{caller_number}")
async def transcription_websocket(websocket: WebSocket, caller_number: str):
    await websocket.accept()
    if caller_number not in state.transcription_clients:
        state.transcription_clients[caller_number] = set()
    state.transcription_clients[caller_number].add(websocket)
    logger.info("Transcription client connected for %s", caller_number)

    try:
        await websocket.send_json({"type": "connected", "caller_number": caller_number, "timestamp": datetime.now().isoformat(), "message": f"Connected to transcription stream for {caller_number}"})
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                try:
                    message = json.loads(data)
                    if message.get("type") == "stop_ai":
                        logger.info("Received stop_ai command for %s", caller_number)
                        if caller_number in state.active_transcribers:
                            transcriber = state.active_transcribers[caller_number].get("phone_transcriber")
                            if transcriber and transcriber.rudra_agent:
                                transcriber.rudra_agent.call_transferred = True
                                transcriber.rudra_agent.is_active = False
                                transcriber.rudra_agent.has_been_transferred = True
                                await websocket.send_json({"type": "ai_stopped", "timestamp": datetime.now().isoformat()})
                except json.JSONDecodeError:
                    pass
                except Exception as e:
                    logger.error("Error processing message: %s", e)
                await websocket.send_json({"type": "keepalive", "timestamp": datetime.now().isoformat()})
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "keepalive", "timestamp": datetime.now().isoformat()})
    except WebSocketDisconnect:
        state.transcription_clients[caller_number].discard(websocket)
        if not state.transcription_clients.get(caller_number):
            state.transcription_clients.pop(caller_number, None)
    except Exception as e:
        logger.error("Error in transcription websocket: %s", e)
        state.transcription_clients[caller_number].discard(websocket)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint for Twilio audio streaming."""
    await websocket.accept()
    call_sid = None
    stream_sid = None
    caller_number = None

    async def send_audio_to_phone():
        packet_count = 0
        try:
            while True:
                try:
                    if not state.audio_to_phone.empty():
                        audio_payload = state.audio_to_phone.get_nowait()
                        message = {"event": "media", "streamSid": stream_sid, "media": {"payload": audio_payload, "track": "outbound"}}
                        await websocket.send_text(json.dumps(message))
                        packet_count += 1
                    else:
                        await asyncio.sleep(0.0005)
                except Exception as e:
                    logger.error("Error sending audio to Twilio: %s", e)
                    break
        except asyncio.CancelledError:
            pass

    send_task = None

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["event"] == "start":
                call_sid = message["start"]["callSid"]
                stream_sid = message["start"]["streamSid"]
                custom_params = message["start"].get("customParameters", {})

                caller_number = "unknown"
                if "caller_number" in custom_params:
                    caller_number = custom_params["caller_number"]
                elif call_sid in state.sessions:
                    caller_number = state.sessions[call_sid].get("caller_number", "unknown")

                if call_sid in state.sessions:
                    state.sessions[call_sid]["active"] = True
                    state.sessions[call_sid]["stream_sid"] = stream_sid
                    if caller_number != "unknown":
                        state.sessions[call_sid]["caller_number"] = caller_number
                else:
                    state.sessions[call_sid] = {"active": True, "stream_sid": stream_sid, "caller_number": caller_number}

                logger.info("Call stream started from %s (ID: %s)", caller_number, call_sid)

                # Notify notification clients
                notification_message = {"type": "call_started", "caller_number": caller_number, "call_sid": call_sid, "timestamp": datetime.now().isoformat()}
                for client in list(state.notification_clients):
                    try:
                        await client.send_json(notification_message)
                    except Exception as e:
                        logger.error("Failed to notify client: %s", e)
                        state.notification_clients.discard(client)

                # Start Deepgram transcribers
                if config.DEEPGRAM_API_KEY:
                    loop = asyncio.get_event_loop()

                    browser_transcriber = DeepgramRealtimeTranscriber("DISPATCH", caller_number, loop, call_sid)
                    asyncio.create_task(browser_transcriber.connect())
                    state.browser_transcribers[caller_number] = {"browser_transcriber": browser_transcriber}

                    public_url = getattr(websocket.app.state, "public_url", None)
                    rudra_agent = RudraAgent(caller_number, call_sid, public_url=public_url)

                    # Check for existing location in DB
                    try:
                        from backend.database import AsyncSessionLocal
                        from backend.models import LocationData
                        from sqlalchemy import select
                        async with AsyncSessionLocal() as db:
                            result = await db.execute(
                                select(LocationData).where(LocationData.caller_number == caller_number).order_by(LocationData.timestamp.desc()).limit(1)
                            )
                            location_data = result.scalars().first()
                            if location_data:
                                address = location_data.address or f"Lat: {location_data.latitude}, Lon: {location_data.longitude}"
                                rudra_agent.receive_location_update(address)
                    except Exception as e:
                        logger.error("Error checking existing location: %s", e)

                    phone_transcriber = DeepgramRealtimeTranscriber("CALLER", caller_number, loop, call_sid, rudra_agent=rudra_agent)
                    asyncio.create_task(phone_transcriber.connect())
                    state.active_transcribers[call_sid] = {"phone_transcriber": phone_transcriber}

                    logger.info("LIVE transcription active (Browser + Phone)")

                    # Initial greeting
                    greeting = "I am a 112 Emergency AI system and I am here to assist you."
                    await phone_transcriber.broadcast_to_clients({
                        "speaker": "AI Agent", "message": greeting, "timestamp": datetime.now().isoformat(),
                        "caller_number": caller_number, "is_final": True, "type": "transcription", "language": "en", "translation_needed": False,
                    })
                    await phone_transcriber.buffer_transcript("AI Agent", greeting, None, "en")

                    # Play pre-recorded greeting
                    try:
                        with open("static/greeting_twilio.bin", "rb") as f:
                            ulaw_data = f.read()
                        chunk_size = 160
                        for i in range(0, len(ulaw_data), chunk_size):
                            chunk = ulaw_data[i:i + chunk_size]
                            if len(chunk) == chunk_size:
                                state.audio_to_phone.put_nowait(base64.b64encode(chunk).decode("utf-8"))

                        if caller_number in state.transcription_clients:
                            with open("static/greeting_browser.bin", "rb") as f:
                                pcm_16khz = f.read()
                            payload_16khz = base64.b64encode(pcm_16khz).decode("utf-8")
                            audio_message = {"type": "audio", "audio": payload_16khz, "sample_rate": 16000, "encoding": "pcm16", "timestamp": datetime.now().isoformat(), "call_sid": call_sid, "speaker": "AI Agent"}
                            for client in list(state.transcription_clients[caller_number]):
                                try:
                                    await client.send_json(audio_message)
                                except Exception:
                                    pass
                    except Exception as e:
                        logger.error("Failed to play pre-recorded greeting: %s", e)
                        from backend.services.transcriber import convert_and_queue_ai_audio
                        await convert_and_queue_ai_audio(greeting, "en", caller_number, call_sid)
                else:
                    logger.warning("Transcription disabled (no Deepgram API key)")

                send_task = asyncio.create_task(send_audio_to_phone())

            elif message["event"] == "media":
                media = message["media"]
                track = media.get("track", "inbound")
                if track == "inbound":
                    payload = media.get("payload")
                    if payload:
                        try:
                            ulaw_data = base64.b64decode(payload)
                            pcm_data_8khz = audioop.ulaw2lin(ulaw_data, 2)
                            try:
                                pcm_data_16khz, _ = audioop.ratecv(pcm_data_8khz, 2, 1, 8000, 16000, None)
                            except Exception as e:
                                logger.warning("ratecv failed, using sample-repetition upsampling fallback: %s", e)
                                # Properly duplicate each 2-byte (16-bit) sample to double the rate from 8kHz to 16kHz
                                pcm_data_16khz = b"".join(
                                    pcm_data_8khz[i : i + 2] + pcm_data_8khz[i : i + 2]
                                    for i in range(0, len(pcm_data_8khz), 2)
                                )

                            try:
                                with state.recording_lock:
                                    state.phone_audio_recording.append(pcm_data_16khz)
                            except Exception:
                                pass

                            if call_sid in state.active_transcribers:
                                phone_trans = state.active_transcribers[call_sid].get("phone_transcriber")
                                if phone_trans:
                                    phone_trans.stream_audio(pcm_data_16khz)

                            if caller_number in state.transcription_clients:
                                payload_16khz = base64.b64encode(pcm_data_16khz).decode("utf-8")
                                audio_message = {"type": "audio", "audio": payload_16khz, "sample_rate": config.AUDIO_RATE, "encoding": "pcm16", "timestamp": datetime.now().isoformat(), "call_sid": call_sid, "speaker": "Caller"}
                                for client in list(state.transcription_clients[caller_number]):
                                    try:
                                        await client.send_json(audio_message)
                                    except Exception as e:
                                        logger.error("Failed to send audio to browser: %s", e)
                                        state.transcription_clients[caller_number].discard(client)
                        except Exception as e:
                            logger.error("Error handling inbound media: %s", e)

            elif message["event"] == "stop":
                logger.info("Call ended from %s", caller_number)
                if call_sid:
                    await mark_call_ended(call_sid)

                notification_message = {"type": "call_ended", "caller_number": caller_number, "call_sid": call_sid, "timestamp": datetime.now().isoformat()}
                for client in list(state.notification_clients):
                    try:
                        await client.send_json(notification_message)
                    except Exception as e:
                        logger.error("Failed to notify client: %s", e)
                        state.notification_clients.discard(client)

                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                if call_sid in state.active_transcribers:
                    phone = state.active_transcribers[call_sid].get("phone_transcriber")
                    if phone:
                        asyncio.create_task(phone.stop())
                    del state.active_transcribers[call_sid]
                if caller_number in state.browser_transcribers:
                    browser = state.browser_transcribers[caller_number].get("browser_transcriber")
                    if browser:
                        asyncio.create_task(browser.stop())
                    del state.browser_transcribers[caller_number]

                for d in (state.caller_languages, state.dispatcher_languages, state.dispatcher_should_translate):
                    d.pop(caller_number, None)

                if send_task:
                    send_task.cancel()
                break

    except WebSocketDisconnect:
        logger.info("WebSocket closed for call %s", call_sid)
        _cleanup_call(call_sid, caller_number, send_task)
    except Exception as e:
        logger.error("Error in websocket endpoint: %s", e)
        _cleanup_call(call_sid, caller_number, send_task)


def _cleanup_call(call_sid, caller_number, send_task):
    if call_sid and call_sid in state.active_transcribers:
        transcribers = state.active_transcribers[call_sid]
        if transcribers.get("phone_transcriber"):
            asyncio.create_task(transcribers["phone_transcriber"].stop())
        del state.active_transcribers[call_sid]
    if caller_number and caller_number in state.browser_transcribers:
        transcribers = state.browser_transcribers[caller_number]
        if transcribers.get("browser_transcriber"):
            asyncio.create_task(transcribers["browser_transcriber"].stop())
        del state.browser_transcribers[caller_number]
    for d in (state.caller_languages, state.dispatcher_languages, state.dispatcher_should_translate):
        d.pop(caller_number, None)
    if send_task:
        send_task.cancel()
    if call_sid and call_sid in state.sessions:
        state.sessions.pop(call_sid, None)
