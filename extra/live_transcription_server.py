import asyncio
import websockets
import json
import base64
import audioop
import os
from datetime import datetime
from dotenv import load_dotenv
import threading
from queue import Queue
import numpy as np
from urllib.parse import urlparse

# Load environment variables
load_dotenv()

# Audio configuration
RATE = 8000  # Twilio sends 8kHz
WHISPER_RATE = 16000  # Whisper expects 16kHz for best accuracy
CHANNELS = 1

# Store active transcription sessions
active_sessions = {}


class TranscriptionSession:
    """Manages a single transcription session with WebSocket clients"""
    def __init__(self, caller_number, mode):
        self.caller_number = caller_number
        self.mode = mode  # "local" or "online"
        self.clients = set()  # WebSocket clients listening to this session
        self.laptop_transcriber = None
        self.phone_transcriber = None
        self.is_active = True
        
        # Initialize transcribers based on mode
        if mode == "local":
            self.laptop_transcriber = FastWhisperTranscriber(
                speaker_label="CR",
                display_name="Control Room",
                session=self
            )
            self.phone_transcriber = FastWhisperTranscriber(
                speaker_label="CALLER",
                display_name="Caller",
                session=self
            )
        else:  # online
            self.laptop_transcriber = DeepgramTranscriber(
                speaker_label="CR",
                display_name="Control Room",
                session=self
            )
            self.phone_transcriber = DeepgramTranscriber(
                speaker_label="CALLER",
                display_name="Caller",
                session=self
            )
    
    async def broadcast(self, message):
        """Broadcast message to all connected clients"""
        if self.clients:
            # Create a copy to avoid modification during iteration
            clients_copy = self.clients.copy()
            await asyncio.gather(
                *[client.send(json.dumps(message)) for client in clients_copy],
                return_exceptions=True
            )
    
    def add_client(self, websocket):
        """Add a client to this session"""
        self.clients.add(websocket)
        print(f"📱 Client connected to session {self.caller_number} ({len(self.clients)} total)")
    
    def remove_client(self, websocket):
        """Remove a client from this session"""
        self.clients.discard(websocket)
        print(f"📱 Client disconnected from session {self.caller_number} ({len(self.clients)} remaining)")
    
    def stop(self):
        """Stop the transcription session"""
        self.is_active = False
        if self.laptop_transcriber:
            self.laptop_transcriber.stop()
        if self.phone_transcriber:
            self.phone_transcriber.stop()


