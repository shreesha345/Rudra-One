import pyaudio
import wave
import threading
import time
from groq import Groq
import os
import tempfile
from queue import Queue
from dotenv import load_dotenv
import numpy as np


load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
class RealtimeTranscription:
    def __init__(self, api_key, chunk_duration=3):
        """
        Initialize real-time transcription with Groq Whisper API
        
        Args:
            api_key: Groq API key
            chunk_duration: Duration of audio chunks in seconds (default: 3)
        """
        self.client = Groq(api_key=api_key)
        self.chunk_duration = chunk_duration
        
        # Audio settings
        self.CHUNK = 1024
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        self.RATE = 16000
        
        self.is_recording = False
        self.audio_queue = Queue()
        self.transcription_text = ""
        
    def is_silence(self, audio_data, threshold=100):
        """Check if audio chunk is silence"""
        import numpy as np
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        energy = np.abs(audio_array).mean()
        is_silent = energy < threshold
        if not is_silent:
            print(f"🎙️  Speech detected (energy: {energy:.0f})")
        return is_silent
    
    def record_audio_chunk(self):
        """Record audio in chunks and add to queue"""
        p = pyaudio.PyAudio()
        
        stream = p.open(
            format=self.FORMAT,
            channels=self.CHANNELS,
            rate=self.RATE,
            input=True,
            frames_per_buffer=self.CHUNK
        )
        
        print("🎤 Recording started...")
        
        while self.is_recording:
            frames = []
            chunk_start = time.time()
            
            # Record for chunk_duration seconds
            while time.time() - chunk_start < self.chunk_duration and self.is_recording:
                data = stream.read(self.CHUNK, exception_on_overflow=False)
                frames.append(data)
            
            if frames:
                # Check if chunk contains actual speech (not silence)
                audio_data = b''.join(frames)
                
                if not self.is_silence(audio_data):
                    # Save chunk to temporary file
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                    wf = wave.open(temp_file.name, 'wb')
                    wf.setnchannels(self.CHANNELS)
                    wf.setsampwidth(p.get_sample_size(self.FORMAT))
                    wf.setframerate(self.RATE)
                    wf.writeframes(audio_data)
                    wf.close()
                    
                    # Add to queue for transcription
                    self.audio_queue.put(temp_file.name)
                else:
                    print("🔇 Silence detected, skipping...")
        
        stream.stop_stream()
        stream.close()
        p.terminate()
        print("🛑 Recording stopped")
    
    def transcribe_worker(self):
        """Worker thread to transcribe audio chunks from queue"""
        while self.is_recording or not self.audio_queue.empty():
            if not self.audio_queue.empty():
                audio_file = self.audio_queue.get()
                
                try:
                    print("📝 Transcribing chunk...")
                    
                    # Open and transcribe audio file
                    with open(audio_file, 'rb') as file:
                        file_content = file.read()
                    
                    transcription = self.client.audio.transcriptions.create(
                        file=(os.path.basename(audio_file), file_content),
                        model="whisper-large-v3",
                        response_format="json",
                        temperature=0.0
                    )
                    
                    # Append transcription (filter out common hallucinations)
                    text = transcription.text.strip()
                    # Skip common Whisper hallucinations
                    skip_phrases = ["thank you", "thanks for watching", "bye", "you", ".", ""]
                    if text and text.lower() not in skip_phrases and len(text) > 3:
                        self.transcription_text += text + " "
                        print(f"✅ {text}", end=" ", flush=True)
                    
                except Exception as e:
                    print(f"❌ Error transcribing: {e}")
                
                finally:
                    # Clean up temporary file with retry
                    try:
                        time.sleep(0.1)  # Small delay to ensure file is released
                        if os.path.exists(audio_file):
                            os.unlink(audio_file)
                    except PermissionError:
                        # If still locked, try again after a longer delay
                        time.sleep(0.5)
                        try:
                            if os.path.exists(audio_file):
                                os.unlink(audio_file)
                        except:
                            pass  # Give up if still can't delete
            
            time.sleep(0.1)
    
    def start_recording(self):
        """Start real-time recording and transcription"""
        if self.is_recording:
            print("Already recording!")
            return
        
        self.is_recording = True
        self.transcription_text = ""
        
        # Start recording thread
        self.record_thread = threading.Thread(target=self.record_audio_chunk)
        self.record_thread.start()
        
        # Start transcription worker thread
        self.transcribe_thread = threading.Thread(target=self.transcribe_worker)
        self.transcribe_thread.start()
    
    def stop_recording(self):
        """Stop recording and wait for transcription to complete"""
        if not self.is_recording:
            print("Not recording!")
            return
        
        self.is_recording = False
        
        # Wait for threads to complete
        self.record_thread.join()
        self.transcribe_thread.join()
        
        print("\n" + "="*50)
        print("FINAL TRANSCRIPTION:")
        print("="*50)
        print(self.transcription_text)
        print("="*50)
        
        return self.transcription_text
    
    def get_current_transcription(self):
        """Get current transcription text"""
        return self.transcription_text


def main():
    """Example usage"""
    # Set your Groq API key
    API_KEY = os.getenv('GROQ_API_KEY')
    
    if not API_KEY:
        print("⚠️  Please set GROQ_API_KEY environment variable")
        print("Example: export GROQ_API_KEY='your-api-key-here'")
        return
    
    # Initialize transcription with 3-second chunks
    transcriber = RealtimeTranscription(api_key=API_KEY, chunk_duration=3)
    
    print("="*50)
    print("Groq Whisper Real-Time Transcription")
    print("="*50)
    print("\nPress Enter to start recording...")
    input()
    
    # Start recording
    transcriber.start_recording()
    
    print("\n💬 Speak now! Press Ctrl+C to stop recording...")
    
    try:
        # Keep running until Ctrl+C
        while transcriber.is_recording:
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n\n🛑 Stopping...")
    
    # Stop recording and get final transcription
    final_text = transcriber.stop_recording()


if __name__ == "__main__":
    main()