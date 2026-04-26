import asyncio
import websockets
import json
import base64
import audioop
import wave
import os
from datetime import datetime
from dotenv import load_dotenv
import threading
from queue import Queue
import numpy as np

# Load environment variables
load_dotenv()

# Audio configuration
RATE = 8000  # Twilio sends 8kHz
WHISPER_RATE = 16000  # Whisper expects 16kHz for best accuracy
CHANNELS = 1

# Recording storage
recordings_dir = "client_recordings"
os.makedirs(recordings_dir, exist_ok=True)

# Audio buffers for both tracks
laptop_audio_buffer = []
phone_audio_buffer = []
recording_lock = threading.Lock()


class FastWhisperTranscriber:
    """Ultra-fast local transcription using faster-whisper with real-time streaming"""
    def __init__(self, speaker_label, display_name, color_code):
        self.speaker_label = speaker_label
        self.display_name = display_name
        self.color_code = color_code
        self.model = None
        self.audio_buffer = []
        self.buffer_lock = threading.Lock()
        self.is_active = True
        self.full_transcript = []
        self.current_partial = ""
        self.last_final_text = ""
        
        try:
            from faster_whisper import WhisperModel
            import torch
            
            # Detect device
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "int8" if device == "cuda" else "int8"
            
            # Use large-v3 model for best accuracy
            print(f"🔄 Loading Whisper large-v3 model for {display_name} ({device})...")
            self.model = WhisperModel("large-v3", device=device, compute_type="float16" if device == "cuda" else "int8")
            print(f"✅ {display_name} transcription ready (Whisper large-v3)")
            print(f"   Device: {device}, Sample rate: 16kHz (upsampled), Buffer: 2s")
            
            # Start transcription thread
            self.thread = threading.Thread(target=self._transcription_worker, daemon=True)
            self.thread.start()
            
        except ImportError:
            print(f"❌ faster-whisper not installed. Install: pip install faster-whisper")
            self.is_active = False
        except Exception as e:
            print(f"❌ Failed to load Whisper for {display_name}: {e}")
            self.is_active = False
    
    def add_audio(self, audio_data: bytes):
        """Add audio chunk to buffer with resampling to 16kHz"""
        if not self.is_active:
            return
        
        # Resample from 8kHz to 16kHz for better Whisper accuracy
        try:
            # Upsample 8kHz -> 16kHz (2x)
            resampled = audioop.ratecv(audio_data, 2, 1, RATE, WHISPER_RATE, None)[0]
            
            with self.buffer_lock:
                self.audio_buffer.append(resampled)
        except Exception as e:
            # If resampling fails, use original
            with self.buffer_lock:
                self.audio_buffer.append(audio_data)
    
    def _transcription_worker(self):
        """Background worker that transcribes accumulated audio in real-time"""
        import time
        
        # Accumulate 2 seconds of audio (balance between latency and accuracy)
        # At 16kHz, this is 32000 samples
        TRANSCRIBE_INTERVAL = 2.0
        samples_needed = int(WHISPER_RATE * TRANSCRIBE_INTERVAL)
        
        # Minimum audio energy threshold for speech detection (RMS)
        MIN_AUDIO_ENERGY = 200  # Adjusted for 16kHz
        
        while self.is_active:
            try:
                time.sleep(0.15)  # Check every 150ms
                
                # Check if we have enough audio
                with self.buffer_lock:
                    if len(self.audio_buffer) == 0:
                        continue
                    
                    # Combine all buffered audio
                    combined_audio = b''.join(self.audio_buffer)
                    total_samples = len(combined_audio) // 2
                    
                    # Need at least 2 seconds of audio at 16kHz
                    if total_samples < samples_needed:
                        continue
                    
                    # Take audio for transcription
                    audio_to_transcribe = combined_audio
                    self.audio_buffer.clear()
                
                # Convert to numpy array (16-bit PCM -> float32)
                audio_np = np.frombuffer(audio_to_transcribe, dtype=np.int16).astype(np.float32) / 32768.0
                
                # Check if audio has speech (energy-based VAD)
                audio_energy = np.sqrt(np.mean(audio_np ** 2)) * 32768  # RMS
                
                if audio_energy < MIN_AUDIO_ENERGY:
                    # Too quiet - likely silence, skip transcription
                    continue
                
                # Normalize audio for better recognition
                audio_np = audio_np / (np.max(np.abs(audio_np)) + 1e-8)
                
                # Show processing indicator
                self._show_partial("processing")
                
                # Transcribe with optimized settings for accuracy
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
                
                # Clear processing indicator
                print("\r" + " " * 120 + "\r", end="", flush=True)
                
                # Process segments
                has_speech = False
                for segment in segments:
                    text = segment.text.strip()
                    # Filter out very short or repetitive text
                    if text and len(text) > 2 and text != self.last_final_text:
                        has_speech = True
                        timestamp = datetime.now().strftime("%H:%M:%S")
                        self._show_final(text, timestamp)
                        self.last_final_text = text
                
                # If no speech detected, don't show anything
                if not has_speech:
                    continue
                
            except Exception as e:
                print(f"\n❌ Transcription error ({self.display_name}): {e}")
    
    def _show_partial(self, text):
        """Show partial transcription (processing indicator)"""
        if text == "processing":
            if self.speaker_label == "CALLER":
                display = f"\r{self.color_code}📞 [Transcribing...]{self._reset_color()}"
            else:
                display = f"\r{' ' * 40}{self.color_code}🎛️  [Transcribing...]{self._reset_color()}"
            
            # Only show if not already showing
            if self.current_partial != "processing":
                print(" " * 120, end="\r", flush=True)
                print(display, end="", flush=True)
                self.current_partial = "processing"
    
    def _show_final(self, sentence, timestamp):
        """Show final complete sentence"""
        # Clear the partial line
        print("\r" + " " * 120 + "\r", end="", flush=True)
        
        # Format based on speaker
        if self.speaker_label == "CALLER":
            # Caller on the left with blue color
            print(f"\n{self.color_code}📞 CALLER [{timestamp}]{self._reset_color()}")
            print(f"{self.color_code}   {sentence}{self._reset_color()}\n")
        else:
            # Control Room on the right with green color
            print(f"\n{' ' * 40}{self.color_code}🎛️  CONTROL ROOM [{timestamp}]{self._reset_color()}")
            print(f"{' ' * 40}{self.color_code}   {sentence}{self._reset_color()}\n")
        
        # Save to transcript
        line = f"[{timestamp}] [{self.display_name}]: {sentence}"
        self.full_transcript.append(line)
    
    def _reset_color(self):
        """Reset ANSI color"""
        return "\033[0m"
    
    def stop(self):
        """Stop transcription"""
        self.is_active = False
        if hasattr(self, 'thread'):
            self.thread.join(timeout=1)
    
    def save_transcript(self, filename):
        """Save transcript to file"""
        if self.full_transcript:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write('\n'.join(self.full_transcript))
            print(f"📝 {self.display_name} transcript saved: {filename}")