class FastWhisperTranscriber:
    """Local Whisper transcription with WebSocket broadcasting"""
    def __init__(self, speaker_label, display_name, session):
        self.speaker_label = speaker_label
        self.display_name = display_name
        self.session = session
        self.model = None
        self.audio_buffer = []
        self.buffer_lock = threading.Lock()
        self.is_active = True
        
        try:
            from faster_whisper import WhisperModel
            import torch
            
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            print(f"🔄 Loading Whisper model for {display_name}...")
            self.model = WhisperModel("large-v3", device=device, compute_type="float16" if device == "cuda" else "int8")
            print(f"✅ {display_name} ready (Whisper)")
            
            # Start transcription thread
            self.thread = threading.Thread(target=self._transcription_worker, daemon=True)
            self.thread.start()
            
        except ImportError:
            print(f"❌ faster-whisper not installed")
            self.is_active = False
        except Exception as e:
            print(f"❌ Failed to load Whisper: {e}")
            self.is_active = False
    
    def add_audio(self, audio_data: bytes):
        """Add audio chunk to buffer"""
        if not self.is_active:
            return
        
        try:
            # Resample to 16kHz
            resampled = audioop.ratecv(audio_data, 2, 1, RATE, WHISPER_RATE, None)[0]
            with self.buffer_lock:
                self.audio_buffer.append(resampled)
        except Exception:
            with self.buffer_lock:
                self.audio_buffer.append(audio_data)
    
    def _transcription_worker(self):
        """Background worker for transcription"""
        import time
        
        TRANSCRIBE_INTERVAL = 2.0
        samples_needed = int(WHISPER_RATE * TRANSCRIBE_INTERVAL)
        MIN_AUDIO_ENERGY = 200
        
        while self.is_active:
            try:
                time.sleep(0.15)
                
                with self.buffer_lock:
                    if len(self.audio_buffer) == 0:
                        continue
                    
                    combined_audio = b''.join(self.audio_buffer)
                    total_samples = len(combined_audio) // 2
                    
                    if total_samples < samples_needed:
                        continue
                    
                    audio_to_transcribe = combined_audio
                    self.audio_buffer.clear()
                
                # Convert to numpy
                audio_np = np.frombuffer(audio_to_transcribe, dtype=np.int16).astype(np.float32) / 32768.0
                
                # Check energy
                audio_energy = np.sqrt(np.mean(audio_np ** 2)) * 32768
                if audio_energy < MIN_AUDIO_ENERGY:
                    continue
                
                # Normalize
                audio_np = audio_np / (np.max(np.abs(audio_np)) + 1e-8)
                
                # Transcribe
                segments, info = self.model.transcribe(
                    audio_np,
                    language="en",
                    vad_filter=True,
                    vad_parameters=dict(
                        min_silence_duration_ms=300,
                        speech_pad_ms=300
                    ),
                    beam_size=5,
                    best_of=5,
                    temperature=0.0,
                    condition_on_previous_text=True,
                    initial_prompt="This is a phone conversation."
                )
                
                # Process segments
                for segment in segments:
                    text = segment.text.strip()
                    if text and len(text) > 2:
                        timestamp = datetime.now().isoformat()
                        
                        # Broadcast to WebSocket clients
                        message = {
                            "speaker": self.speaker_label,
                            "message": text,
                            "timestamp": timestamp,
                            "caller_number": self.session.caller_number,
                            "mode": self.session.mode,
                            "is_final": True,
                            "confidence": segment.avg_logprob
                        }
                        
                        # Send to all connected clients
                        asyncio.run(self.session.broadcast(message))
                
            except Exception as e:
                print(f"❌ Transcription error ({self.display_name}): {e}")
    
    def stop(self):
        """Stop transcription"""
        self.is_active = False
        if hasattr(self, 'thread'):
            self.thread.join(timeout=1)


