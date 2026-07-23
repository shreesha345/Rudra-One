"""
Deepgram realtime transcriber — connects to the Deepgram WebSocket API,
sends audio, receives transcripts, and dispatches them to translation,
TTS, and AI agent handlers.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Optional

import websockets

from backend import config, state
from backend.database import AsyncSessionLocal
from backend.models import Transcript
from backend.agents.rudra_agent import RudraAgent
from backend.services.translation import detect_language_from_text, translate_text
from backend.services.tts import text_to_speech_hybrid, text_to_speech_elevenlabs
from backend.services.audio import process_audio_for_clients

logger = logging.getLogger(__name__)

# audioop shim
try:
    import audioop  # type: ignore
except ImportError:
    from backend import audio_ops as audioop  # type: ignore


async def convert_and_queue_translated_audio(text: str, language_code: str, caller_number: str, call_sid: str = None):
    """Convert translated text to speech and queue it for phone delivery."""
    try:
        audio_mp3 = await text_to_speech_hybrid(text, language_code)
        if not audio_mp3:
            logger.warning("Failed to generate audio, skipping")
            return

        processed = await asyncio.to_thread(process_audio_for_clients, audio_mp3)

        # Send to browser
        if caller_number in state.transcription_clients and processed["browser_audio"]:
            audio_message = {
                "type": "audio",
                "audio": processed["browser_audio"],
                "sample_rate": 16000,
                "encoding": "pcm16",
                "timestamp": datetime.now().isoformat(),
                "call_sid": call_sid,
                "speaker": "Dispatch (Translated)",
            }
            for client in list(state.transcription_clients[caller_number]):
                try:
                    await client.send_json(audio_message)
                except Exception as e:
                    logger.error("Failed to send translated audio to browser: %s", e)
                    state.transcription_clients[caller_number].discard(client)

        # Queue for phone
        chunks = processed["phone_chunks"]
        if chunks:
            logger.info("Queueing %d audio chunks for %s (%s)", len(chunks), caller_number, language_code)
            for chunk_base64 in chunks:
                try:
                    state.audio_to_phone.put_nowait(chunk_base64)
                except Exception:
                    try:
                        state.audio_to_phone.get_nowait()
                        state.audio_to_phone.put_nowait(chunk_base64)
                    except Exception:
                        pass
    except Exception as e:
        logger.error("Error in convert_and_queue_translated_audio: %s", e)


async def convert_and_queue_ai_audio(text: str, language_code: str, caller_number: str, call_sid: str = None):
    """Convert AI text to speech using ElevenLabs and queue it for phone delivery."""
    try:
        audio_mp3 = await text_to_speech_elevenlabs(text, language_code)
        if not audio_mp3:
            logger.warning("Failed to generate AI audio, skipping")
            return

        processed = await asyncio.to_thread(process_audio_for_clients, audio_mp3)

        # Send to browser
        if caller_number in state.transcription_clients and processed["browser_audio"]:
            audio_message = {
                "type": "audio",
                "audio": processed["browser_audio"],
                "sample_rate": 16000,
                "encoding": "pcm16",
                "timestamp": datetime.now().isoformat(),
                "call_sid": call_sid,
                "speaker": "AI Agent",
            }
            for client in list(state.transcription_clients[caller_number]):
                try:
                    await client.send_json(audio_message)
                except Exception as e:
                    logger.error("Failed to send AI audio to browser: %s", e)
                    state.transcription_clients[caller_number].discard(client)

        # Queue for phone
        chunks = processed["phone_chunks"]
        if chunks:
            logger.info("Queueing %d AI audio chunks for %s", len(chunks), caller_number)
            for chunk_base64 in chunks:
                try:
                    state.audio_to_phone.put_nowait(chunk_base64)
                except Exception:
                    try:
                        state.audio_to_phone.get_nowait()
                        state.audio_to_phone.put_nowait(chunk_base64)
                    except Exception:
                        pass
    except Exception as e:
        logger.error("Error in convert_and_queue_ai_audio: %s", e)


class DeepgramRealtimeTranscriber:
    def __init__(
        self,
        speaker_label: str,
        caller_number: str,
        event_loop: asyncio.AbstractEventLoop = None,
        call_sid: str = None,
        rudra_agent: RudraAgent = None,
    ):
        self.speaker_label = speaker_label
        self.caller_number = caller_number
        self.call_sid = call_sid
        self.event_loop = event_loop or asyncio.get_event_loop()
        self.rudra_agent = rudra_agent
        self.ws = None
        self.is_active = False
        self.full_transcript: list[str] = []
        self.transcript_buffer: list[dict] = []
        self.audio_queue: asyncio.Queue = asyncio.Queue()
        self._send_task = None
        self._recv_task = None

        self.dg_url = (
            f"wss://api.deepgram.com/v1/listen"
            f"?model={config.DEEPGRAM_MODEL}"
            f"&language=multi"
            f"&encoding=linear16"
            f"&sample_rate={config.AUDIO_RATE}"
            f"&channels={config.AUDIO_CHANNELS}"
            f"&interim_results=true"
            f"&endpointing=300"
            f"&vad_events=true"
            f"&punctuate=true"
            f"&smart_format=true"
            f"&filler_words=false"
            f"&profanity_filter=false"
        )

    # ── transcript buffering ────────────────────────────────────────────────
    async def buffer_transcript(self, speaker: str, message: str, translated_message: str = None, language: str = None):
        if not self.call_sid:
            return
        self.transcript_buffer.append({
            "call_sid": self.call_sid,
            "speaker": speaker,
            "message": message,
            "translated_message": translated_message,
            "language": language,
            "is_final": True,
            "timestamp": datetime.now(),
        })

    async def flush_transcripts(self):
        if not self.transcript_buffer:
            return
        logger.info("Flushing %d transcripts to DB for %s", len(self.transcript_buffer), self.call_sid)
        try:
            async with AsyncSessionLocal() as db:
                for item in self.transcript_buffer:
                    transcript = Transcript(
                        call_sid=item["call_sid"],
                        speaker=item["speaker"],
                        message=item["message"],
                        translated_message=item["translated_message"],
                        language=item["language"],
                        is_final=item["is_final"],
                        timestamp=item["timestamp"],
                    )
                    db.add(transcript)
                await db.commit()
                logger.info("Successfully flushed transcripts to DB")
                self.transcript_buffer = []
        except Exception as e:
            logger.error("Error flushing transcripts to DB: %s", e)

    # ── broadcasting ────────────────────────────────────────────────────────
    async def broadcast_to_clients(self, message_data: dict):
        clients_to_notify = set()
        if self.caller_number in state.transcription_clients:
            clients_to_notify.update(state.transcription_clients[self.caller_number])
        if "all" in state.transcription_clients:
            clients_to_notify.update(state.transcription_clients["all"])
        if self.caller_number == "unknown" and "unknown" in state.transcription_clients:
            clients_to_notify.update(state.transcription_clients["unknown"])

        for client in clients_to_notify:
            try:
                await client.send_json(message_data)
            except Exception as e:
                logger.error("Failed to send to client: %s", e)
                for s in state.transcription_clients.values():
                    s.discard(client)

    # ── translation handlers ────────────────────────────────────────────────
    async def handle_dispatcher_translation(self, transcript: str):
        try:
            if self.speaker_label != "DISPATCH":
                return

            dispatcher_lang = detect_language_from_text(transcript)
            if dispatcher_lang != 'en':
                state.dispatcher_languages[self.caller_number] = dispatcher_lang
            else:
                if self.caller_number not in state.dispatcher_languages:
                    state.dispatcher_languages[self.caller_number] = 'en'

            dispatcher_lang = state.dispatcher_languages.get(self.caller_number, 'en')
            caller_lang = state.caller_languages.get(self.caller_number, 'en')

            logger.info("Dispatcher message: '%s...' | Disp lang: %s | Caller lang: %s", transcript[:50], dispatcher_lang, caller_lang)

            if dispatcher_lang == caller_lang:
                logger.info("No translation needed (both speak %s)", dispatcher_lang)
                await self.broadcast_to_clients({
                    "speaker": self.speaker_label, "message": transcript,
                    "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                    "is_final": True, "type": "transcription", "language": dispatcher_lang,
                    "translation_needed": False,
                })
                if self.call_sid:
                    await self.buffer_transcript("Dispatch", transcript, None, dispatcher_lang)
                return

            logger.info("Translation needed: %s -> %s", dispatcher_lang, caller_lang)
            try:
                translated_text = await translate_text(transcript, dispatcher_lang, caller_lang)
                if translated_text and translated_text != transcript:
                    await self.broadcast_to_clients({
                        "speaker": self.speaker_label, "message": transcript,
                        "translated_message": translated_text,
                        "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                        "is_final": True, "type": "transcription", "language": dispatcher_lang,
                        "target_language": caller_lang, "translation_needed": True,
                    })
                    if self.call_sid:
                        await self.buffer_transcript("Dispatch", transcript, translated_text, dispatcher_lang)
                    await convert_and_queue_translated_audio(translated_text, caller_lang, self.caller_number, self.call_sid)
                else:
                    await self.broadcast_to_clients({
                        "speaker": self.speaker_label, "message": transcript,
                        "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                        "is_final": True, "type": "transcription", "language": dispatcher_lang,
                        "translation_needed": False, "translation_failed": True,
                    })
            except Exception as trans_error:
                logger.error("Translation/TTS error: %s", trans_error)
                await self.broadcast_to_clients({
                    "speaker": self.speaker_label, "message": transcript,
                    "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                    "is_final": True, "type": "transcription", "language": dispatcher_lang,
                    "translation_needed": False, "translation_error": str(trans_error),
                })

            # Auto-stop AI agent when dispatcher speaks
            if self.rudra_agent and not self.rudra_agent.call_transferred:
                logger.info("Dispatcher spoke - stopping AI agent")
                self.rudra_agent.call_transferred = True
                self.rudra_agent.is_active = False
                self.rudra_agent.has_been_transferred = True
                if self.event_loop and self.event_loop.is_running():
                    await self.broadcast_to_clients({
                        "type": "ai_transfer", "call_sid": self.call_sid,
                        "timestamp": datetime.now().isoformat(), "reason": "dispatcher_intervention",
                    })
        except Exception as e:
            logger.error("Error in dispatcher translation: %s", e)

    async def handle_caller_translation(self, transcript: str, language_code: str = None):
        try:
            if self.speaker_label != "CALLER":
                return

            if language_code:
                caller_lang = language_code
            else:
                caller_lang = detect_language_from_text(transcript)

            if state.caller_languages.get(self.caller_number) != caller_lang:
                state.caller_languages[self.caller_number] = caller_lang
                logger.info("Detected caller language: %s for %s", caller_lang, self.caller_number)

            dispatcher_lang = state.dispatcher_languages.get(self.caller_number, 'en')

            if caller_lang == dispatcher_lang:
                await self.broadcast_to_clients({
                    "speaker": self.speaker_label, "message": transcript,
                    "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                    "is_final": True, "type": "transcription", "language": caller_lang,
                    "translation_needed": False,
                })
                if self.call_sid:
                    await self.buffer_transcript("Caller", transcript, None, caller_lang)
                return

            translated_text = await translate_text(transcript, caller_lang, dispatcher_lang)
            if translated_text and translated_text != transcript:
                await self.broadcast_to_clients({
                    "speaker": self.speaker_label, "message": transcript,
                    "translated_message": translated_text,
                    "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                    "is_final": True, "type": "transcription", "language": caller_lang,
                    "target_language": dispatcher_lang, "translation_needed": True,
                })
                if self.call_sid:
                    await self.buffer_transcript("Caller", transcript, translated_text, caller_lang)
            else:
                await self.broadcast_to_clients({
                    "speaker": self.speaker_label, "message": transcript,
                    "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                    "is_final": True, "type": "transcription", "language": caller_lang,
                    "translation_needed": False,
                })
                if self.call_sid:
                    await self.buffer_transcript("Caller", transcript, None, caller_lang)
        except Exception as e:
            logger.error("Error in caller translation: %s", e)
            await self.broadcast_to_clients({
                "speaker": self.speaker_label, "message": transcript,
                "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                "is_final": True, "type": "transcription", "language": 'en',
                "translation_needed": False,
            })

    # ── AI response handler ────────────────────────────────────────────────
    async def handle_ai_response(self, transcript: str, confidence: float = 1.0, language_code: str = 'en'):
        if not self.rudra_agent:
            return

        lang = language_code if language_code else 'en'
        cleaned = transcript.strip().lower()

        if not cleaned or len(cleaned) < 2:
            logger.info("Ignoring very short transcript: '%s'", transcript)
            return

        fillers = {"uh", "um", "ah", "huh", "hmm", "er"}
        if cleaned in fillers:
            logger.info("Ignoring filler word: '%s'", transcript)
            return

        if confidence is not None and confidence < 0.6:
            logger.info("Ignoring low confidence transcript (%s): '%s'", confidence, transcript)
            return

        try:
            response_text, transferred, tool_used = await asyncio.to_thread(self.rudra_agent.process_input, transcript)

            if response_text:
                logger.info("AI Agent response: %s", response_text)
                await self.broadcast_to_clients({
                    "speaker": "AI Agent", "message": response_text,
                    "timestamp": datetime.now().isoformat(), "caller_number": self.caller_number,
                    "is_final": True, "type": "transcription", "language": "en",
                    "translation_needed": False,
                })
                if self.call_sid:
                    await self.buffer_transcript("AI Agent", response_text, None, lang)

            if response_text:
                await convert_and_queue_ai_audio(response_text, lang, self.caller_number, self.call_sid)

            if tool_used == "send_location_link":
                logger.info("Broadcasting location_link_sent event for %s", self.caller_number)
                link = getattr(self.rudra_agent, "last_location_link", None)
                await self.broadcast_to_clients({
                    "type": "system_event",
                    "event": "location_link_sent",
                    "caller_number": self.caller_number,
                    "location_link": link,
                    "timestamp": datetime.now().isoformat(),
                })

                start_time = time.time()
                timeout = 15
                while time.time() - start_time < timeout:
                    if self.rudra_agent.location_details:
                        break
                    await asyncio.sleep(1)

            if transferred:
                logger.info("Call transferred to human dispatcher by AI Agent")
                if not response_text:
                    await convert_and_queue_ai_audio("I am transferring you to a human dispatcher now. Please hold.", lang, self.caller_number, self.call_sid)
                await self.broadcast_to_clients({
                    "type": "ai_transfer", "call_sid": self.call_sid,
                    "timestamp": datetime.now().isoformat(), "reason": "ai_decision",
                })
                return
        except Exception as e:
            logger.error("Error in AI response handling: %s", e)

    # ── connection ──────────────────────────────────────────────────────────
    async def connect(self):
        if not config.DEEPGRAM_API_KEY:
            logger.warning("No Deepgram API key - cannot connect for %s", self.speaker_label)
            return

        try:
            logger.info("Connecting to Deepgram Realtime API for %s...", self.speaker_label)
            self.ws = await websockets.connect(
                self.dg_url,
                additional_headers={"Authorization": f"Token {config.DEEPGRAM_API_KEY}"},
            )
            self.is_active = True
            self._send_task = asyncio.create_task(self._send_audio_loop())
            self._recv_task = asyncio.create_task(self._receive_loop())
            logger.info("Connected to Deepgram for %s", self.speaker_label)
        except Exception as e:
            logger.error("Deepgram connect failed for %s: %s", self.speaker_label, e)

    async def _send_audio_loop(self):
        try:
            last_audio_time = asyncio.get_event_loop().time()
            while self.is_active:
                try:
                    chunk = await asyncio.wait_for(self.audio_queue.get(), timeout=5.0)
                    if chunk is None:
                        break
                    await self.ws.send(chunk)
                    last_audio_time = asyncio.get_event_loop().time()
                except asyncio.TimeoutError:
                    current_time = asyncio.get_event_loop().time()
                    if current_time - last_audio_time > 5.0:
                        try:
                            await self.ws.send(json.dumps({"type": "KeepAlive"}))
                            last_audio_time = current_time
                        except Exception:
                            pass
                except Exception as e:
                    logger.error("Error sending audio for %s: %s", self.speaker_label, e)
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Send loop exception for %s: %s", self.speaker_label, e)

    async def _receive_loop(self):
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                except Exception:
                    continue

                transcript = ""
                confidence = None
                is_final = False

                channel = data.get("channel") if isinstance(data.get("channel"), dict) else None
                detected_language_code = None
                if channel:
                    alternatives = channel.get("alternatives", [])
                    if alternatives:
                        transcript = alternatives[0].get("transcript", "")
                        confidence = alternatives[0].get("confidence")
                        detected_language_code = alternatives[0].get("detected_language")
                    is_final = data.get("is_final", False)

                if not transcript or not transcript.strip():
                    continue

                detected_lang = None
                if is_final and self.speaker_label == "CALLER":
                    if detected_language_code:
                        detected_lang = detected_language_code
                    else:
                        detected_lang = detect_language_from_text(transcript)
                    if state.caller_languages.get(self.caller_number) != detected_lang:
                        state.caller_languages[self.caller_number] = detected_lang
                        logger.info("Detected caller language: %s for %s", detected_lang, self.caller_number)

                if is_final and self.speaker_label == "DISPATCH":
                    if self.event_loop and self.event_loop.is_running():
                        asyncio.run_coroutine_threadsafe(self.handle_dispatcher_translation(transcript), self.event_loop)
                elif is_final and self.speaker_label == "CALLER":
                    if self.event_loop and self.event_loop.is_running():
                        asyncio.run_coroutine_threadsafe(self.handle_caller_translation(transcript, detected_lang), self.event_loop)

                if is_final and self.rudra_agent and not self.rudra_agent.call_transferred:
                    if self.event_loop and self.event_loop.is_running():
                        asyncio.run_coroutine_threadsafe(self.handle_ai_response(transcript, confidence, detected_lang), self.event_loop)

        except Exception as e:
            logger.error("Error in Deepgram receive loop for %s: %s", self.speaker_label, e)

    # ── control ─────────────────────────────────────────────────────────────
    def process_audio(self, audio_data: bytes):
        if not self.is_active:
            return
        try:
            self.audio_queue.put_nowait(audio_data)
        except Exception:
            try:
                _ = self.audio_queue.get_nowait()
                self.audio_queue.put_nowait(audio_data)
            except Exception:
                pass

    def stream_audio(self, audio_data: bytes):
        self.process_audio(audio_data)

    async def stop(self):
        if not self.is_active:
            return
        self.is_active = False
        try:
            await self.audio_queue.put(None)
        except Exception:
            pass
        try:
            if self.ws:
                try:
                    await self.ws.send(json.dumps({"type": "CloseStream"}))
                except Exception:
                    pass
                await self.ws.close()
        except Exception as e:
            logger.error("Error closing Deepgram WS for %s: %s", self.speaker_label, e)
        try:
            if self._send_task:
                self._send_task.cancel()
            if self._recv_task:
                self._recv_task.cancel()
        except Exception:
            pass
        await self.flush_transcripts()
        logger.info("Deepgram session closed for %s", self.speaker_label)

    def save_transcript(self, filename: str):
        pass  # Disabled — using DB only
