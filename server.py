# server.py - Production-ready FastAPI server for voice transcription
import os
import json
import uvicorn
import requests
import time
import subprocess
import pyaudio
import base64
import audioop
import wave
import logging
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, status
from fastapi.responses import Response, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from dotenv import load_dotenv
import asyncio
import threading
from queue import Queue
from typing import Dict, Set, Optional
from pydantic import BaseModel, Field, validator
import websockets
import traceback

# Import training functions
from training import load_scenarios, select_random_scenario
from google import genai
from config import config


# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('server.log')
    ]
)
logger = logging.getLogger(__name__)

# Environment variables with validation
DEEPGRAM_API_KEY = config.get("DEEPGRAM_API_KEY")
TWILIO_ACCOUNT_SID = config.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = config.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = config.get("TWILIO_PHONE_NUMBER")
GOOGLE_API_KEY = config.get("GOOGLE_API_KEY")
PORT = int(config.get("PORT", "8000"))
ENVIRONMENT = config.get("ENVIRONMENT", "development")
ALLOWED_ORIGINS = config.get("ALLOWED_ORIGINS", "*").split(",")
NGROK_URL = config.get("NGROK_URL")

# Audio configuration - Using 16kHz for wideband quality (clearer voice)
CHUNK = 320  # Doubled for 16kHz (was 160 for 8kHz)
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = int(config.get("AUDIO_RATE", "16000"))  # 16kHz wideband quality (optimal for 8kHz upsampling)

# Global state - BROWSER-ONLY MODE (no laptop audio)
phone_audio_recording = []
recording_lock = threading.Lock()
audio_to_phone = Queue(maxsize=500)  # Large buffer for translated audio (71 chunks per sentence avg)
sessions: Dict[str, dict] = {}
transcription_clients: Dict[str, Set[WebSocket]] = {}
notification_clients: Set[WebSocket] = set()
active_transcribers: Dict[str, dict] = {}
browser_transcribers: Dict[str, dict] = {}  # Separate transcribers for browser audio
ngrok_process = None
WS_URL = None

# Translation and TTS state
caller_languages: Dict[str, str] = {}  # Maps caller_number -> detected language code
dispatcher_languages: Dict[str, str] = {}  # Maps caller_number -> dispatcher's detected language
dispatcher_should_translate: Dict[str, bool] = {}  # Maps caller_number -> whether to translate
ELEVENLABS_API_KEY = config.get("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE = config.get("ELEVENLABS_VOICE", "uYXf8XasLslADfZ2MB4u")

# Training state
training_sessions: Dict[str, dict] = {}  # Maps session_id -> training session data
training_scenarios = None  # Will be loaded on startup
training_client = None  # Gemini client for training




# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events"""
    global ngrok_process, WS_URL
    
    # Startup
    logger.info("🚀 Starting server (Browser-only audio mode)...")
    logger.info("📱 All audio will be routed through web browser")
    
    # Initialize training system
    global training_scenarios, training_client
    try:
        training_scenarios = load_scenarios("911_calls.json")
        if GOOGLE_API_KEY:
            training_client = genai.Client(api_key=GOOGLE_API_KEY)
            logger.info(f"✅ Training system initialized with {len(training_scenarios)} scenarios")
        else:
            logger.warning("⚠️ GOOGLE_API_KEY not set, training system disabled")
            training_scenarios = []
    except Exception as e:
        logger.error(f"⚠️ Failed to initialize training system: {e}")
        logger.error(traceback.format_exc())
        training_scenarios = []
    
    # Setup ngrok if needed
    domain = NGROK_URL
    if not domain and ENVIRONMENT == "development":
        try:
            ngrok_process = start_ngrok(PORT)
            domain = get_ngrok_url()
        except Exception as e:
            logger.error(f"Failed to start ngrok: {e}")
            domain = f"localhost:{PORT}"
    
    if domain:
        WS_URL = f"wss://{domain}/ws" if not domain.startswith("localhost") else f"ws://{domain}/ws"
        app.state.ws_url = WS_URL
        app.state.domain = domain
        
        # Update Twilio webhook
        if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
            update_twilio_webhook(domain)
    
    logger.info(f"✅ Server ready on port {PORT}")
    logger.info(f"📞 WebSocket URL: {WS_URL}")
    logger.info(f"🌐 Browser audio mode: All audio routed through web interface")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down server...")
    
    # Stop ngrok
    if ngrok_process:
        try:
            ngrok_process.terminate()
            ngrok_process.wait()
        except Exception as e:
            logger.error(f"Error stopping ngrok: {e}")
    
    # Stop transcribers
    for transcribers in list(active_transcribers.values()):
        if transcribers.get("phone_transcriber"):
            try:
                await transcribers["phone_transcriber"].stop()
            except Exception as e:
                logger.error(f"Error stopping phone transcriber: {e}")
    
    for transcribers in list(browser_transcribers.values()):
        if transcribers.get("browser_transcriber"):
            try:
                await transcribers["browser_transcriber"].stop()
            except Exception as e:
                logger.error(f"Error stopping browser transcriber: {e}")
    
    # Save recordings
    save_recordings()
    
    logger.info("✅ Server shutdown complete")


# FastAPI app with production configuration
app = FastAPI(
    title="Voice Transcription Server",
    description="Real-time voice call transcription with Twilio and Deepgram",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if ENVIRONMENT == "development" else None,
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

if ENVIRONMENT == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"] if not config.get("ALLOWED_HOSTS") else config.get("ALLOWED_HOSTS").split(",")
    )


# Pydantic models
class AudioStreamRequest(BaseModel):
    audio: str = Field(..., description="Base64 encoded audio data")
    caller_number: str = Field(..., description="Caller phone number")
    
    @validator('audio')
    def validate_audio(cls, v):
        try:
            base64.b64decode(v)
            return v
        except Exception:
            raise ValueError("Invalid base64 audio data")


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    environment: str
    deepgram_configured: bool
    twilio_configured: bool


class RecordingRequest(BaseModel):
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    call_sid: Optional[str] = Field(None, description="Specific Call SID (optional)")


class RecordingResponse(BaseModel):
    status: str
    message: str
    recordings_saved: int
    recordings: list


# Training models
class TrainingStartRequest(BaseModel):
    session_id: str = Field(..., description="Unique session identifier")


class TrainingMessageRequest(BaseModel):
    session_id: str = Field(..., description="Training session ID")
    message: str = Field(..., description="Dispatcher message")


class TrainingEndRequest(BaseModel):
    session_id: str = Field(..., description="Training session ID")


class TrainingResponse(BaseModel):
    status: str
    session_id: str
    message: str
    caller_response: Optional[str] = None
    confidence_score: Optional[int] = None
    evaluation: Optional[str] = None





def fetch_twilio_recordings(date_str: str, call_sid: Optional[str] = None):
    """Fetch call recordings from Twilio API for a specific date"""
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN]):
        logger.error("Twilio credentials not configured")
        return {"status": "error", "message": "Twilio credentials not configured", "recordings_saved": 0, "recordings": []}
    
    try:
        from twilio.rest import Client
        from datetime import datetime, timedelta
        
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        recordings_dir = config.get("RECORDINGS_DIR", "recordings")
        os.makedirs(recordings_dir, exist_ok=True)
        
        # Parse date
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        next_date = target_date + timedelta(days=1)
        
        logger.info(f"Fetching recordings for date: {date_str}")
        
        # Fetch recordings
        if call_sid:
            # Fetch recordings for specific call
            recordings = client.recordings.list(call_sid=call_sid)
        else:
            # Fetch all recordings for the date
            recordings = client.recordings.list(
                date_created_after=target_date,
                date_created_before=next_date
            )
        
        saved_recordings = []
        
        for recording in recordings:
            try:
                # Get recording details
                recording_sid = recording.sid
                call_sid_val = recording.call_sid
                date_created = recording.date_created.strftime("%Y%m%d_%H%M%S")
                duration = recording.duration
                
                # Download recording
                recording_url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Recordings/{recording_sid}.wav"
                
                response = requests.get(
                    recording_url,
                    auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
                    timeout=30
                )
                
                if response.status_code == 200:
                    filename = f"twilio_{call_sid_val}_{date_created}.wav"
                    filepath = os.path.join(recordings_dir, filename)
                    
                    with open(filepath, 'wb') as f:
                        f.write(response.content)
                    
                    logger.info(f"✅ Saved recording: {filename} (Duration: {duration}s)")
                    
                    saved_recordings.append({
                        "recording_sid": recording_sid,
                        "call_sid": call_sid_val,
                        "filename": filename,
                        "duration": duration,
                        "date_created": recording.date_created.isoformat()
                    })
                else:
                    logger.error(f"Failed to download recording {recording_sid}: HTTP {response.status_code}")
                    
            except Exception as e:
                logger.error(f"Error processing recording {recording.sid}: {e}")
                continue
        
        return {
            "status": "success",
            "message": f"Fetched {len(saved_recordings)} recordings for {date_str}",
            "recordings_saved": len(saved_recordings),
            "recordings": saved_recordings
        }
        
    except ImportError:
        logger.error("Twilio library not installed")
        return {"status": "error", "message": "Twilio library not installed", "recordings_saved": 0, "recordings": []}
    except ValueError as e:
        logger.error(f"Invalid date format: {e}")
        return {"status": "error", "message": "Invalid date format. Use YYYY-MM-DD", "recordings_saved": 0, "recordings": []}
    except Exception as e:
        logger.error(f"Error fetching recordings: {e}")
        return {"status": "error", "message": str(e), "recordings_saved": 0, "recordings": []}


