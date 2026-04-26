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
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import asyncio
import threading
from queue import Queue
from concurrent.futures import ThreadPoolExecutor

# Install: pip install assemblyai
import assemblyai as aai
from assemblyai.streaming.v3 import (
    StreamingClient,
    StreamingClientOptions,
    StreamingEvents,
    StreamingParameters,
    TurnEvent,
    BeginEvent,
    TerminationEvent,
    StreamingError,
)

# Load environment variables
load_dotenv()

# AssemblyAI API Key
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
if ASSEMBLYAI_API_KEY:
    aai.settings.api_key = ASSEMBLYAI_API_KEY

# Audio recording buffers
laptop_audio_recording = []
phone_audio_recording = []
recording_lock = threading.Lock()

# Audio configuration - ULTRA LOW LATENCY
CHUNK = 160  # 20ms at 8kHz (Twilio's native chunk size)
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 8000  # Twilio uses 8kHz μ-law

# Transcription buffer settings - MINIMAL for lowest latency
TRANSCRIPTION_BUFFER_MS = 20  # 20ms buffer (same as audio chunk)
TRANSCRIPTION_CHUNK_SIZE = (RATE * 2 * TRANSCRIPTION_BUFFER_MS) // 1000  # bytes

# Voice Activity Detection settings
SILENCE_THRESHOLD = 300  # Lower threshold for better sensitivity
SPEECH_FRAMES_REQUIRED = 1  # Instant response