class DeepgramTranscriber:
    """Real-time transcription using Deepgram with multichannel support"""
    def __init__(self, speaker_label, display_name, color_code, channel):
        self.speaker_label = speaker_label
        self.display_name = display_name
        self.color_code = color_code
        self.channel = channel
        self.full_transcript = []
        self.is_active = False
        self.ws = None
        self.current_partial = ""
        self.last_final_text = ""
        self.audio_queue = Queue()
        
        # Check API key
        self.api_key = os.getenv("DEEPGRAM_API_KEY")
        if not self.api_key:
            print(f"❌ DEEPGRAM_API_KEY not found in .env for {display_name}")
            return
        
        try:
            import websockets
            self.websockets = websockets
            
            # Start connection in background thread
            self.thread = threading.Thread(target=self._start_connection, daemon=True)
            self.thread.start()
            
        except ImportError:
            print(f"❌ websockets not installed. Install: pip install websockets")
    
    def _start_connection(self):
        """Start Deepgram WebSocket connection"""
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._connect())
    
    async def _connect(self):
        """Connect to Deepgram streaming API"""
        try:
            # Deepgram streaming endpoint with enhanced accuracy settings
            url = (
                f"wss://api.deepgram.com/v1/listen?"
                f"model=nova-2"  # Latest, most accurate model
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
            
            # Create connection with authorization header
            async with self.websockets.connect(
                url,
                additional_headers={
                    "Authorization": f"Token {self.api_key}",
                    "Content-Type": "audio/raw"
                }
            ) as ws:
                self.ws = ws
                self.is_active = True
                self.audio_queue = Queue()
                print(f"✅ {self.display_name} transcription ready (Deepgram)")
                
                # Create tasks for sending and receiving
                send_task = asyncio.create_task(self._send_audio(ws))
                receive_task = asyncio.create_task(self._receive_transcripts(ws))
                
                # Wait for both tasks
                await asyncio.gather(send_task, receive_task)
        
        except Exception as e:
            print(f"\n❌ Failed to connect {self.display_name}: {e}")
            self.is_active = False
    
    async def _send_audio(self, ws):
        """Send audio from queue to Deepgram"""
        import time
        last_audio_time = time.time()
        keepalive_interval = 5  # Send keepalive every 5 seconds
        
        while self.is_active:
            try:
                if not self.audio_queue.empty():
                    audio_data = self.audio_queue.get_nowait()
                    await ws.send(audio_data)
                    last_audio_time = time.time()
                else:
                    # Send keepalive if no audio for a while
                    if time.time() - last_audio_time > keepalive_interval:
                        # Send empty JSON to keep connection alive
                        await ws.send(json.dumps({"type": "KeepAlive"}))
                        last_audio_time = time.time()
                    await asyncio.sleep(0.01)
            except Exception as e:
                if self.is_active and "1011" not in str(e):
                    print(f"\n❌ Error sending audio {self.display_name}: {e}")
                break
    
    async def _receive_transcripts(self, ws):
        """Receive transcripts from Deepgram"""
        try:
            async for message in ws:
                try:
                    data = json.loads(message)
                    
                    # Check for different response types
                    if data.get('type') == 'Results':
                        # Get the channel data
                        channel_data = data.get('channel', {})
                        alternatives = channel_data.get('alternatives', [])
                        
                        if not alternatives or len(alternatives) == 0:
                            continue
                        
                        transcript = alternatives[0].get('transcript', '')
                        
                        if not transcript:
                            continue
                        
                        is_final = data.get('is_final', False)
                        
                        if is_final:
                            # Final transcription
                            if transcript != self.last_final_text:
                                timestamp = datetime.now().strftime("%H:%M:%S")
                                self._show_final(transcript, timestamp)
                                self.last_final_text = transcript
                        else:
                            # Partial transcription
                            if transcript != self.current_partial:
                                self._show_partial(transcript)
                                self.current_partial = transcript
                    
                    elif data.get('type') == 'Metadata':
                        # Connection metadata, ignore
                        pass
                
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(f"\n❌ Error processing {self.display_name}: {e}")
        except Exception as e:
            if self.is_active:
                # Ignore timeout errors (normal when no audio)
                if "1011" not in str(e):
                    print(f"\n❌ Error receiving {self.display_name}: {e}")
    
    def add_audio(self, audio_data: bytes):
        """Stream audio to Deepgram with upsampling for better accuracy"""
        if self.is_active and self.ws:
            try:
                # Upsample from 8kHz to 16kHz for better accuracy
                try:
                    resampled = audioop.ratecv(audio_data, 2, 1, RATE, WHISPER_RATE, None)[0]
                    self.audio_queue.put(resampled)
                except Exception:
                    # If resampling fails, use original
                    self.audio_queue.put(audio_data)
            except Exception as e:
                print(f"\n❌ Error queueing {self.display_name}: {e}")
    
    def _show_partial(self, text):
        """Show partial transcription"""
        if self.speaker_label == "CALLER":
            display = f"\r{self.color_code}📞 {text}...{self._reset_color()}"
        else:
            display = f"\r{' ' * 40}{self.color_code}🎛️  {text}...{self._reset_color()}"
        
        print(" " * 120, end="\r", flush=True)
        print(display, end="", flush=True)
    
    def _show_final(self, sentence, timestamp):
        """Show final complete sentence"""
        # Clear the partial line
        print("\r" + " " * 120 + "\r", end="", flush=True)
        
        # Format based on speaker
        if self.speaker_label == "CALLER":
            print(f"\n{self.color_code}📞 CALLER [{timestamp}]{self._reset_color()}")
            print(f"{self.color_code}   {sentence}{self._reset_color()}\n")
        else:
            print(f"\n{' ' * 40}{self.color_code}🎛️  CONTROL ROOM [{timestamp}]{self._reset_color()}")
            print(f"{' ' * 40}{self.color_code}   {sentence}{self._reset_color()}\n")
        
        # Save to transcript
        line = f"[{timestamp}] [{self.display_name}]: {sentence}"
        self.full_transcript.append(line)
    
    def _reset_color(self):
        """Reset ANSI color"""
        return "\033[0m"
    
    def stop(self):
        """Stop transcription"""
        self.is_active = False
        # WebSocket will close automatically when tasks complete
    
    def save_transcript(self, filename):
        """Save transcript to file"""
        if self.full_transcript:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write('\n'.join(self.full_transcript))
            print(f"📝 {self.display_name} transcript saved: {filename}")


async def connect_to_server(transcription_mode):
    """Connect to the voice server WebSocket and receive audio"""
    
    # Get server URL
    server_url = os.getenv("SERVER_WS_URL", "ws://localhost:8080/client")
    
    mode_name = "Local Whisper" if transcription_mode == 1 else "Deepgram"
    print(f"\n🎙️  Transcription Client ({mode_name})")
    print(f"=" * 70)
    print(f"Connecting to: {server_url}")
    print(f"=" * 70)
    
    # Check if server is running
    print("⏳ Checking if server is running...")
    max_retries = 5
    for attempt in range(max_retries):
        try:
            import socket
            host = "localhost"
            port = 8080
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((host, port))
            sock.close()
            
            if result == 0:
                print("✅ Server is running!")
                break
            else:
                if attempt < max_retries - 1:
                    print(f"⏳ Server not ready, retrying... ({attempt + 1}/{max_retries})")
                    await asyncio.sleep(2)
                else:
                    print(f"\n❌ Server is not running on {host}:{port}")
                    print(f"   Please start the server first:")
                    print(f"   python voice_phone_call.py")
                    return
        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
            else:
                print(f"\n❌ Cannot connect to server: {e}")
                return
    
    # Initialize transcribers based on mode
    laptop_transcriber = None
    phone_transcriber = None
    
    if transcription_mode == 1:
        # Local Whisper mode
        print("\n" + "=" * 80)
        print("🎙️  REAL-TIME TRANSCRIPTION DISPLAY (Whisper)")
        print("=" * 80)
        print("📞 CALLER (Phone)          |          🎛️  CONTROL ROOM (Your Laptop)")
        print("-" * 80 + "\n")
        
        laptop_transcriber = FastWhisperTranscriber(
            speaker_label="YOU",
            display_name="Control Room",
            color_code="\033[92m"  # Green
        )
        phone_transcriber = FastWhisperTranscriber(
            speaker_label="CALLER",
            display_name="Caller",
            color_code="\033[94m"  # Blue
        )
    else:
        # Deepgram mode
        print("\n" + "=" * 80)
        print("🎙️  REAL-TIME TRANSCRIPTION DISPLAY (Deepgram)")
        print("=" * 80)
        print("📞 CALLER (Phone)          |          🎛️  CONTROL ROOM (Your Laptop)")
        print("-" * 80 + "\n")
        
        # Give Deepgram a moment to connect
        await asyncio.sleep(1)
        
        laptop_transcriber = DeepgramTranscriber(
            speaker_label="YOU",
            display_name="Control Room",
            color_code="\033[92m",  # Green
            channel=0
        )
        phone_transcriber = DeepgramTranscriber(
            speaker_label="CALLER",
            display_name="Caller",
            color_code="\033[94m",  # Blue
            channel=1
        )
        
        # Wait for connections to establish
        await asyncio.sleep(2)
    
    try:
        async with websockets.connect(server_url) as websocket:
            print("✅ Connected to server")
            print("🎧 Listening for audio...")
            print("\n⏳ Waiting for call to start...")
            print("   📞 Call your Twilio number: +12295856712")
            print("   Once the call starts, audio will be processed...\n")
            
            audio_received = False
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    
                    if data.get("event") == "audio":
                        track = data.get("track")
                        audio_b64 = data.get("audio")
                        
                        if not audio_b64:
                            continue
                        
                        # First audio packet - clear waiting message
                        if not audio_received:
                            audio_received = True
                            print("\r" + " " * 80 + "\r", end="", flush=True)
                            print("✅ Audio streaming started! Transcription will appear below:\n")
                        
                        # Decode audio
                        audio_data = base64.b64decode(audio_b64)
                        
                        # Store for recording
                        with recording_lock:
                            if track == "laptop":
                                laptop_audio_buffer.append(audio_data)
                            elif track == "phone":
                                phone_audio_buffer.append(audio_data)
                        
                        # Send to transcriber
                        if track == "laptop" and laptop_transcriber:
                            laptop_transcriber.add_audio(audio_data)
                        elif track == "phone" and phone_transcriber:
                            phone_transcriber.add_audio(audio_data)
                    
                    elif data.get("event") == "call_ended":
                        print("\n📴 Call ended")
                        break
                        
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    print(f"❌ Error processing message: {e}")
    
    except websockets.exceptions.WebSocketException as e:
        print(f"\n❌ WebSocket error: {e}")
        print(f"\n💡 Troubleshooting:")
        print(f"   1. Make sure the server is running: python voice_phone_call.py")
        print(f"   2. Check if port 8080 is available")
        print(f"   3. Verify SERVER_WS_URL in .env (current: {server_url})")
    except KeyboardInterrupt:
        print("\n🛑 Stopping...")
    finally:
        # Stop transcribers
        print("\n🛑 Processing final transcription...")
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Stop and save transcripts
        if laptop_transcriber:
            laptop_transcriber.stop()
            laptop_transcriber.save_transcript(
                os.path.join(recordings_dir, f"transcript_you_{timestamp}.txt")
            )
        if phone_transcriber:
            phone_transcriber.stop()
            phone_transcriber.save_transcript(
                os.path.join(recordings_dir, f"transcript_caller_{timestamp}.txt")
            )
        
        # Save audio recordings
        save_recordings(timestamp)
        
        print("✅ Done!")


def save_recordings(timestamp):
    """Save audio recordings to WAV files"""
    with recording_lock:
        if laptop_audio_buffer:
            filename = os.path.join(recordings_dir, f"laptop_{timestamp}.wav")
            wf = wave.open(filename, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)
            wf.setframerate(RATE)
            wf.writeframes(b''.join(laptop_audio_buffer))
            wf.close()
            print(f"💾 Laptop audio saved: {filename}")
        
        if phone_audio_buffer:
            filename = os.path.join(recordings_dir, f"phone_{timestamp}.wav")
            wf = wave.open(filename, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)
            wf.setframerate(RATE)
            wf.writeframes(b''.join(phone_audio_buffer))
            wf.close()
            print(f"💾 Phone audio saved: {filename}")


def main():
    """Main entry point with transcription mode selection"""
    print("\n" + "=" * 70)
    print("🎙️  TRANSCRIPTION CLIENT - SELECT MODE")
    print("=" * 70)
    print("\n1. Local Whisper (Real-time, free, runs on your machine)")
    print("   - Transcribes as you speak")
    print("   - Requires: pip install faster-whisper")
    print("   - Best for: Quick testing, offline use")
    print("\n2. Deepgram Nova-2 (Real-time, paid API, cloud-based)")
    print("   - Transcribes as you speak with low latency")
    print("   - Uses Nova-2 model (highest accuracy)")
    print("   - Audio upsampled to 16kHz for better quality")
    print("   - Requires: DEEPGRAM_API_KEY in .env")
    print("   - Best for: Production, accurate real-time transcription")
    print("\n" + "=" * 70)
    
    while True:
        try:
            choice = input("\nEnter your choice (1 or 2): ").strip()
            if choice in ['1', '2']:
                mode = int(choice)
                break
            else:
                print("❌ Invalid choice. Please enter 1 or 2.")
        except KeyboardInterrupt:
            print("\n\n🛑 Cancelled")
            return
    
    # Run the client with selected mode
    asyncio.run(connect_to_server(mode))


if __name__ == "__main__":
    main()