def start_ngrok(port):
    """Start ngrok tunnel for development"""
    try:
        logger.info(f"🚀 Starting ngrok tunnel on port {port}...")
        process = subprocess.Popen(
            ["ngrok", "http", str(port)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        time.sleep(3)
        return process
    except FileNotFoundError:
        logger.error("ngrok not found. Install from: https://ngrok.com/download")
        raise ValueError("ngrok not found. Install from: https://ngrok.com/download")


def get_ngrok_url(max_retries=5):
    """Retrieve ngrok public URL"""
    for attempt in range(max_retries):
        try:
            response = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=5)
            tunnels = response.json().get("tunnels", [])
            for tunnel in tunnels:
                if tunnel.get("proto") == "https":
                    public_url = tunnel["public_url"]
                    domain = public_url.replace("https://", "")
                    logger.info(f"✅ Ngrok URL: {domain}")
                    return domain
            if attempt < max_retries - 1:
                time.sleep(2)
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2)
    logger.error("Could not get ngrok URL after all retries")
    raise ValueError("Could not get ngrok URL")


def update_twilio_webhook(domain):
    """Update Twilio webhook URL"""
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
        logger.warning("⚠️  Twilio credentials missing or incomplete; webhook update skipped.")
        return False

    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        webhook_url = f"https://{domain}/twiml"
        incoming_phone_numbers = client.incoming_phone_numbers.list(phone_number=TWILIO_PHONE_NUMBER)
        if not incoming_phone_numbers:
            logger.warning(f"⚠️  Phone number {TWILIO_PHONE_NUMBER} not found on Twilio account")
            return False
        phone_sid = incoming_phone_numbers[0].sid
        client.incoming_phone_numbers(phone_sid).update(
            voice_url=webhook_url,
            voice_method="POST"
        )
        logger.info(f"✅ Twilio webhook updated: {webhook_url}")
        return True
    except ImportError:
        logger.error("⚠️  Twilio library not installed. Install with: pip install twilio")
        return False
    except Exception as e:
        logger.error(f"⚠️  Failed to update Twilio webhook: {e}")
        return False


def save_recordings():
    """Save audio recordings to WAV files"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    recordings_dir = config.get("RECORDINGS_DIR", "recordings")
    
    # Create recordings directory if it doesn't exist
    os.makedirs(recordings_dir, exist_ok=True)
    
    with recording_lock:
        if phone_audio_recording:
            phone_filename = os.path.join(recordings_dir, f"phone_{timestamp}.wav")
            try:
                wf = wave.open(phone_filename, "wb")
                wf.setnchannels(CHANNELS)
                wf.setsampwidth(2)
                wf.setframerate(RATE)
                wf.writeframes(b"".join(phone_audio_recording))
                wf.close()
                logger.info(f"💾 Phone audio saved: {phone_filename}")
            except Exception as e:
                logger.error(f"Failed to save phone recording: {e}")


def detect_language_from_text(text: str) -> str:
    """Detect language from text using character-based heuristics"""
    if not text or not text.strip():
        return 'en'
    
    # Simple language detection based on character ranges
    if any('\u0900' <= c <= '\u097F' for c in text):  # Devanagari (Hindi, Marathi, Sanskrit)
        return 'hi'
    elif any('\u0980' <= c <= '\u09FF' for c in text):  # Bengali
        return 'bn'
    elif any('\u0B80' <= c <= '\u0BFF' for c in text):  # Tamil
        return 'ta'
    elif any('\u0C00' <= c <= '\u0C7F' for c in text):  # Telugu
        return 'te'
    elif any('\u0C80' <= c <= '\u0CFF' for c in text):  # Kannada
        return 'kn'
    elif any('\u0D00' <= c <= '\u0D7F' for c in text):  # Malayalam
        return 'ml'
    elif any('\u0A80' <= c <= '\u0AFF' for c in text):  # Gujarati
        return 'gu'
    elif any('\u0A00' <= c <= '\u0A7F' for c in text):  # Gurmukhi (Punjabi)
        return 'pa'
    elif any('\u0600' <= c <= '\u06FF' for c in text):  # Arabic/Urdu
        return 'ar'
    elif any('\u4E00' <= c <= '\u9FFF' for c in text):  # Chinese
        return 'zh'
    elif any('\u3040' <= c <= '\u309F' for c in text) or any('\u30A0' <= c <= '\u30FF' for c in text):  # Japanese
        return 'ja'
    elif any('\uAC00' <= c <= '\uD7AF' for c in text):  # Korean
        return 'ko'
    elif any('\u0400' <= c <= '\u04FF' for c in text):  # Cyrillic (Russian)
        return 'ru'
    
    # Default to English for Latin script
    return 'en'


async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text using MyMemory API (free, no API key required)"""
    if not text or not text.strip():
        return text
    
    # If source and target are the same, no translation needed
    if source_lang == target_lang:
        return text
    
    try:
        lang_pair = f"{source_lang}|{target_lang}"
        encoded_text = requests.utils.quote(text)
        url = f"https://api.mymemory.translated.net/get?q={encoded_text}&langpair={lang_pair}"
        
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("responseStatus") == 200:
                translated = data.get("responseData", {}).get("translatedText", text)
                logger.info(f"🌐 Translated ({source_lang}->{target_lang}): {text[:30]}... -> {translated[:30]}...")
                return translated
        
        logger.warning(f"Translation failed, using original text")
        return text
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text