def start_ngrok(port):
    """Start ngrok tunnel"""
    try:
        print(f"🚀 Starting ngrok tunnel on port {port}...")
        process = subprocess.Popen(
            ["ngrok", "http", str(port)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        time.sleep(3)
        return process
    except FileNotFoundError:
        raise ValueError("ngrok not found. Install from: https://ngrok.com/download")

def get_ngrok_url(max_retries=5):
    """Get active ngrok tunnel URL"""
    for attempt in range(max_retries):
        try:
            response = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=5)
            tunnels = response.json()["tunnels"]
            
            for tunnel in tunnels:
                if tunnel["proto"] == "https":
                    public_url = tunnel["public_url"]
                    domain = public_url.replace("https://", "")
                    print(f"✅ Ngrok URL: {domain}")
                    return domain
            
            if attempt < max_retries - 1:
                time.sleep(2)
        except requests.exceptions.RequestException:
            if attempt < max_retries - 1:
                time.sleep(2)
    
    raise ValueError("Could not get ngrok URL")

def update_twilio_webhook(domain):
    """Update Twilio webhook automatically"""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    phone_number = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not all([account_sid, auth_token, phone_number]):
        print("⚠️  Set Twilio credentials in .env file")
        return False
    
    try:
        from twilio.rest import Client
        
        client = Client(account_sid, auth_token)
        webhook_url = f"https://{domain}/twiml"
        
        incoming_phone_numbers = client.incoming_phone_numbers.list(phone_number=phone_number)
        
        if not incoming_phone_numbers:
            print(f"⚠️  Phone number {phone_number} not found")
            return False
        
        phone_sid = incoming_phone_numbers[0].sid
        
        client.incoming_phone_numbers(phone_sid).update(
            voice_url=webhook_url,
            voice_method='POST'
        )
        
        print(f"✅ Twilio webhook updated: {webhook_url}")
        return True
        
    except ImportError:
        print("⚠️  Install twilio: pip install twilio")
        return False
    except Exception as e:
        print(f"⚠️  Failed to update webhook: {e}")
        return False

def save_recordings():
    """Save all recorded audio to WAV files"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    with recording_lock:
        if laptop_audio_recording:
            laptop_filename = f"laptop_{timestamp}.wav"
            wf = wave.open(laptop_filename, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)
            wf.setframerate(RATE)
            wf.writeframes(b''.join(laptop_audio_recording))
            wf.close()
            print(f"\n💾 Laptop audio saved: {laptop_filename}")
        
        if phone_audio_recording:
            phone_filename = f"phone_{timestamp}.wav"
            wf = wave.open(phone_filename, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)
            wf.setframerate(RATE)
            wf.writeframes(b''.join(phone_audio_recording))
            wf.close()
            print(f"💾 Phone audio saved: {phone_filename}")

# Configuration
PORT = int(os.getenv("PORT", "8080"))
DOMAIN = os.getenv("NGROK_URL")
ngrok_process = None

if not DOMAIN:
    ngrok_process = start_ngrok(PORT)
    DOMAIN = get_ngrok_url()

WS_URL = f"wss://{DOMAIN}/ws"
update_twilio_webhook(DOMAIN)

# Store active sessions
sessions = {}

# Store connected transcription clients
transcription_clients = set()

# Audio queues for bidirectional streaming (MINIMAL queues for real-time)
audio_to_phone = Queue(maxsize=3)  # Laptop mic → Phone (60ms max buffer)
audio_from_phone = Queue(maxsize=3)  # Phone → Laptop speakers (60ms max buffer)

# Audio broadcast queues for transcription clients (can drop frames)
laptop_audio_broadcast = Queue(maxsize=25)
phone_audio_broadcast = Queue(maxsize=25)

# PyAudio instance
p = pyaudio.PyAudio()

# Create FastAPI app
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Universal-Streaming v3 Transcriber with non-blocking audio streaming
class UniversalStreamingTranscriber:
    def __init__(self, speaker_label):
        self.speaker_label = speaker_label
        self.full_transcript = []
        self.is_active = False
        self.client = None
        self.executor = ThreadPoolExecutor(max_workers=1)  # Dedicated thread for transcription
        
        if not ASSEMBLYAI_API_KEY:
            print(f"⚠️  No AssemblyAI API key - transcription disabled for {speaker_label}")
            return
        
        # Create streaming client
        options = StreamingClientOptions(
            api_key=aai.settings.api_key,
            api_host="streaming.assemblyai.com"
        )
        self.client = StreamingClient(options)
        
        # Register event handlers
        self.client.on(StreamingEvents.Begin, self.on_begin)
        self.client.on(StreamingEvents.Turn, self.on_turn)
        self.client.on(StreamingEvents.Termination, self.on_terminated)
        self.client.on(StreamingEvents.Error, self.on_error)
        
    def on_begin(self, client: StreamingClient, event: BeginEvent):
        print(f"✅ {self.speaker_label} transcription started (Session: {event.id})")
    
    def on_turn(self, client: StreamingClient, event: TurnEvent):
        if not event.transcript or not event.transcript.strip():
            return
        
        # Display LIVE transcription in real-time
        if hasattr(event, 'turn_is_formatted') and event.turn_is_formatted:
            # Final formatted transcript
            timestamp = datetime.now().strftime("%H:%M:%S")
            final_line = f"[{timestamp}] [{self.speaker_label}]: {event.transcript}"
            print(f"\n{final_line}", flush=True)
            self.full_transcript.append(final_line)
        elif not event.end_of_turn:
            # Partial transcript - show in real-time
            print(f"\r[{self.speaker_label}]: {event.transcript}                    ", end="", flush=True)
    
    def on_error(self, client: StreamingClient, error: StreamingError):
        error_str = str(error)
        # Only show non-duration-violation errors
        if "Duration Violation" not in error_str:
            print(f"\n❌ {self.speaker_label} transcription error: {error}")
    
    def on_terminated(self, client: StreamingClient, event: TerminationEvent):
        print(f"\n✅ {self.speaker_label} transcription ended ({event.audio_duration_seconds}s)")
    
    def start(self):
        """Connect and start streaming"""
        if not self.client:
            return
        try:
            params = StreamingParameters(
                sample_rate=RATE,
                encoding=aai.AudioEncoding.pcm_s16le,
                format_turns=True  # Enable formatted final transcripts
            )
            self.client.connect(params)
            self.is_active = True
        except Exception as e:
            print(f"❌ Failed to start {self.speaker_label} transcription: {e}")
    
    def stream_audio(self, audio_data: bytes):
        """Send audio in background thread to avoid blocking audio pipeline"""
        if not self.is_active or not self.client:
            return
        
        # Submit to thread pool - returns immediately, doesn't block audio
        self.executor.submit(self._stream_audio_async, audio_data)
    
    def _stream_audio_async(self, audio_data: bytes):
        """Internal method that runs in background thread"""
        try:
            self.client.stream(audio_data)
        except Exception as e:
            error_str = str(e)
            if "Duration Violation" not in error_str and "Connection" not in error_str:
                print(f"\n❌ Error streaming {self.speaker_label} audio: {e}")
    
    def stop(self):
        """Disconnect transcription"""
        if self.is_active and self.client:
            try:
                self.client.disconnect(terminate=True)
                self.is_active = False
                self.executor.shutdown(wait=False)  # Don't wait for pending tasks
            except Exception as e:
                print(f"❌ Error stopping {self.speaker_label}: {e}")
    
    def save_transcript(self, filename):
        """Save transcript to file"""
        if self.full_transcript:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write('\n'.join(self.full_transcript))
            print(f"📝 {self.speaker_label} transcript saved: {filename}")

# Global transcribers
laptop_transcriber = None
phone_transcriber = None

# Audio streams
mic_stream = None
speaker_stream = None
stream_active = True

def laptop_audio_input_thread():
    """Capture audio from laptop microphone - PRIORITY: send to phone immediately"""
    global laptop_transcriber, mic_stream, stream_active
    
    try:
        # Open with minimal latency settings
        mic_stream = p.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=RATE,
            input=True,
            frames_per_buffer=CHUNK,
            stream_callback=None,  # Blocking mode for precise timing
            start=True
        )
        
        print("🎤 Laptop microphone active - speak to send audio to phone")
        print("   (20ms chunks, REAL-TIME mode)")
        
        while stream_active:
            try:
                data = mic_stream.read(CHUNK, exception_on_overflow=False)
                
                # PRIORITY 1: Send to phone IMMEDIATELY (no blocking)
                ulaw_data = audioop.lin2ulaw(data, 2)
                try:
                    audio_to_phone.put_nowait(base64.b64encode(ulaw_data).decode('utf-8'))
                except:
                    # Queue full - clear old data and add new (prioritize latest audio)
                    try:
                        audio_to_phone.get_nowait()  # Remove oldest
                        audio_to_phone.put_nowait(base64.b64encode(ulaw_data).decode('utf-8'))
                    except:
                        pass
                
                # PRIORITY 2: Store for recording (non-blocking)
                try:
                    with recording_lock:
                        laptop_audio_recording.append(data)
                except:
                    pass
                
                # PRIORITY 3: Transcription (non-blocking, in separate thread)
                try:
                    if laptop_transcriber and laptop_transcriber.is_active:
                        laptop_transcriber.stream_audio(data)
                except:
                    pass
                
                # PRIORITY 4: Broadcast to clients (non-blocking)
                try:
                    laptop_audio_broadcast.put_nowait(data)
                except:
                    pass  # Drop if queue full
                        
            except Exception as e:
                if stream_active:
                    print(f"\n❌ Microphone error: {e}")
                break
                
    except Exception as e:
        print(f"\n❌ Microphone setup error: {e}")
    finally:
        if mic_stream:
            try:
                mic_stream.stop_stream()
                mic_stream.close()
            except:
                pass

def laptop_audio_output_thread():
    """Play audio from phone to laptop speakers - PRIORITY: immediate playback"""
    global speaker_stream, stream_active
    
    try:
        # Open with minimal latency settings
        speaker_stream = p.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=RATE,
            output=True,
            frames_per_buffer=CHUNK,
            stream_callback=None,  # Blocking mode for precise timing
            start=True
        )
        
        print("🔊 Laptop speakers active - you'll hear phone audio here (REAL-TIME mode)")
        
        while stream_active:
            try:
                if not audio_from_phone.empty():
                    audio_data = audio_from_phone.get_nowait()
                    
                    # PRIORITY 1: Play immediately
                    speaker_stream.write(audio_data)
                    
                    # PRIORITY 2: Store for recording (non-blocking)
                    try:
                        with recording_lock:
                            phone_audio_recording.append(audio_data)
                    except:
                        pass
                    
                    # PRIORITY 3: Transcription (non-blocking)
                    try:
                        if phone_transcriber and phone_transcriber.is_active:
                            phone_transcriber.stream_audio(audio_data)
                    except:
                        pass
                    
                    # PRIORITY 4: Broadcast to clients (non-blocking)
                    try:
                        phone_audio_broadcast.put_nowait(audio_data)
                    except:
                        pass  # Drop if queue full
                else:
                    # Minimal sleep - check queue every 0.5ms for real-time response
                    time.sleep(0.0005)
            except Exception as e:
                if stream_active:
                    print(f"\n❌ Speaker error: {e}")
                break
                
    except Exception as e:
        print(f"\n❌ Speaker setup error: {e}")
    finally:
        if speaker_stream:
            try:
                speaker_stream.stop_stream()
                speaker_stream.close()
            except:
                pass

@app.post("/twiml")
async def twiml_endpoint():
    """TwiML endpoint for Twilio - Bidirectional audio streaming"""
    xml_response = f"""<?xml version="1.0" encoding="UTF-8"?>
    <Response>
    <Connect>
    <Stream url="{WS_URL}">
        <Parameter name="track" value="both_tracks" />
    </Stream>
    </Connect>
    </Response>"""
    
    return Response(content=xml_response, media_type="text/xml")

@app.websocket("/client")
async def client_websocket(websocket: WebSocket):
    """WebSocket endpoint for transcription clients"""
    await websocket.accept()
    transcription_clients.add(websocket)
    print(f"📱 Transcription client connected (total: {len(transcription_clients)})")
    print(f"   Waiting for call to start... (client will receive audio once call is active)")
    
    packet_count = {"laptop": 0, "phone": 0}
    
    async def broadcast_audio():
        """Broadcast audio from queues to this client"""
        try:
            while True:
                sent_any = False
                
                # Check laptop audio
                if not laptop_audio_broadcast.empty():
                    data = laptop_audio_broadcast.get_nowait()
                    message = json.dumps({
                        "event": "audio",
                        "track": "laptop",
                        "audio": base64.b64encode(data).decode('utf-8')
                    })
                    await websocket.send_text(message)
                    packet_count["laptop"] += 1
                    sent_any = True
                    
                    # Log first packet
                    if packet_count["laptop"] == 1:
                        print(f"   ✅ Started sending laptop audio to client")
                
                # Check phone audio
                if not phone_audio_broadcast.empty():
                    data = phone_audio_broadcast.get_nowait()
                    message = json.dumps({
                        "event": "audio",
                        "track": "phone",
                        "audio": base64.b64encode(data).decode('utf-8')
                    })
                    await websocket.send_text(message)
                    packet_count["phone"] += 1
                    sent_any = True
                    
                    # Log first packet
                    if packet_count["phone"] == 1:
                        print(f"   ✅ Started sending phone audio to client")
                
                # Minimal sleep for real-time processing
                await asyncio.sleep(0.0005)
        except Exception as e:
            print(f"   ⚠️  Client broadcast stopped: {e}")
    
    broadcast_task = asyncio.create_task(broadcast_audio())
    
    try:
        # Keep connection alive
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        broadcast_task.cancel()
        transcription_clients.discard(websocket)
        print(f"📱 Transcription client disconnected (remaining: {len(transcription_clients)})")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for bidirectional audio streaming with transcription"""
    global laptop_transcriber, phone_transcriber
    
    await websocket.accept()
    call_sid = None
    stream_sid = None
    
    # Task to send laptop audio to phone
    async def send_laptop_audio():
        packet_count = 0
        
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
                    # Send immediately without waiting
                    await websocket.send_text(json.dumps(message))
                    
                    packet_count += 1
                    if packet_count % 200 == 0:
                        print(f"📤 Sent {packet_count} packets to phone", end="\r")
                    
                    # No sleep - process next packet immediately
                else:
                    # Minimal sleep when queue is empty (0.5ms for real-time)
                    await asyncio.sleep(0.0005)
            except Exception as e:
                print(f"\n❌ Error sending audio: {e}")
                break
    
    send_task = None
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["event"] == "start":
                call_sid = message["start"]["callSid"]
                stream_sid = message["start"]["streamSid"]
                print(f"\n📞 Call connected! (ID: {call_sid})")
                print("=" * 70)
                
                sessions[call_sid] = {"active": True, "stream_sid": stream_sid}
                
                # Start transcription if API key available
                if ASSEMBLYAI_API_KEY:
                    laptop_transcriber = UniversalStreamingTranscriber("YOU")
                    phone_transcriber = UniversalStreamingTranscriber("CALLER")
                    
                    laptop_transcriber.start()
                    phone_transcriber.start()
                    print("✅ LIVE transcription active (immediate streaming)\n")
                else:
                    print("⚠️  Transcription disabled (no AssemblyAI API key)\n")
                
                send_task = asyncio.create_task(send_laptop_audio())
                
            elif message["event"] == "media":
                track = message["media"].get("track", "inbound")
                
                if track == "inbound":
                    # Phone audio (Twilio sends 20ms chunks)
                    payload = message["media"]["payload"]
                    ulaw_data = base64.b64decode(payload)
                    pcm_data = audioop.ulaw2lin(ulaw_data, 2)
                    
                    # PRIORITY: Send to speakers immediately (all other processing happens in output thread)
                    try:
                        audio_from_phone.put_nowait(pcm_data)
                    except:
                        # Queue full - clear old data and add new (prioritize latest audio)
                        try:
                            audio_from_phone.get_nowait()  # Remove oldest
                            audio_from_phone.put_nowait(pcm_data)
                        except:
                            pass
                
            elif message["event"] == "stop":
                print(f"\n{'=' * 70}")
                print(f"📴 Call ended")
                
                # Notify transcription clients
                if transcription_clients:
                    end_message = json.dumps({"event": "call_ended"})
                    for client in list(transcription_clients):
                        try:
                            await client.send_text(end_message)
                        except:
                            pass
                
                # Stop and save transcriptions
                if laptop_transcriber:
                    laptop_transcriber.stop()
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    laptop_transcriber.save_transcript(
                        f"transcript_you_{timestamp}.txt"
                    )
                
                if phone_transcriber:
                    phone_transcriber.stop()
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    phone_transcriber.save_transcript(
                        f"transcript_caller_{timestamp}.txt"
                    )
                
                if send_task:
                    send_task.cancel()
                break
                
    except WebSocketDisconnect:
        print(f"\n📴 Connection closed")
        
        if laptop_transcriber:
            laptop_transcriber.stop()
        if phone_transcriber:
            phone_transcriber.stop()
        
        if send_task:
            send_task.cancel()
        
        if call_sid and call_sid in sessions:
            sessions.pop(call_sid)

if __name__ == "__main__":
    print(f"\n🎙️  Two-Way Voice Phone System with Transcription")
    print(f"=" * 70)
    print(f"Server starting on port {PORT}")
    print(f"WebSocket URL: {WS_URL}")
    print(f"\n📞 Call your Twilio number: {os.getenv('TWILIO_PHONE_NUMBER')}")
    print(f"\n⚡ Features:")
    print(f"   - Ultra-low latency audio (20ms chunks)")
    if ASSEMBLYAI_API_KEY:
        print(f"   - AssemblyAI real-time transcription (immediate streaming)")
        print(f"   - No buffering - instant transcription")
    else:
        print(f"   - Transcription disabled (set ASSEMBLYAI_API_KEY in .env)")
    print(f"   - Audio recordings saved on exit")
    print(f"=" * 70)
    
    # Start audio threads
    mic_thread = threading.Thread(target=laptop_audio_input_thread, daemon=True)
    speaker_thread = threading.Thread(target=laptop_audio_output_thread, daemon=True)
    
    mic_thread.start()
    speaker_thread.start()
    
    try:
        # Run with optimized settings for real-time WebSocket performance
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=PORT,
            log_level="warning",  # Reduce logging overhead
            access_log=False,  # Disable access logs for performance
            ws_ping_interval=None,  # Disable ping for lower latency
            ws_ping_timeout=None
        )
    finally:
        print("\n" + "=" * 70)
        print("🛑 Stopping server...")
        
        # Stop audio streams gracefully
        stream_active = False
        time.sleep(0.1)
        
        if mic_stream:
            try:
                mic_stream.stop_stream()
                mic_stream.close()
            except:
                pass
        
        if speaker_stream:
            try:
                speaker_stream.stop_stream()
                speaker_stream.close()
            except:
                pass
        
        if ngrok_process:
            ngrok_process.terminate()
            ngrok_process.wait()
        
        if laptop_transcriber:
            laptop_transcriber.stop()
        if phone_transcriber:
            phone_transcriber.stop()
        
        # Save recordings
        print("\n💾 Saving recordings...")
        save_recordings()
        
        p.terminate()
        print("✅ All recordings saved. Goodbye!")
        print("=" * 70)
