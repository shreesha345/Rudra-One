import os
import json
import uvicorn
import requests
import time
import subprocess
from google import genai
from google.genai import types
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from prompts import EMERGENCY_SERVICES_GREETING,EMERGENCY_SERVICES_SYSTEM_PROMPT
from typing import List
import asyncio
# Load environment variables from .env file
load_dotenv()

def start_ngrok(port):
    """Start ngrok tunnel for the specified port"""
    try:
        print(f"🚀 Starting ngrok tunnel on port {port}...")
        # Start ngrok in the background
        process = subprocess.Popen(
            ["ngrok", "http", str(port)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        # Give ngrok time to start
        time.sleep(3)
        return process
    except FileNotFoundError:
        raise ValueError(
            "ngrok not found. Please install ngrok:\n"
            "Download from: https://ngrok.com/download"
        )

def get_ngrok_url(max_retries=5):
    """Automatically fetch the active ngrok tunnel URL"""
    for attempt in range(max_retries):
        try:
            response = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=5)
            tunnels = response.json()["tunnels"]
            
            # Find the HTTPS tunnel
            for tunnel in tunnels:
                if tunnel["proto"] == "https":
                    public_url = tunnel["public_url"]
                    # Remove https:// prefix
                    domain = public_url.replace("https://", "")
                    print(f"✅ Auto-detected ngrok URL: {domain}")
                    return domain
            
            if attempt < max_retries - 1:
                print(f"⏳ Waiting for ngrok tunnel... (attempt {attempt + 1}/{max_retries})")
                time.sleep(2)
        except requests.exceptions.RequestException:
            if attempt < max_retries - 1:
                print(f"⏳ Waiting for ngrok to start... (attempt {attempt + 1}/{max_retries})")
                time.sleep(2)
    
    raise ValueError("Could not get ngrok URL after multiple attempts")

def update_twilio_webhook(domain):
    """Automatically update Twilio webhook with the new ngrok URL"""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    phone_number = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not all([account_sid, auth_token, phone_number]):
        print("ℹ️  Twilio credentials not set - skipping webhook auto-update")
        print("   Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env to enable")
        return False
    
    try:
        from twilio.rest import Client
        
        client = Client(account_sid, auth_token)
        webhook_url = f"https://{domain}/twiml"
        
        # Get the phone number SID
        incoming_phone_numbers = client.incoming_phone_numbers.list(phone_number=phone_number)
        
        if not incoming_phone_numbers:
            print(f"⚠️  Phone number {phone_number} not found in Twilio account")
            return False
        
        phone_sid = incoming_phone_numbers[0].sid
        
        # Update the webhook
        client.incoming_phone_numbers(phone_sid).update(
            voice_url=webhook_url,
            voice_method='POST'
        )
        
        print(f"✅ Twilio webhook updated: {webhook_url}")
        return True
        
    except ImportError:
        print("⚠️  twilio package not installed. Install with: pip install twilio")
        return False
    except Exception as e:
        print(f"⚠️  Failed to update Twilio webhook: {e}")
        return False

# --- Configuration ---
PORT = int(os.getenv("PORT", "8080"))

# Try to get NGROK_URL from environment, otherwise auto-start and detect
DOMAIN = os.getenv("NGROK_URL")
ngrok_process = None

if not DOMAIN:
    print("⚙️  NGROK_URL not set in .env, starting ngrok automatically...")
    ngrok_process = start_ngrok(PORT)
    DOMAIN = get_ngrok_url()
else:
    print(f"✅ Using NGROK_URL from .env: {DOMAIN}")

WS_URL = f"wss://{DOMAIN}/ws"

# Auto-update Twilio webhook if credentials are provided
update_twilio_webhook(DOMAIN)

# ElevenLabs Voice Configuration
# Popular natural-sounding voices:
# - "pNInz6obpgDQGcFmaJgB" (Adam - Deep male voice)
# - "21m00Tcm4TlvDq8ikWAM" (Rachel - Calm female voice)
# - "EXAVITQu4vr4xnSDxMaL" (Bella - Soft female voice)
# - "ErXwobaYiN019PkySvjV" (Antoni - Well-rounded male voice)
# - "MF3mGyEYCl7XYWbV9V6O" (Elli - Emotional female voice)
# - "TxGEqnHWrfWFTfGW9XjX" (Josh - Young male voice)
ELEVENLABS_VOICE = os.getenv("ELEVENLABS_VOICE", "uYXf8XasLslADfZ2MB4u")  # Default: Rachel

# Updated greeting to reflect the new model - Multilingual
WELCOME_GREETING = EMERGENCY_SERVICES_GREETING

# System prompt for Gemini - Now multilingual
SYSTEM_PROMPT = EMERGENCY_SERVICES_SYSTEM_PROMPT

# --- Gemini API Initialization ---
# Get your Google API key from https://aistudio.google.com/app/apikey
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY environment variable not set.")

# Initialize the client with API key
client = genai.Client(api_key=GOOGLE_API_KEY)

# Model configuration
MODEL_ID = 'gemini-2.5-flash'

# Store active chat sessions
# We will now store Gemini's chat session objects
sessions = {}

# Store call metadata for each session
call_metadata = {}

# Store connected monitoring WebSocket clients
monitoring_clients: List[WebSocket] = []

# Create FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    # Close the Gemini client properly
    if hasattr(client, 'aio') and hasattr(client.aio, '_client_session'):
        await client.aio._client_session.close()

async def broadcast_call_data(call_sid: str, data: dict):
    """Broadcast call data to all connected monitoring clients"""
    disconnected = []
    for client in monitoring_clients:
        try:
            await client.send_json(data)
        except:
            disconnected.append(client)
    
    # Remove disconnected clients
    for client in disconnected:
        monitoring_clients.remove(client)

async def gemini_response(chat_history, user_prompt):
    """Get a response from the Gemini API."""
    try:
        print(f"[DEBUG] Adding user message to history")
        # Add user message to history
        chat_history.append(types.Content(
            role='user',
            parts=[types.Part(text=user_prompt)]
        ))
        
        print(f"[DEBUG] Calling Gemini API with model: {MODEL_ID}")
        # Generate response with system instruction and chat history
        response = await client.aio.models.generate_content(
            model=MODEL_ID,
            contents=chat_history,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.7
            )
        )
        
        print(f"[DEBUG] Received response from Gemini")
        # Add assistant response to history
        chat_history.append(types.Content(
            role='model',
            parts=[types.Part(text=response.text)]
        ))
        
        return response.text
    except Exception as e:
        print(f"[ERROR] Gemini API error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

# Using ElevenLabs for natural-sounding TTS
# The voice can be customized via ELEVENLABS_VOICE environment variable
@app.post("/twiml")
async def twiml_endpoint():
    """Enhanced TwiML endpoint with multilingual support"""
    xml_response = f"""<?xml version="1.0" encoding="UTF-8"?>
    <Response>
    <Connect>
    <ConversationRelay 
        url="{WS_URL}" 
        welcomeGreeting="{WELCOME_GREETING}" 
        ttsProvider="ElevenLabs" 
        voice="{ELEVENLABS_VOICE}"
        transcriptionProvider="Deepgram"
        speechModel="nova-3-general"
        language="multi">
        <Language code="multi" 
                  ttsProvider="ElevenLabs" 
                  transcriptionProvider="Deepgram" 
                  speechModel="nova-3-general" />
    </ConversationRelay>
    </Connect>
    </Response>"""
    
    return Response(content=xml_response, media_type="text/xml")


@app.websocket("/monitor")
async def monitor_endpoint(websocket: WebSocket):
    """WebSocket endpoint for monitoring calls in real-time"""
    await websocket.accept()
    monitoring_clients.append(websocket)
    print(f"📊 Monitoring client connected. Total clients: {len(monitoring_clients)}")
    
    try:
        # Keep connection alive and listen for any client messages
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        monitoring_clients.remove(websocket)
        print(f"📊 Monitoring client disconnected. Total clients: {len(monitoring_clients)}")

    
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication"""
    await websocket.accept()
    call_sid = None
    
    try:
        while True:
            data = await websocket.receive_text()
            print(f"[DEBUG] Received message: {data}")
            message = json.loads(data)
            
            if message["type"] == "setup":
                call_sid = message["callSid"]
                caller_number = message.get("from", "Unknown")
                print(f"Setup for call: {call_sid} from {caller_number}")
                
                # Initialize chat history for this call
                sessions[call_sid] = []
                
                # Initialize call metadata
                call_metadata[call_sid] = {
                    "caller_number": caller_number,
                    "caller_id": call_sid,
                    "AI_model": MODEL_ID,
                    "start_time": time.time(),
                    "conversation": []
                }
                
                # Broadcast call setup
                await broadcast_call_data(call_sid, {
                    "event": "call_started",
                    "caller_number": caller_number,
                    "caller_id": call_sid,
                    "AI_model": MODEL_ID,
                    "timestamp": time.time()
                })
                
            elif message["type"] == "prompt":
                if not call_sid or call_sid not in sessions:
                    print(f"Error: Received prompt for unknown call_sid {call_sid}")
                    continue

                user_prompt = message["voicePrompt"]
                print(f"Processing prompt: {user_prompt}")
                
                try:
                    chat_history = sessions[call_sid]
                    response_text = await gemini_response(chat_history, user_prompt)
                    
                    # Store conversation in metadata
                    if call_sid in call_metadata:
                        call_metadata[call_sid]["conversation"].append({
                            "message_human": user_prompt,
                            "message_AI": response_text,
                            "timestamp": time.time()
                        })
                    
                    # Broadcast conversation update
                    await broadcast_call_data(call_sid, {
                        "event": "conversation",
                        "caller_number": call_metadata[call_sid]["caller_number"],
                        "caller_id": call_sid,
                        "AI_model": MODEL_ID,
                        "message_human": user_prompt,
                        "message_AI": response_text,
                        "timestamp": time.time(),
                        "conversation_history": call_metadata[call_sid]["conversation"]
                    })
                    
                    # Send the complete response back to Twilio.
                    # Twilio's ConversationRelay will handle the text-to-speech conversion.
                    await websocket.send_text(
                        json.dumps({
                            "type": "text",
                            "token": response_text,
                            "last": True  # Indicate this is the full and final message
                        })
                    )
                    print(f"Sent response: {response_text}")
                    
                except Exception as e:
                    print(f"[ERROR] Error processing prompt: {type(e).__name__}: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    error_message = "I'm sorry, I encountered an error processing your request. Please try again."
                    try:
                        await websocket.send_text(
                            json.dumps({
                                "type": "text",
                                "token": error_message,
                                "last": True
                            })
                        )
                        print(f"Sent error message: {error_message}")
                    except Exception as send_error:
                        print(f"[ERROR] Failed to send error message: {send_error}")
                
            elif message["type"] == "interrupt":
                print(f"Handling interruption for call {call_sid}.")
                
            else:
                print(f"Unknown message type received: {message['type']}")
                
    except WebSocketDisconnect:
        print(f"WebSocket connection closed for call {call_sid}")
        
        # Broadcast call ended
        if call_sid and call_sid in call_metadata:
            await broadcast_call_data(call_sid, {
                "event": "call_ended",
                "caller_number": call_metadata[call_sid]["caller_number"],
                "caller_id": call_sid,
                "AI_model": MODEL_ID,
                "duration": time.time() - call_metadata[call_sid]["start_time"],
                "total_messages": len(call_metadata[call_sid]["conversation"]),
                "timestamp": time.time()
            })
        
        if call_sid in sessions:
            sessions.pop(call_sid)
            print(f"Cleared session for call {call_sid}")
        
        if call_sid in call_metadata:
            call_metadata.pop(call_sid)
            print(f"Cleared metadata for call {call_sid}")

if __name__ == "__main__":
    print(f"Starting server on port {PORT}")
    print(f"WebSocket URL for Twilio: {WS_URL}")
    
    try:
        uvicorn.run(app, host="0.0.0.0", port=PORT)
    finally:
        # Cleanup: Stop ngrok if we started it
        if ngrok_process:
            print("\n🛑 Stopping ngrok...")
            ngrok_process.terminate()
            ngrok_process.wait()