async def text_to_speech_elevenlabs(text: str, language_code: str = 'en') -> Optional[bytes]:
    """Convert text to speech using ElevenLabs API with language support"""
    if not ELEVENLABS_API_KEY:
        logger.error("❌ ElevenLabs API key not configured - cannot generate speech")
        return None
    
    if not text or not text.strip():
        logger.warning("⚠️ Empty text provided to TTS")
        return None
    
    try:
        from elevenlabs import VoiceSettings
        from elevenlabs.client import ElevenLabs
        
        client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        
        # Language-specific voice mapping (ElevenLabs supports multilingual voices)
        # Using multilingual voices that work well with different languages
        voice_map = {
            'hi': 'pNInz6obpgDQGcFmaJgB',  # Adam - works well with Hindi
            'bn': 'pNInz6obpgDQGcFmaJgB',  # Bengali
            'ta': 'pNInz6obpgDQGcFmaJgB',  # Tamil
            'te': 'pNInz6obpgDQGcFmaJgB',  # Telugu
            'kn': 'pNInz6obpgDQGcFmaJgB',  # Kannada
            'ml': 'pNInz6obpgDQGcFmaJgB',  # Malayalam
            'gu': 'pNInz6obpgDQGcFmaJgB',  # Gujarati
            'pa': 'pNInz6obpgDQGcFmaJgB',  # Punjabi
            'mr': 'pNInz6obpgDQGcFmaJgB',  # Marathi
            'es': 'EXAVITQu4vr4xnSDxMaL',  # Bella - Spanish
            'fr': 'EXAVITQu4vr4xnSDxMaL',  # French
            'de': 'pNInz6obpgDQGcFmaJgB',  # German
            'zh': 'pNInz6obpgDQGcFmaJgB',  # Chinese
            'ja': 'pNInz6obpgDQGcFmaJgB',  # Japanese
            'ar': 'pNInz6obpgDQGcFmaJgB',  # Arabic
        }
        
        voice_id = voice_map.get(language_code, ELEVENLABS_VOICE)
        
        logger.info(f"🎤 Generating speech for: '{text[:50]}...' | Language: {language_code} | Voice: {voice_id}")
        
        # Generate audio
        audio_generator = client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id="eleven_multilingual_v2",  # Multilingual model
            voice_settings=VoiceSettings(
                stability=0.5,
                similarity_boost=0.75,
                style=0.0,
                use_speaker_boost=True
            )
        )
        
        # Collect audio chunks
        audio_chunks = []
        chunk_count = 0
        for chunk in audio_generator:
            if chunk:
                audio_chunks.append(chunk)
                chunk_count += 1
        
        if not audio_chunks:
            logger.error("❌ No audio generated from ElevenLabs")
            return None
        
        audio_data = b"".join(audio_chunks)
        logger.info(f"✅ Generated {len(audio_data)} bytes of audio from {chunk_count} chunks")
        
        return audio_data
        
    except ImportError:
        logger.error("❌ ElevenLabs library not installed. Install with: pip install elevenlabs")
        return None
    except Exception as e:
        logger.error(f"❌ ElevenLabs TTS error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


async def convert_and_queue_translated_audio(text: str, language_code: str, caller_number: str):
    """Convert translated text to speech and queue it for phone delivery"""
    try:
        # Import Sarvam TTS hybrid function
        from sarvam_tts import text_to_speech_hybrid
        
        # Generate speech using hybrid TTS (Sarvam for Indian languages, ElevenLabs for others)
        audio_mp3 = await text_to_speech_hybrid(text, language_code)
        
        if not audio_mp3:
            logger.warning("Failed to generate audio, skipping")
            return
        
        # Convert MP3 to PCM16 at 16kHz using pydub
        try:
            from pydub import AudioSegment
            import io
            
            # Load MP3 audio
            audio_segment = AudioSegment.from_mp3(io.BytesIO(audio_mp3))
            
            # Convert to 8kHz mono PCM16 (Twilio's native format)
            audio_segment = audio_segment.set_frame_rate(8000).set_channels(1).set_sample_width(2)
            
            # Get raw PCM data
            pcm_8khz = audio_segment.raw_data
            
            # Convert to μ-law for Twilio
            ulaw_data = audioop.lin2ulaw(pcm_8khz, 2)
            
            # Split into 20ms chunks (160 bytes at 8kHz μ-law = 20ms)
            # Twilio expects audio in small chunks, not all at once
            chunk_size = 160  # 20ms of μ-law audio at 8kHz
            total_chunks = len(ulaw_data) // chunk_size
            
            logger.info(f"📤 Queueing {total_chunks} audio chunks for {caller_number} ({language_code})")
            logger.info(f"📊 Queue size before queueing: {audio_to_phone.qsize()}")
            
            chunks_queued = 0
            for i in range(0, len(ulaw_data), chunk_size):
                chunk = ulaw_data[i:i + chunk_size]
                
                # Only queue full chunks (skip partial last chunk)
                if len(chunk) == chunk_size:
                    chunk_base64 = base64.b64encode(chunk).decode("utf-8")
                    
                    try:
                        audio_to_phone.put_nowait(chunk_base64)
                        chunks_queued += 1
                    except Exception as e:
                        # Queue full, drop oldest and add new
                        logger.warning(f"Queue full ({audio_to_phone.qsize()}), dropping oldest chunk")
                        try:
                            audio_to_phone.get_nowait()
                            audio_to_phone.put_nowait(chunk_base64)
                            chunks_queued += 1
                        except Exception as e2:
                            logger.warning(f"Failed to queue chunk {i//chunk_size}: {e2}")
                            pass
            
            logger.info(f"✅ Queued {chunks_queued}/{total_chunks} translated audio chunks for {caller_number}")
            logger.info(f"📊 Queue size after queueing: {audio_to_phone.qsize()}")
                    
        except ImportError:
            logger.error("pydub not installed. Install with: pip install pydub")
        except Exception as e:
            logger.error(f"Audio conversion error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            
    except Exception as e:
        logger.error(f"Error in convert_and_queue_translated_audio: {e}")
        import traceback
        logger.error(traceback.format_exc())


# --- Deepgram Realtime (direct WebSocket) transcriber ---
# This does NOT require the Deepgram SDK. It connects directly to the Deepgram Realtime API.
class DeepgramRealtimeTranscriber:
    def __init__(self, speaker_label: str, caller_number: str, event_loop: asyncio.AbstractEventLoop = None):
        self.speaker_label = speaker_label
        self.caller_number = caller_number
        self.event_loop = event_loop or asyncio.get_event_loop()
        self.ws = None
        self.is_active = False
        self.full_transcript = []
        self.audio_queue: asyncio.Queue = asyncio.Queue()
        self._send_task = None
        self._recv_task = None

        # Build websocket url with query params that Deepgram accepts
        # Optimized for low latency real-time transcription
        self.dg_url = (
            f"wss://api.deepgram.com/v1/listen"
            f"?model=nova-3"
            f"&language=multi"
            f"&encoding=linear16"
            f"&sample_rate={RATE}"
            f"&channels={CHANNELS}"
            f"&interim_results=true"  # Get partial results for faster feedback
            f"&endpointing=100"  # Faster endpoint detection (100ms)
            f"&vad_events=true"  # Voice activity detection
            f"&punctuate=true"
            f"&smart_format=true"
        )

    async def broadcast_to_clients(self, message_data: dict):
        """Broadcast transcription to connected clients"""
        clients_to_notify = set()
        if self.caller_number in transcription_clients:
            clients_to_notify.update(transcription_clients[self.caller_number])
        if "all" in transcription_clients:
            clients_to_notify.update(transcription_clients["all"])
        if self.caller_number == "unknown" and "unknown" in transcription_clients:
            clients_to_notify.update(transcription_clients["unknown"])

        for client in clients_to_notify:
            try:
                await client.send_json(message_data)
            except Exception as e:
                logger.error(f"❌ Failed to send to client {client}: {e}")
                for s in transcription_clients.values():
                    s.discard(client)
    
    async def handle_dispatcher_translation(self, transcript: str):
        """Handle translation and TTS for dispatcher messages based on caller's language"""
        try:
            if self.speaker_label != "DISPATCH":
                return
            
            # Detect dispatcher's language from their speech
            dispatcher_lang = detect_language_from_text(transcript)
            
            # Store dispatcher's language
            dispatcher_languages[self.caller_number] = dispatcher_lang
            
            # Get caller's detected language (if any)
            caller_lang = caller_languages.get(self.caller_number, 'en')
            
            logger.info(f"🌐 Dispatcher message: '{transcript[:50]}...' | Dispatcher lang: {dispatcher_lang} | Caller lang: {caller_lang}")
            
            # Check if we need to translate
            # Case 1: Languages are the same → No translation needed
            # Case 2: Languages differ → Translate and send TTS to caller
            
            if dispatcher_lang == caller_lang:
                # Both speak same language - no translation needed
                logger.info(f"✅ No translation needed (both speak {dispatcher_lang})")
                
                # Broadcast original transcript only (no translation field)
                await self.broadcast_to_clients({
                    "speaker": self.speaker_label,
                    "message": transcript,
                    "timestamp": datetime.now().isoformat(),
                    "caller_number": self.caller_number,
                    "is_final": True,
                    "type": "transcription",
                    "language": dispatcher_lang,
                    "translation_needed": False
                })
                return
            
            # Languages differ - translation needed
            logger.info(f"🌐 Translation needed: {dispatcher_lang} → {caller_lang}")
            
            try:
                # Translate dispatcher's message to caller's language
                translated_text = await translate_text(transcript, dispatcher_lang, caller_lang)
                
                if translated_text and translated_text != transcript:
                    logger.info(f"✅ Translated ({dispatcher_lang}→{caller_lang}): {transcript[:30]}... → {translated_text[:30]}...")
                    
                    # Broadcast BOTH original and translated transcripts to dispatcher UI
                    await self.broadcast_to_clients({
                        "speaker": self.speaker_label,
                        "message": transcript,
                        "translated_message": translated_text,
                        "timestamp": datetime.now().isoformat(),
                        "caller_number": self.caller_number,
                        "is_final": True,
                        "type": "transcription",
                        "language": dispatcher_lang,
                        "target_language": caller_lang,
                        "translation_needed": True
                    })
                    
                    # Convert translated text to speech in caller's language and queue for phone
                    logger.info(f"🎤 Starting TTS for translated text in {caller_lang}: {translated_text[:50]}...")
                    await convert_and_queue_translated_audio(translated_text, caller_lang, self.caller_number)
                    logger.info(f"✅ TTS completed and queued for {self.caller_number}")
                else:
                    logger.warning(f"⚠️ Translation returned same text or failed: {translated_text}")
                    # Broadcast original only if translation failed
                    await self.broadcast_to_clients({
                        "speaker": self.speaker_label,
                        "message": transcript,
                        "timestamp": datetime.now().isoformat(),
                        "caller_number": self.caller_number,
                        "is_final": True,
                        "type": "transcription",
                        "language": dispatcher_lang,
                        "translation_needed": False,
                        "translation_failed": True
                    })
            except Exception as trans_error:
                logger.error(f"❌ Translation/TTS error: {trans_error}")
                import traceback
                logger.error(traceback.format_exc())
                # Broadcast original only if translation failed
                await self.broadcast_to_clients({
                    "speaker": self.speaker_label,
                    "message": transcript,
                    "timestamp": datetime.now().isoformat(),
                    "caller_number": self.caller_number,
                    "is_final": True,
                    "type": "transcription",
                    "language": dispatcher_lang,
                    "translation_needed": False,
                    "translation_error": str(trans_error)
                })
                    
        except Exception as e:
            logger.error(f"❌ Error in dispatcher translation: {e}")
            import traceback
            logger.error(traceback.format_exc())
    

    async def connect(self):
        """Connect to Deepgram Realtime API"""
        if not DEEPGRAM_API_KEY:
            logger.warning(f"⚠️  No Deepgram API key - cannot connect for {self.speaker_label}")
            return

        try:
            logger.info(f"🌐 Connecting to Deepgram Realtime API for {self.speaker_label}...")
            self.ws = await websockets.connect(
                self.dg_url,
                additional_headers={"Authorization": f"Token {DEEPGRAM_API_KEY}"}
            )
            self.is_active = True
            self._send_task = asyncio.create_task(self._send_audio_loop())
            self._recv_task = asyncio.create_task(self._receive_loop())
            logger.info(f"✅ Connected to Deepgram for {self.speaker_label}")
        except Exception as e:
            logger.error(f"❌ Deepgram connect failed for {self.speaker_label}: {e}")

    async def _send_audio_loop(self):
        try:
            last_audio_time = asyncio.get_event_loop().time()
            while self.is_active:
                try:
                    # Wait for audio with timeout
                    chunk = await asyncio.wait_for(self.audio_queue.get(), timeout=5.0)
                    if chunk is None:
                        break
                    # Deepgram expects raw PCM16 bytes (binary)
                    await self.ws.send(chunk)
                    last_audio_time = asyncio.get_event_loop().time()
                except asyncio.TimeoutError:
                    # Send keepalive if no audio for 5 seconds
                    current_time = asyncio.get_event_loop().time()
                    if current_time - last_audio_time > 5.0:
                        try:
                            await self.ws.send(json.dumps({"type": "KeepAlive"}))
                            logger.debug(f"Sent keepalive for {self.speaker_label}")
                            last_audio_time = current_time
                        except Exception:
                            pass
                except Exception as e:
                    logger.error(f"❌ Error sending audio for {self.speaker_label}: {e}")
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"❌ _send_audio_loop exception for {self.speaker_label}: {e}")

    async def _receive_loop(self):
        try:
            async for message in self.ws:
                # Deepgram returns text JSON messages for transcripts
                try:
                    data = json.loads(message)
                except Exception:
                    # Non-JSON message - skip
                    continue

                # Attempt to extract transcript
                transcript = ""
                confidence = None
                is_final = False

                # Defensive parsing
                channel = data.get("channel") if isinstance(data.get("channel"), dict) else None
                if channel:
                    alternatives = channel.get("alternatives", [])
                    if alternatives:
                        transcript = alternatives[0].get("transcript", "")
                        confidence = alternatives[0].get("confidence")
                    is_final = data.get("is_final", False)

                if not transcript or not transcript.strip():
                    continue

                # Detect caller language from CALLER transcripts
                if is_final and self.speaker_label == "CALLER":
                    detected_lang = detect_language_from_text(transcript)
                    if detected_lang != 'en':
                        caller_languages[self.caller_number] = detected_lang
                        logger.info(f"🌍 Detected caller language: {detected_lang} for {self.caller_number}")

                timestamp = datetime.now().isoformat()
                message_data = {
                    "speaker": self.speaker_label,
                    "message": transcript,
                    "timestamp": timestamp,
                    "caller_number": self.caller_number,
                    "is_final": is_final,
                    "confidence": confidence,
                    "type": "transcription",
                }

                # Handle dispatcher translation (which also broadcasts)
                if is_final and self.speaker_label == "DISPATCH":
                    if self.event_loop and self.event_loop.is_running():
                        asyncio.run_coroutine_threadsafe(
                            self.handle_dispatcher_translation(transcript), 
                            self.event_loop
                        )
                else:
                    # For CALLER messages, broadcast normally (no translation needed)
                    if self.event_loop and self.event_loop.is_running():
                        asyncio.run_coroutine_threadsafe(self.broadcast_to_clients(message_data), self.event_loop)

                # Save to transcript (no logging to terminal)
                if is_final:
                    ts = datetime.now().strftime("%H:%M:%S")
                    final_line = f"[{ts}] [{self.speaker_label}]: {transcript}"
                    self.full_transcript.append(final_line)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"❌ Error receiving from Deepgram for {self.speaker_label}: {e}")

    def stream_audio(self, audio_data: bytes):
        """Queue audio bytes (PCM16) to be sent to Deepgram"""
        if not self.is_active:
            # If not connected, we can drop or attempt to queue (but queue requires loop)
            return
        try:
            self.audio_queue.put_nowait(audio_data)
        except Exception:
            # Queue full: drop oldest then put again
            try:
                _ = self.audio_queue.get_nowait()
                self.audio_queue.put_nowait(audio_data)
            except Exception:
                pass

    async def stop(self):
        """Stop Deepgram transcription session"""
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
            logger.error(f"❌ Error while closing Deepgram WS for {self.speaker_label}: {e}")
        
        try:
            if self._send_task:
                self._send_task.cancel()
            if self._recv_task:
                self._recv_task.cancel()
        except Exception:
            pass
        
        logger.info(f"🔒 Deepgram session closed for {self.speaker_label}")

    def save_transcript(self, filename: str):
        """Save transcript to file"""
        if self.full_transcript:
            transcripts_dir = config.get("TRANSCRIPTS_DIR", "transcripts")
            os.makedirs(transcripts_dir, exist_ok=True)
            filepath = os.path.join(transcripts_dir, filename)
            try:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write("\n".join(self.full_transcript))
                logger.info(f"📝 {self.speaker_label} transcript saved: {filepath}")
            except Exception as e:
                logger.error(f"Failed to save transcript: {e}")


