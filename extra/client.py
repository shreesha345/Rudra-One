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

# Use faster-whisper for local real-time transcription
TRANSCRIPTION_METHOD = "whisper"

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

# Transcription queues
laptop_transcription_queue = Queue()
phone_transcription_queue = Queue()

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
                        min_silence_duration_ms=300,  # Detect sentence boundaries
                        speech_pad_ms=300             # Padding around speech
                    ),
                    beam_size=5,      # Better accuracy (was 1)
                    best_of=5,        # Better accuracy (was 1)
                    temperature=0.0,  # Deterministic output
                    condition_on_previous_text=True,  # Use context for better accuracy
                    initial_prompt="This is a phone conversation."  # Context hint
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
                import traceback
                traceback.print_exc()
    
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





async def connect_to_server():
    """Connect to the voice server WebSocket and receive audio"""
    
    # Get server URL
    server_url = os.getenv("SERVER_WS_URL", "ws://localhost:8080/client")
    
    print(f"\n🎙️  Transcription Client (Whisper)")
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
                    print(f"   python voice_phone_call_groq.py")
                    return
        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
            else:
                print(f"\n❌ Cannot connect to server: {e}")
                return
    
    # Initialize Whisper transcribers with visual styling
    # ANSI color codes: Blue for Caller, Green for Control Room
    print("\n" + "=" * 80)
    print("🎙️  REAL-TIME TRANSCRIPTION DISPLAY (Whisper)")
    print("=" * 80)
    print("📞 CALLER (Phone)          |          🎛️  CONTROL ROOM (Your Laptop)")
    print("-" * 80 + "\n")
    
    # Use faster-whisper for local transcription
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
    
    try:
        async with websockets.connect(server_url) as websocket:
            print("✅ Connected to server")
            print("🎧 Listening for audio...")
            print("\n⏳ Waiting for call to start...")
            print("   📞 Call your Twilio number: +12295856712")
            print("   Once the call starts, transcription will appear below:\n")
            
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
                        if track == "laptop":
                            laptop_transcriber.add_audio(audio_data)
                        elif track == "phone":
                            phone_transcriber.add_audio(audio_data)
                        
                        # Debug: Show audio reception (every 100 packets = 2 seconds)
                        if not hasattr(connect_to_server, 'packet_count'):
                            connect_to_server.packet_count = 0
                        connect_to_server.packet_count += 1
                        if connect_to_server.packet_count % 100 == 0:
                            print(f"\r📊 Received {connect_to_server.packet_count} audio packets ({connect_to_server.packet_count * 0.02:.1f}s)", end="", flush=True)
                    
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
        print(f"   1. Make sure the server is running: python voice_phone_call_groq.py")
        print(f"   2. Check if port 8080 is available")
        print(f"   3. Verify SERVER_WS_URL in .env (current: {server_url})")
    except KeyboardInterrupt:
        print("\n🛑 Stopping...")
    finally:
        # Stop transcribers
        print("\n🛑 Stopping transcription...")
        laptop_transcriber.stop()
        phone_transcriber.stop()
        
        # Save transcripts
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        laptop_transcriber.save_transcript(
            os.path.join(recordings_dir, f"transcript_you_{timestamp}.txt")
        )
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


if __name__ == "__main__":
    asyncio.run(connect_to_server())