class DeepgramTranscriber:
    """Deepgram transcription with WebSocket broadcasting"""
    def __init__(self, speaker_label, display_name, session):
        self.speaker_label = speaker_label
        self.display_name = display_name
        self.session = session
        self.is_active = False
        self.ws = None
        self.audio_queue = Queue()
        
        # Check API key
        self.api_key = os.getenv("DEEPGRAM_API_KEY")
        if not self.api_key:
            print(f"❌ DEEPGRAM_API_KEY not found for {display_name}")
            return
        
        try:
            import websockets
            self.websockets = websockets
            
            # Start connection in background thread
            self.thread = threading.Thread(target=self._start_connection, daemon=True)
            self.thread.start()
            
        except ImportError:
            print(f"❌ websockets not installed")
    
    def _start_connection(self):
        """Start Deepgram WebSocket connection"""
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._connect())
    
    async def _connect(self):
        """Connect to Deepgram streaming API"""
        try:
            url = (
                f"wss://api.deepgram.com/v1/listen?"
                f"model=nova-2"
                f"&encoding=linear16"
                f"&sample_rate={WHISPER_RATE}"
                f"&channels=1"
                f"&punctuate=true"
                f"&interim_results=true"
                f"&utterance_end_ms=1000"
                f"&vad_events=true"
                f"&endpointing=300"
                f"&smart_format=true"
                f"&numerals=true"
            )
            
            async with self.websockets.connect(
                url,
                additional_headers={
                    "Authorization": f"Token {self.api_key}",
                    "Content-Type": "audio/raw"
                }
            ) as ws:
                self.ws = ws
                self.is_active = True
                print(f"✅ {self.display_name} ready (Deepgram)")
                
                # Create tasks for sending and receiving
                send_task = asyncio.create_task(self._send_audio(ws))
                receive_task = asyncio.create_task(self._receive_transcripts(ws))
                
                await asyncio.gather(send_task, receive_task)
        
        except Exception as e:
            print(f"❌ Failed to connect {self.display_name}: {e}")
            self.is_active = False
    
    async def _send_audio(self, ws):
        """Send audio from queue to Deepgram"""
        import time
        last_audio_time = time.time()
        keepalive_interval = 5
        
        while self.is_active:
            try:
                if not self.audio_queue.empty():
                    audio_data = self.audio_queue.get_nowait()
                    await ws.send(audio_data)
                    last_audio_time = time.time()
                else:
                    if time.time() - last_audio_time > keepalive_interval:
                        await ws.send(json.dumps({"type": "KeepAlive"}))
                        last_audio_time = time.time()
                    await asyncio.sleep(0.01)
            except Exception as e:
                if self.is_active and "1011" not in str(e):
                    print(f"❌ Error sending audio {self.display_name}: {e}")
                break
    
    async def _receive_transcripts(self, ws):
        """Receive transcripts from Deepgram"""
        try:
            async for message in ws:
                try:
                    data = json.loads(message)
                    
                    if data.get('type') == 'Results':
                        channel_data = data.get('channel', {})
                        alternatives = channel_data.get('alternatives', [])
                        
                        if not alternatives or len(alternatives) == 0:
                            continue
                        
                        transcript = alternatives[0].get('transcript', '')
                        
                        if not transcript:
                            continue
                        
                        is_final = data.get('is_final', False)
                        confidence = alternatives[0].get('confidence', 0)
                        timestamp = datetime.now().isoformat()
                        
                        # Broadcast to WebSocket clients
                        message_data = {
                            "speaker": self.speaker_label,
                            "message": transcript,
                            "timestamp": timestamp,
                            "caller_number": self.session.caller_number,
                            "mode": self.session.mode,
                            "is_final": is_final,
                            "confidence": confidence
                        }
                        
                        # Send to all connected clients
                        await self.session.broadcast(message_data)
                
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(f"❌ Error processing {self.display_name}: {e}")
        except Exception as e:
            if self.is_active and "1011" not in str(e):
                print(f"❌ Error receiving {self.display_name}: {e}")
    
    def add_audio(self, audio_data: bytes):
        """Stream audio to Deepgram"""
        if self.is_active and self.ws:
            try:
                # Upsample to 16kHz
                try:
                    resampled = audioop.ratecv(audio_data, 2, 1, RATE, WHISPER_RATE, None)[0]
                    self.audio_queue.put(resampled)
                except Exception:
                    self.audio_queue.put(audio_data)
            except Exception as e:
                print(f"❌ Error queueing {self.display_name}: {e}")
    
    def stop(self):
        """Stop transcription"""
        self.is_active = False


async def handle_live_transcription_client(websocket, path):
    """Handle WebSocket client connections for live transcription"""
    try:
        # Parse path: /live_transcribe/<mode>/<caller_number>
        parts = path.strip('/').split('/')
        
        if len(parts) != 3 or parts[0] != 'live_transcribe':
            await websocket.send(json.dumps({
                "error": "Invalid path. Use: /live_transcribe/<local|online>/<caller_number>"
            }))
            return
        
        mode = parts[1].lower()
        caller_number = parts[2]
        
        if mode not in ['local', 'online']:
            await websocket.send(json.dumps({
                "error": "Mode must be 'local' or 'online'"
            }))
            return
        
        # Get or create session
        session_key = f"{mode}_{caller_number}"
        
        if session_key not in active_sessions:
            print(f"🎙️  Creating new transcription session: {session_key}")
            active_sessions[session_key] = TranscriptionSession(caller_number, mode)
        
        session = active_sessions[session_key]
        session.add_client(websocket)
        
        # Send welcome message
        await websocket.send(json.dumps({
            "event": "connected",
            "caller_number": caller_number,
            "mode": mode,
            "message": f"Connected to live transcription for {caller_number}"
        }))
        
        # Keep connection alive and wait for disconnect
        try:
            async for message in websocket:
                # Client can send commands if needed
                pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            session.remove_client(websocket)
            
            # Clean up session if no clients
            if len(session.clients) == 0:
                print(f"🛑 No clients remaining, stopping session: {session_key}")
                session.stop()
                del active_sessions[session_key]
    
    except Exception as e:
        print(f"❌ Error handling client: {e}")
        try:
            await websocket.send(json.dumps({"error": str(e)}))
        except:
            pass