# Audio threads removed - all audio now routed through browser WebSocket


# Settings Endpoints
@app.post("/settings")
async def update_settings(request: Request):
    """Update server configuration"""
    try:
        data = await request.json()
        config.update(data)
        
        # Update globals
        global DEEPGRAM_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
        global GOOGLE_API_KEY, PORT, ENVIRONMENT, ALLOWED_ORIGINS, NGROK_URL
        global ELEVENLABS_API_KEY, ELEVENLABS_VOICE, SARVAM_API_KEY
        
        DEEPGRAM_API_KEY = config.get("DEEPGRAM_API_KEY")
        TWILIO_ACCOUNT_SID = config.get("TWILIO_ACCOUNT_SID")
        TWILIO_AUTH_TOKEN = config.get("TWILIO_AUTH_TOKEN")
        TWILIO_PHONE_NUMBER = config.get("TWILIO_PHONE_NUMBER")
        GOOGLE_API_KEY = config.get("GOOGLE_API_KEY")
        PORT = int(config.get("PORT", "8000"))
        ENVIRONMENT = config.get("ENVIRONMENT", "development")
        ALLOWED_ORIGINS = config.get("ALLOWED_ORIGINS", "*").split(",")
        NGROK_URL = config.get("NGROK_URL")
        ELEVENLABS_API_KEY = config.get("ELEVENLABS_API_KEY")
        ELEVENLABS_VOICE = config.get("ELEVENLABS_VOICE", "uYXf8XasLslADfZ2MB4u")
        SARVAM_API_KEY = config.get("SARVAM_API_KEY")
        
        logger.info("✅ Settings updated successfully")
        
        return {"status": "success", "message": "Settings updated"}
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/settings")
async def get_settings():
    """Get current server configuration (masked)"""
    c = config._config.copy()
    # Mask keys
    for key in ["DEEPGRAM_API_KEY", "TWILIO_AUTH_TOKEN", "GOOGLE_API_KEY", "ELEVENLABS_API_KEY", "SARVAM_API_KEY", "GROQ_API_KEY", "ASSEMBLYAI_API_KEY"]:
        if c.get(key):
            val = str(c[key])
            if len(val) > 4:
                c[key] = val[:4] + "*" * (len(val) - 4)
            else:
                c[key] = "****"
    return c


# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for monitoring"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        environment=ENVIRONMENT,
        deepgram_configured=bool(DEEPGRAM_API_KEY),
        twilio_configured=bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)
    )


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "service": "Voice Transcription Server",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "websocket_status": "/ws/status",
            "twiml": "/twiml",
            "websocket": "/ws",
            "transcription": "/client/{caller_number}",
            "notifications": "/client/notifications",
            "audio_stream": "/audio/stream",
            "fetch_recordings_post": "/recordings/fetch (POST with date and optional call_sid)",
            "fetch_recordings_get": "/recordings/fetch/{date}?call_sid=optional"
        }
    }


@app.get("/ws/status")
async def websocket_status():
    """WebSocket status endpoint"""
    return {
        "status": "available",
        "notification_clients": len(notification_clients),
        "transcription_sessions": len(transcription_clients),
        "active_calls": len([s for s in sessions.values() if s.get("active")]),
        "caller_languages": dict(caller_languages),  # Show detected languages
        "timestamp": datetime.now().isoformat()
    }


@app.post("/twiml")
async def twiml_endpoint(request: Request):
    """Twilio webhook endpoint for incoming calls"""
    try:
        form_data = await request.form()
        From = form_data.get("From")
        To = form_data.get("To")
        CallSid = form_data.get("CallSid")
        CallerName = form_data.get("CallerName")
        CallerCity = form_data.get("CallerCity")
        CallerState = form_data.get("CallerState")
        CallerCountry = form_data.get("CallerCountry")

        logger.info(f"🔔 /twiml endpoint called - CallSid: {CallSid}, From: {From}")

        if CallSid and From:
            sessions[CallSid] = {
                "caller_number": From,
                "to_number": To,
                "caller_name": CallerName,
                "caller_city": CallerCity,
                "caller_state": CallerState,
                "caller_country": CallerCountry,
                "active": False
            }
            logger.info(f"📞 Incoming call: {From} -> {To}")

        ws_url = getattr(request.app.state, 'ws_url', WS_URL)
        xml_response = f"""<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Connect>
            <Stream url="{ws_url}">
              <Parameter name="track" value="both_tracks" />
            </Stream>
          </Connect>
        </Response>"""
        return Response(content=xml_response, media_type="text/xml")
    except Exception as e:
        logger.error(f"Error in twiml endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.websocket("/client/notifications")
async def notification_websocket(websocket: WebSocket):
    """WebSocket endpoint for call notifications"""
    await websocket.accept()
    notification_clients.add(websocket)
    logger.info(f"🔔 Notification client connected (total: {len(notification_clients)})")
    
    try:
        await websocket.send_json({
            "type": "connected",
            "timestamp": datetime.now().isoformat(),
            "message": "Connected to call notifications"
        })
        
        while True:
            try:
                # Add timeout to prevent hanging connections
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                await websocket.send_json({
                    "type": "keepalive",
                    "timestamp": datetime.now().isoformat()
                })
            except asyncio.TimeoutError:
                # Send keepalive ping
                await websocket.send_json({
                    "type": "keepalive",
                    "timestamp": datetime.now().isoformat()
                })
    except WebSocketDisconnect:
        notification_clients.discard(websocket)
        logger.info(f"🔔 Notification client disconnected (remaining: {len(notification_clients)})")
    except Exception as e:
        logger.error(f"Error in notification websocket: {e}")
        notification_clients.discard(websocket)


@app.websocket("/client/{caller_number}")
async def transcription_websocket(websocket: WebSocket, caller_number: str):
    """WebSocket endpoint for transcription streams"""
    await websocket.accept()
    
    if caller_number not in transcription_clients:
        transcription_clients[caller_number] = set()
    transcription_clients[caller_number].add(websocket)
    
    logger.info(f"📱 Transcription client connected for {caller_number} (total: {len(transcription_clients[caller_number])})")
    
    try:
        await websocket.send_json({
            "type": "connected",
            "caller_number": caller_number,
            "timestamp": datetime.now().isoformat(),
            "message": f"Connected to transcription stream for {caller_number}"
        })
        
        while True:
            try:
                # Add timeout to prevent hanging connections
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                await websocket.send_json({
                    "type": "keepalive",
                    "timestamp": datetime.now().isoformat()
                })
            except asyncio.TimeoutError:
                # Send keepalive ping
                await websocket.send_json({
                    "type": "keepalive",
                    "timestamp": datetime.now().isoformat()
                })
    except WebSocketDisconnect:
        transcription_clients[caller_number].discard(websocket)
        logger.info(f"📱 Transcription client disconnected from {caller_number} (remaining: {len(transcription_clients.get(caller_number,[]))})")
        if not transcription_clients.get(caller_number):
            transcription_clients.pop(caller_number, None)
    except Exception as e:
        logger.error(f"Error in transcription websocket: {e}")
        transcription_clients[caller_number].discard(websocket)


@app.post("/audio/stream")
async def stream_audio_from_browser(request: AudioStreamRequest):
    """Stream audio from browser to phone AND transcribe it"""
    try:
        # Decode audio from browser (PCM16 at 16kHz wideband)
        audio_data = base64.b64decode(request.audio)
        
        # Apply gain boost on server side (browser's noise suppression handles noise)
        try:
            # Apply gain boost: 2x (already boosted 3.5x in browser = 7x total)
            audio_data = audioop.mul(audio_data, 2, 2.0)
        except Exception as e:
            logger.warning(f"Could not apply gain boost: {e}")
        
        caller_number = request.caller_number
        
        # Get caller's detected language
        caller_lang = caller_languages.get(caller_number, 'en')
        dispatcher_lang = dispatcher_languages.get(caller_number, 'en')
        
        # Determine if we need to block original audio and use translation instead
        # Block audio when languages don't match (translation will be sent via TTS)
        needs_translation = dispatcher_lang != caller_lang
        
        if needs_translation:
            # Languages don't match - BLOCK original dispatcher audio
            # Translated audio will be sent via TTS instead
            logger.debug(f"🚫 Blocking dispatcher audio (will use translation: {dispatcher_lang}→{caller_lang})")
            pass  # Do nothing - audio is blocked
        else:
            # Languages match - send original audio to phone
            # Downsample from 16kHz to 8kHz for Twilio (phone network requirement)
            # Twilio only supports 8kHz μ-law
            try:
                audio_8khz = audioop.ratecv(audio_data, 2, 1, RATE, 8000, None)[0]
            except Exception as e:
                logger.error(f"Failed to resample audio: {e}")
                audio_8khz = audio_data
            
            # Convert to μ-law for Twilio
            ulaw_data = audioop.lin2ulaw(audio_8khz, 2)
            ulaw_base64 = base64.b64encode(ulaw_data).decode("utf-8")
            
            # Queue audio to send to phone
            try:
                audio_to_phone.put_nowait(ulaw_base64)
            except Exception:
                # Queue full, drop oldest and add new
                try:
                    audio_to_phone.get_nowait()
                    audio_to_phone.put_nowait(ulaw_base64)
                except Exception:
                    pass
        
        # Send to browser transcriber (DISPATCH/CONTROL_ROOM audio)
        if caller_number in browser_transcribers:
            browser_trans = browser_transcribers[caller_number].get("browser_transcriber")
            if browser_trans:
                try:
                    browser_trans.stream_audio(audio_data)
                    # Log occasionally to verify audio flow
                    import random
                    if random.random() < 0.01:  # 1% of packets
                        logger.info(f"📤 Streaming audio to DISPATCH transcriber: {len(audio_data)} bytes")
                except Exception as e:
                    logger.error(f"Error streaming to browser transcriber: {e}")
        else:
            logger.warning(f"⚠️ No browser transcriber found for {caller_number}. Available: {list(browser_transcribers.keys())}")
        
        return {"status": "success", "message": "Audio queued and transcribed"}
    except ValueError as e:
        logger.error(f"Invalid audio data: {e}")
        raise HTTPException(status_code=400, detail="Invalid audio data")
    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        raise HTTPException(status_code=500, detail="Audio processing error")


@app.post("/recordings/fetch", response_model=RecordingResponse)
async def fetch_recordings(request: RecordingRequest):
    """Fetch call recordings from Twilio for a specific date"""
    result = fetch_twilio_recordings(request.date, request.call_sid)
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return RecordingResponse(**result)


@app.get("/recordings/fetch/{date}")
async def fetch_recordings_by_date(date: str, call_sid: Optional[str] = None):
    """Fetch call recordings from Twilio for a specific date (GET endpoint)"""
    result = fetch_twilio_recordings(date, call_sid)
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result


# Training endpoints
@app.post("/training/start", response_model=TrainingResponse)
async def start_training_session(request: TrainingStartRequest):
    """Start a new training session with a random scenario"""
    try:
        if not training_scenarios or not training_client:
            raise HTTPException(status_code=500, detail="Training system not initialized")
        
        session_id = request.session_id
        
        # Check if session already exists
        if session_id in training_sessions:
            raise HTTPException(status_code=400, detail="Session already exists")
        
        # Select random scenario
        scenario = select_random_scenario(training_scenarios)
        
        # Initialize chat session
        title = scenario.get("title", "Unknown Emergency")
        desc = scenario.get("desc", "No description")
        location = scenario.get("twp", "Unknown Location")

        intro_prompt = f"""
You are simulating an emergency call for a 911 dispatcher training. Your role is to be the CALLER.

**CRITICAL INSTRUCTIONS FOR YOUR ROLE:**
1.  **NO DESCRIPTIVE ACTIONS:** Do NOT use parentheses or asterisks to describe sounds, actions, or emotions (e.g., no `(sobbing)`, `*sirens wail*`, `(gasping)`).
2.  **STRAIGHT CONVERSATION ONLY:** Your responses must only contain the words spoken by the caller. It should be a direct, back-and-forth conversation.
3.  **BE A DESCRIPTIVE REPORTER:** Act as a person urgently reporting an emergency. When you answer, provide relevant details about what you see, hear, and know. Your goal is to paint a clear picture of the scene with your words.
4.  **ELABORATE WHEN ASKED:** Start with an urgent opening line. When the dispatcher asks a question, answer it fully. For example, if they ask for the location, don't just say "the train tracks." Say something like, "It's under the train tracks on Maple Avenue, just past the old factory." Provide the important details you have.

**SCENARIO BRIEFING:**
*   **INCIDENT TYPE:** {title}
*   **DESCRIPTION:** {desc}
*   **LOCATION:** {location}

Begin the call now with your opening line. It should be urgent and give a key detail about the emergency.
        """

        chat = training_client.chats.create(model="gemini-2.5-flash")
        response = chat.send_message(intro_prompt)
        
        # Store session data
        training_sessions[session_id] = {
            "scenario": scenario,
            "chat": chat,
            "conversation": [],
            "started_at": datetime.now().isoformat(),
            "status": "active"
        }
        
        # Add initial caller message to conversation
        training_sessions[session_id]["conversation"].append({
            "sender": "Caller",
            "message": response.text,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"🎓 Started training session {session_id} with scenario: {title}")
        
        return TrainingResponse(
            status="success",
            session_id=session_id,
            message="Training session started",
            caller_response=response.text
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting training session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/training/message", response_model=TrainingResponse)
async def send_training_message(request: TrainingMessageRequest):
    """Send a dispatcher message to the training session"""
    try:
        session_id = request.session_id
        
        if session_id not in training_sessions:
            raise HTTPException(status_code=404, detail="Training session not found")
        
        session = training_sessions[session_id]
        
        if session["status"] != "active":
            raise HTTPException(status_code=400, detail="Training session is not active")
        
        chat = session["chat"]
        
        # Add dispatcher message to conversation
        session["conversation"].append({
            "sender": "Dispatch",
            "message": request.message,
            "timestamp": datetime.now().isoformat()
        })
        
        # Get caller response
        response = chat.send_message(request.message)
        
        # Add caller response to conversation
        session["conversation"].append({
            "sender": "Caller",
            "message": response.text,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"🎓 Training session {session_id}: Dispatcher sent message, got caller response")
        
        return TrainingResponse(
            status="success",
            session_id=session_id,
            message="Message sent and response received",
            caller_response=response.text
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending training message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/training/end", response_model=TrainingResponse)
async def end_training_session(request: TrainingEndRequest):
    """End a training session and get evaluation"""
    try:
        session_id = request.session_id
        
        if session_id not in training_sessions:
            raise HTTPException(status_code=404, detail="Training session not found")
        
        session = training_sessions[session_id]
        
        if session["status"] != "active":
            raise HTTPException(status_code=400, detail="Training session is not active")
        
        chat = session["chat"]
        
        # Get evaluation
        grading_prompt = """
You are evaluating a 911 DISPATCHER/OPERATOR trainee's performance in handling an emergency call. 
Focus ONLY on the dispatcher's responses and actions, NOT the caller.

Analyze the dispatcher's performance based on:

**CRITICAL EVALUATION CRITERIA:**

1. **Information Gathering (25 points)**
   - Did they ask the right questions in the right order?
   - Did they gather all essential information (location, nature of emergency, injuries, hazards)?
   - Were questions clear and specific?
   - Did they avoid redundant or unnecessary questions?

2. **Communication Clarity (20 points)**
   - Were instructions clear and easy to understand?
   - Did they use simple, direct language?
   - Did they avoid jargon or confusing terms?
   - Were they concise without being rushed?

3. **Response Speed & Efficiency (15 points)**
   - Did they respond promptly to caller statements?
   - Did they prioritize critical information first?
   - Did they avoid wasting time on non-essential details?
   - Was the pace appropriate for the emergency?

4. **Calmness & Composure (15 points)**
   - Did they maintain a calm, professional tone?
   - Did they help calm an anxious or panicked caller?
   - Did they stay focused under pressure?
   - Did they project confidence and control?

5. **Empathy & Reassurance (10 points)**
   - Did they acknowledge the caller's distress?
   - Did they provide appropriate reassurance?
   - Did they show understanding and compassion?
   - Did they maintain human connection while staying professional?

6. **Protocol Adherence (10 points)**
   - Did they follow standard emergency dispatch protocols?
   - Did they gather information in logical sequence?
   - Did they provide appropriate pre-arrival instructions?
   - Did they document key details properly?

7. **Problem-Solving (5 points)**
   - Did they adapt to unexpected information?
   - Did they handle caller confusion effectively?
   - Did they think critically about the situation?

**OUTPUT FORMAT:**

Score: [XX]%

**Evaluation:**

**Strengths:**
- [List 2-3 specific things the dispatcher did well]

**Areas for Improvement:**
- [List 2-3 specific areas where the dispatcher could improve]

**Key Observations:**
- [2-3 specific examples from the conversation showing good or poor performance]

**Overall Assessment:**
[1-2 sentences summarizing the dispatcher's readiness and what they should focus on]

**IMPORTANT:** 
- Evaluate ONLY the dispatcher's performance, NOT the caller
- Be specific with examples from the conversation
- Focus on actionable feedback
- Consider the context and severity of the emergency
- Rate based on professional emergency dispatch standards
        """
        
        eval_response = chat.send_message(grading_prompt)
        
        # Extract confidence score from evaluation
        confidence_score = 75  # Default score
        try:
            import re
            score_match = re.search(r'(\d{1,3})%', eval_response.text)
            if score_match:
                confidence_score = int(score_match.group(1))
        except (ValueError, AttributeError, TypeError) as e:
            logger.warning(f"Could not parse confidence score from evaluation: {e}")
        
        # Update session
        session["status"] = "completed"
        session["ended_at"] = datetime.now().isoformat()
        session["evaluation"] = eval_response.text
        session["confidence_score"] = confidence_score
        
        logger.info(f"🎓 Ended training session {session_id} with score: {confidence_score}%")
        
        return TrainingResponse(
            status="success",
            session_id=session_id,
            message="Training session ended",
            confidence_score=confidence_score,
            evaluation=eval_response.text
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ending training session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/training/session/{session_id}")
async def get_training_session(session_id: str):
    """Get training session details"""
    if session_id not in training_sessions:
        raise HTTPException(status_code=404, detail="Training session not found")
    
    session = training_sessions[session_id]
    
    return {
        "session_id": session_id,
        "scenario": session["scenario"],
        "conversation": session["conversation"],
        "status": session["status"],
        "started_at": session["started_at"],
        "ended_at": session.get("ended_at"),
        "confidence_score": session.get("confidence_score"),
        "evaluation": session.get("evaluation")
    }






# Main WebSocket endpoint for Twilio Stream
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint for Twilio audio streaming"""
    await websocket.accept()
    call_sid = None
    stream_sid = None
    caller_number = None

    async def send_laptop_audio():
        packet_count = 0
        logger.info(f"🎵 Audio sender task started - monitoring queue")
        last_queue_check = 0
        try:
            while True:
                try:
                    if not audio_to_phone.empty():
                        audio_payload = audio_to_phone.get_nowait()
                        message = {
                            "event": "media",
                            "streamSid": stream_sid,
                            "media": {
                                "payload": audio_payload,
                                "track": "outbound"
                            }
                        }
                        await websocket.send_text(json.dumps(message))
                        packet_count += 1
                        if packet_count % 50 == 0:
                            logger.info(f"📤 Sent {packet_count} audio packets to phone")
                        elif packet_count <= 5:
                            logger.info(f"📤 Sent packet #{packet_count} to phone")
                    else:
                        # Log queue status periodically
                        if packet_count - last_queue_check > 100:
                            logger.info(f"⏳ Queue empty, waiting for audio... (sent {packet_count} so far)")
                            last_queue_check = packet_count
                        await asyncio.sleep(0.0005)
                except Exception as e:
                    logger.error(f"❌ Error sending audio to Twilio: {e}")
                    break
        except asyncio.CancelledError:
            logger.info(f"📤 Audio sender task cancelled after {packet_count} packets")
            pass

    send_task = None

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["event"] == "start":
                call_sid = message["start"]["callSid"]
                stream_sid = message["start"]["streamSid"]

                caller_number = "unknown"
                if call_sid in sessions:
                    caller_number = sessions[call_sid].get("caller_number", "unknown")
                    sessions[call_sid]["active"] = True
                    sessions[call_sid]["stream_sid"] = stream_sid
                else:
                    sessions[call_sid] = {"active": True, "stream_sid": stream_sid, "caller_number": caller_number}

                logger.info(f"📞 Call stream started from {caller_number} (ID: {call_sid})")

                # notify notification clients
                notification_message = {
                    "type": "call_started",
                    "caller_number": caller_number,
                    "call_sid": call_sid,
                    "timestamp": datetime.now().isoformat()
                }
                for client in list(notification_clients):
                    try:
                        await client.send_json(notification_message)
                    except Exception as e:
                        logger.error(f"❌ Failed to notify client: {e}")
                        notification_clients.discard(client)

                # Start Deepgram transcribers (browser-only mode)
                if DEEPGRAM_API_KEY:
                    loop = asyncio.get_event_loop()
                    
                    # Browser transcriber for DISPATCH/CONTROL_ROOM audio
                    browser_transcriber = DeepgramRealtimeTranscriber("DISPATCH", caller_number, loop)
                    asyncio.create_task(browser_transcriber.connect())
                    browser_transcribers[caller_number] = {
                        "browser_transcriber": browser_transcriber
                    }
                    
                    # Phone transcriber for CALLER audio
                    phone_transcriber = DeepgramRealtimeTranscriber("CALLER", caller_number, loop)
                    asyncio.create_task(phone_transcriber.connect())
                    active_transcribers[call_sid] = {
                        "phone_transcriber": phone_transcriber
                    }
                    
                    logger.info("✅ LIVE transcription active (Browser + Phone)")
                else:
                    logger.warning("⚠️  Transcription disabled (no Deepgram API key)")

                send_task = asyncio.create_task(send_laptop_audio())

            elif message["event"] == "media":
                # inbound media (from caller)
                media = message["media"]
                track = media.get("track", "inbound")
                if track == "inbound":
                    payload = media.get("payload")
                    if payload:
                        try:
                            ulaw_data = base64.b64decode(payload)
                            pcm_data_8khz = audioop.ulaw2lin(ulaw_data, 2)
                            
                            # Better upsampling from 8kHz to 16kHz
                            try:
                                # Try numpy for best quality
                                import numpy as np
                                
                                # Convert bytes to int16 array
                                audio_array = np.frombuffer(pcm_data_8khz, dtype=np.int16)
                                
                                # High-quality upsampling: duplicate + filter
                                upsampled = np.repeat(audio_array, 2)
                                
                                # Apply low-pass filter to smooth
                                kernel = np.array([0.25, 0.5, 0.25])
                                filtered = np.convolve(upsampled, kernel, mode='same')
                                
                                pcm_data_16khz = filtered.astype(np.int16).tobytes()
                                
                            except ImportError:
                                # Fallback: Manual upsampling with linear interpolation
                                try:
                                    import struct
                                    
                                    # Unpack 8kHz samples
                                    samples_8k = struct.unpack(f'<{len(pcm_data_8khz)//2}h', pcm_data_8khz)
                                    
                                    # Upsample 8kHz to 16kHz (2x interpolation - simple and efficient)
                                    samples_16k = []
                                    for i in range(len(samples_8k) - 1):
                                        samples_16k.append(samples_8k[i])
                                        # Linear interpolation between samples
                                        interpolated = (samples_8k[i] + samples_8k[i + 1]) // 2
                                        samples_16k.append(interpolated)
                                    samples_16k.append(samples_8k[-1])  # Last sample
                                    
                                    # Pack back to bytes
                                    pcm_data_16khz = struct.pack(f'<{len(samples_16k)}h', *samples_16k)
                                    
                                except Exception:
                                    # Last resort: audioop - upsample to 16kHz
                                    pcm_data_16khz = audioop.ratecv(pcm_data_8khz, 2, 1, 8000, RATE, None)[0]
                                    
                            except Exception as e:
                                logger.error(f"Failed to upsample audio: {e}")
                                # Fallback to audioop - upsample to 16kHz
                                pcm_data_16khz = audioop.ratecv(pcm_data_8khz, 2, 1, 8000, RATE, None)[0]
                            
                            # Save for recording (16kHz)
                            try:
                                with recording_lock:
                                    phone_audio_recording.append(pcm_data_16khz)
                            except Exception:
                                pass
                            
                            # Forward to Deepgram phone transcriber for CALLER transcription (16kHz)
                            if call_sid in active_transcribers:
                                phone_trans = active_transcribers[call_sid].get("phone_transcriber")
                                if phone_trans:
                                    phone_trans.stream_audio(pcm_data_16khz)
                            
                            # Send upsampled 16kHz audio to browser for playback (better quality)
                            if caller_number in transcription_clients:
                                # Send 16kHz PCM directly (no μ-law compression for better quality)
                                payload_16khz = base64.b64encode(pcm_data_16khz).decode("utf-8")
                                
                                audio_message = {
                                    "type": "audio",
                                    "audio": payload_16khz,
                                    "sample_rate": RATE,  # Indicate this is 16kHz
                                    "encoding": "pcm16",   # Raw PCM16, not μ-law
                                    "timestamp": datetime.now().isoformat()
                                }
                                for client in list(transcription_clients[caller_number]):
                                    try:
                                        await client.send_json(audio_message)
                                    except Exception as e:
                                        logger.error(f"Failed to send audio to browser: {e}")
                                        transcription_clients[caller_number].discard(client)

                        except Exception as e:
                            logger.error(f"❌ Error handling inbound media: {e}")

            elif message["event"] == "stop":
                logger.info(f"📴 Call ended from {caller_number}")

                notification_message = {
                    "type": "call_ended",
                    "caller_number": caller_number,
                    "call_sid": call_sid,
                    "timestamp": datetime.now().isoformat()
                }
                for client in list(notification_clients):
                    try:
                        await client.send_json(notification_message)
                    except Exception as e:
                        logger.error(f"❌ Failed to notify client: {e}")
                        notification_clients.discard(client)

                # Stop transcribers
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                
                # Stop phone transcriber
                if call_sid in active_transcribers:
                    transcribers = active_transcribers[call_sid]
                    phone = transcribers.get("phone_transcriber")
                    if phone:
                        asyncio.create_task(phone.stop())
                        phone.save_transcript(f"transcript_caller_{caller_number}_{timestamp}.txt")
                    del active_transcribers[call_sid]
                
                # Stop browser transcriber
                if caller_number in browser_transcribers:
                    transcribers = browser_transcribers[caller_number]
                    browser = transcribers.get("browser_transcriber")
                    if browser:
                        asyncio.create_task(browser.stop())
                        browser.save_transcript(f"transcript_dispatch_{caller_number}_{timestamp}.txt")
                    del browser_transcribers[caller_number]
                
                # Clean up language state
                if caller_number in caller_languages:
                    del caller_languages[caller_number]
                if caller_number in dispatcher_languages:
                    del dispatcher_languages[caller_number]
                if caller_number in dispatcher_should_translate:
                    del dispatcher_should_translate[caller_number]
                logger.info(f"🧹 Cleaned up language state for {caller_number}")

                if send_task:
                    send_task.cancel()
                break

    except WebSocketDisconnect:
        logger.info(f"📴 WebSocket connection closed for call {call_sid}")
        if call_sid in active_transcribers:
            transcribers = active_transcribers[call_sid]
            if transcribers.get("phone_transcriber"):
                asyncio.create_task(transcribers["phone_transcriber"].stop())
            del active_transcribers[call_sid]
        if caller_number and caller_number in browser_transcribers:
            transcribers = browser_transcribers[caller_number]
            if transcribers.get("browser_transcriber"):
                asyncio.create_task(transcribers["browser_transcriber"].stop())
            del browser_transcribers[caller_number]
        if caller_number:
            if caller_number in caller_languages:
                del caller_languages[caller_number]
            if caller_number in dispatcher_languages:
                del dispatcher_languages[caller_number]
            if caller_number in dispatcher_should_translate:
                del dispatcher_should_translate[caller_number]
        if send_task:
            send_task.cancel()
        if call_sid and call_sid in sessions:
            sessions.pop(call_sid, None)
    except Exception as e:
        logger.error(f"Error in websocket endpoint: {e}")
        if call_sid in active_transcribers:
            transcribers = active_transcribers[call_sid]
            if transcribers.get("phone_transcriber"):
                asyncio.create_task(transcribers["phone_transcriber"].stop())
            del active_transcribers[call_sid]
        if caller_number and caller_number in browser_transcribers:
            transcribers = browser_transcribers[caller_number]
            if transcribers.get("browser_transcriber"):
                asyncio.create_task(transcribers["browser_transcriber"].stop())
            del browser_transcribers[caller_number]
        if caller_number:
            if caller_number in caller_languages:
                del caller_languages[caller_number]
            if caller_number in dispatcher_languages:
                del dispatcher_languages[caller_number]
            if caller_number in dispatcher_should_translate:
                del dispatcher_should_translate[caller_number]
        if send_task:
            send_task.cancel()


def main():
    """Main entry point for the server"""
    logger.info("=" * 70)
    logger.info("🎙️  Voice Transcription Server")
    logger.info("=" * 70)
    logger.info(f"Environment: {ENVIRONMENT}")
    logger.info(f"Port: {PORT}")
    logger.info(f"Workers: 3")
    logger.info(f"Deepgram: {'✅ Configured' if DEEPGRAM_API_KEY else '❌ Not configured'}")
    logger.info(f"Twilio: {'✅ Configured' if TWILIO_ACCOUNT_SID else '❌ Not configured'}")
    logger.info("=" * 70)
    
    # Configure uvicorn with 3 workers for better performance
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=PORT,
        workers=3,  # 3 worker processes for handling concurrent requests
        log_level="info" if ENVIRONMENT == "development" else "warning",
        access_log=ENVIRONMENT == "development",
        ws_ping_interval=20,
        ws_ping_timeout=20,
        timeout_keep_alive=30,
    )
    
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\n🛑 Server stopped by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        raise
