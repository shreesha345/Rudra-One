import os
import json
import uvicorn
import requests
import time
import subprocess
import pyaudio
import base64
import audioop
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import asyncio
import threading
from queue import Queue

# Load environment variables
load_dotenv()

# Audio configuration - ULTRA LOW LATENCY
CHUNK = 40  # 5ms at 8kHz (ultra-low latency)
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 8000  # Twilio uses 8kHz μ-law

# Voice Activity Detection settings
SILENCE_THRESHOLD = 500  # Adjust this value (lower = more sensitive)
SPEECH_FRAMES_REQUIRED = 1  # Instant response - reduced from 3

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

# Audio queues for bidirectional streaming
audio_to_phone = Queue()  # Laptop mic → Phone
audio_from_phone = Queue()  # Phone → Laptop speakers

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

def laptop_audio_input_thread():
    """Capture audio from laptop microphone with Voice Activity Detection - ULTRA LOW LATENCY"""
    try:
        stream = p.open(format=FORMAT,
                       channels=CHANNELS,
                       rate=RATE,
                       input=True,
                       frames_per_buffer=CHUNK,
                       stream_callback=None)
        
        print("🎤 Laptop microphone active - speak to send audio to phone")
        print("   (Ultra-low latency mode: 5ms chunks)")
        
        packet_count = 0
        speech_frames = 0
        is_speaking = False
        
        while True:
            data = stream.read(CHUNK, exception_on_overflow=False)
            
            # Fast RMS calculation
            rms = audioop.rms(data, 2)
            
            # Instant Voice Activity Detection
            if rms > SILENCE_THRESHOLD:
                if not is_speaking:
                    is_speaking = True
                    print("\n🗣️  Speaking...")
                speech_frames = 5  # Keep sending for 5 frames after speech
            else:
                if speech_frames > 0:
                    speech_frames -= 1
                elif is_speaking:
                    is_speaking = False
                    print("\n🤫 Stopped")
            
            # Send audio when speaking
            if is_speaking or speech_frames > 0:
                ulaw_data = audioop.lin2ulaw(data, 2)
                audio_to_phone.put_nowait(base64.b64encode(ulaw_data).decode('utf-8'))
                
                packet_count += 1
                if packet_count % 200 == 0:
                    print(f"🎤 {packet_count} packets", end="\r")
            
    except Exception as e:
        print(f"\n❌ Microphone error: {e}")

def laptop_audio_output_thread():
    """Play audio from phone to laptop speakers - Low latency"""
    try:
        stream = p.open(format=FORMAT,
                       channels=CHANNELS,
                       rate=RATE,
                       output=True,
                       frames_per_buffer=CHUNK)
        
        print("🔊 Laptop speakers active - you'll hear phone audio here")
        
        while True:
            if not audio_from_phone.empty():
                audio_data = audio_from_phone.get()
                stream.write(audio_data)
            # No sleep - process immediately for lowest latency
                
    except Exception as e:
        print(f"❌ Speaker error: {e}")

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

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for bidirectional audio streaming"""
    await websocket.accept()
    call_sid = None
    stream_sid = None
    
    # Task to send laptop audio to phone - ULTRA LOW LATENCY
    async def send_laptop_audio():
        packet_count = 0
        batch_size = 5  # Send in small batches for efficiency
        
        while True:
            try:
                sent_in_batch = 0
                # Send multiple packets in one go
                while not audio_to_phone.empty() and sent_in_batch < batch_size:
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
                    sent_in_batch += 1
                    
                    if packet_count % 200 == 0:
                        print(f"📤 Sent {packet_count} packets to phone", end="\r")
                
                # Minimal sleep - only if no data
                if sent_in_batch == 0:
                    await asyncio.sleep(0.001)
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
                print(f"\n📞 Call connected!")
                print(f"   Call ID: {call_sid}")
                print(f"   Stream ID: {stream_sid}")
                print(f"\n🎙️  Speak into your laptop mic → Phone will hear you")
                print(f"🔊 Speak into phone → Laptop speakers will play it")
                print("=" * 60)
                
                sessions[call_sid] = {"active": True, "stream_sid": stream_sid}
                
                # Start sending laptop audio to phone
                send_task = asyncio.create_task(send_laptop_audio())
                print("✅ Bidirectional audio streaming started!")
                
            elif message["event"] == "media":
                # Audio from phone → Play on laptop speakers (immediate processing)
                track = message["media"].get("track", "inbound")
                
                if track == "inbound":
                    payload = message["media"]["payload"]
                    ulaw_data = base64.b64decode(payload)
                    # Convert μ-law to linear PCM
                    pcm_data = audioop.ulaw2lin(ulaw_data, 2)
                    audio_from_phone.put_nowait(pcm_data)
                
            elif message["event"] == "stop":
                print(f"\n📴 Call ended")
                if send_task:
                    send_task.cancel()
                break
                
    except WebSocketDisconnect:
        print(f"\n📴 Connection closed")
        if send_task:
            send_task.cancel()
        
        if call_sid and call_sid in sessions:
            sessions.pop(call_sid)

if __name__ == "__main__":
    print(f"\n🎙️  Two-Way Voice Phone System - ULTRA LOW LATENCY MODE")
    print(f"=" * 60)
    print(f"Server starting on port {PORT}")
    print(f"WebSocket URL: {WS_URL}")
    print(f"\n📞 Call your Twilio number: {os.getenv('TWILIO_PHONE_NUMBER')}")
    print(f"\n⚡ Latency: ~5ms chunks (ultra-fast)")
    print(f"⚙️  Voice Detection Threshold: {SILENCE_THRESHOLD}")
    print(f"=" * 60)
    
    # Start audio threads
    mic_thread = threading.Thread(target=laptop_audio_input_thread, daemon=True)
    speaker_thread = threading.Thread(target=laptop_audio_output_thread, daemon=True)
    
    mic_thread.start()
    speaker_thread.start()
    
    try:
        uvicorn.run(app, host="0.0.0.0", port=PORT)
    finally:
        if ngrok_process:
            print("\n🛑 Stopping ngrok...")
            ngrok_process.terminate()
            ngrok_process.wait()
        p.terminate()
