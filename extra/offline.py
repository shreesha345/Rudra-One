"""
Real-time microphone transcription with faster-whisper
Simple, standalone implementation - no server required
"""
import pyaudio
import numpy as np
from faster_whisper import WhisperModel
import threading
import queue
import time

# Configuration
RATE = 16000
CHUNK = 1024
CHANNELS = 1
RECORD_SECONDS = 2  # Process audio every 2 seconds

# Initialize Whisper model
print("Loading Whisper model...")
try:
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
except:
    device = "cpu"
    compute_type = "int8"

model = WhisperModel("large-v3", device=device, compute_type=compute_type)
print(f"Model loaded on {device} with {compute_type} precision")
if device == "cuda":
    print(f"GPU: {torch.cuda.get_device_name(0)}")

# Audio queue
audio_queue = queue.Queue()

def audio_callback(in_data, frame_count, time_info, status):
    """Callback for PyAudio stream"""
    audio_queue.put(in_data)
    return (in_data, pyaudio.paContinue)

def transcribe_worker():
    """Worker thread that processes audio chunks"""
    buffer = []
    frames_needed = int(RATE * RECORD_SECONDS / CHUNK)
    previous_text = ""
    
    print("🎤 Listening... (speak into your microphone)")
    print("Press Ctrl+C to stop\n")
    
    while True:
        try:
            # Get audio data
            data = audio_queue.get(timeout=1.0)
            buffer.append(data)
            
            # Process when we have enough audio
            if len(buffer) >= frames_needed:
                # Convert to numpy array
                audio_data = b''.join(buffer)
                audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
                
                # Check if there's actual audio (not silence)
                if np.abs(audio_np).mean() > 0.001:
                    # Transcribe with auto language detection
                    segments, info = model.transcribe(
                        audio_np,
                        language=None,  # Auto-detect language
                        beam_size=5,
                        vad_filter=False,
                        condition_on_previous_text=True
                    )
                    
                    # Collect all text from segments
                    current_text = " ".join([seg.text.strip() for seg in segments if seg.text.strip()])
                    
                    # Only print new text (avoid repetition)
                    if current_text and current_text != previous_text:
                        # Show detected language
                        detected_lang = info.language if hasattr(info, 'language') else "unknown"
                        print(f"[{detected_lang}] {current_text}", flush=True)
                        previous_text = current_text
                
                # Clear buffer completely for next chunk
                buffer = []
                
        except queue.Empty:
            continue
        except Exception as e:
            print(f"\nError: {e}")

# Start audio stream
p = pyaudio.PyAudio()
stream = p.open(
    format=pyaudio.paInt16,
    channels=CHANNELS,
    rate=RATE,
    input=True,
    frames_per_buffer=CHUNK,
    stream_callback=audio_callback
)

# Start transcription thread
transcribe_thread = threading.Thread(target=transcribe_worker, daemon=True)
transcribe_thread.start()

# Start stream
stream.start_stream()

try:
    while stream.is_active():
        time.sleep(0.1)
except KeyboardInterrupt:
    print("\n✅ Stopping...")

# Cleanup
stream.stop_stream()
stream.close()
p.terminate()
print("Done!")