async def handle_audio_source(websocket, path):
    """Handle audio source connection from voice server"""
    try:
        # Parse path to get session info
        # Expected: /audio_source/<mode>/<caller_number>
        parts = path.strip('/').split('/')
        
        if len(parts) != 3 or parts[0] != 'audio_source':
            await websocket.send(json.dumps({
                "error": "Invalid path. Use: /audio_source/<local|online>/<caller_number>"
            }))
            return
        
        mode = parts[1].lower()
        caller_number = parts[2]
        session_key = f"{mode}_{caller_number}"
        
        # Get or create session
        if session_key not in active_sessions:
            print(f"🎙️  Creating new transcription session: {session_key}")
            active_sessions[session_key] = TranscriptionSession(caller_number, mode)
        
        session = active_sessions[session_key]
        
        print(f"🎧 Audio source connected for session: {session_key}")
        
        # Receive audio data
        async for message in websocket:
            try:
                data = json.loads(message)
                
                if data.get("event") == "audio":
                    track = data.get("track")
                    audio_b64 = data.get("audio")
                    
                    if not audio_b64:
                        continue
                    
                    # Decode audio
                    audio_data = base64.b64decode(audio_b64)
                    
                    # Send to appropriate transcriber
                    if track == "laptop" and session.laptop_transcriber:
                        session.laptop_transcriber.add_audio(audio_data)
                    elif track == "phone" and session.phone_transcriber:
                        session.phone_transcriber.add_audio(audio_data)
                
                elif data.get("event") == "call_ended":
                    print(f"📴 Call ended for session: {session_key}")
                    break
            
            except json.JSONDecodeError:
                continue
            except Exception as e:
                print(f"❌ Error processing audio: {e}")
    
    except Exception as e:
        print(f"❌ Error handling audio source: {e}")


async def websocket_router(websocket, path):
    """Route WebSocket connections based on path"""
    if path.startswith('/live_transcribe/'):
        await handle_live_transcription_client(websocket, path)
    elif path.startswith('/audio_source/'):
        await handle_audio_source(websocket, path)
    else:
        await websocket.send(json.dumps({
            "error": "Unknown endpoint. Use /live_transcribe/<mode>/<caller> or /audio_source/<mode>/<caller>"
        }))


async def main():
    """Start the WebSocket server"""
    port = int(os.getenv("TRANSCRIPTION_WS_PORT", "8081"))
    
    print("\n" + "=" * 70)
    print("🎙️  LIVE TRANSCRIPTION WEBSOCKET SERVER")
    print("=" * 70)
    print(f"\nServer starting on port {port}...")
    print("\nEndpoints:")
    print("  📡 Live Transcription: ws://localhost:{port}/live_transcribe/<mode>/<caller_number>")
    print("  🎧 Audio Source:       ws://localhost:{port}/audio_source/<mode>/<caller_number>")
    print("\nModes: 'local' (Whisper) or 'online' (Deepgram)")
    print("=" * 70 + "\n")
    
    async with websockets.serve(websocket_router, "0.0.0.0", port):
        print(f"✅ Server running on ws://0.0.0.0:{port}")
        print("Press Ctrl+C to stop\n")
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
