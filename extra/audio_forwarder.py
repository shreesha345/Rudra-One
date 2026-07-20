"""
Audio Forwarder - Connects to voice server and forwards audio to transcription server
"""
import asyncio
import websockets
import json
import os
from dotenv import load_dotenv

load_dotenv()


async def forward_audio(mode, caller_number):
    """
    Forward audio from voice server to transcription server
    
    Args:
        mode: "local" or "online"
        caller_number: Phone number of the caller
    """
    # Connect to voice server (audio source)
    voice_server_url = os.getenv("SERVER_WS_URL", "ws://localhost:8080/client")
    
    # Connect to transcription server (audio destination)
    transcription_server_url = f"ws://localhost:8081/audio_source/{mode}/{caller_number}"
    
    print(f"\n🔄 Audio Forwarder")
    print(f"=" * 70)
    print(f"Voice Server:        {voice_server_url}")
    print(f"Transcription Server: {transcription_server_url}")
    print(f"Mode:                {mode}")
    print(f"Caller:              {caller_number}")
    print(f"=" * 70 + "\n")
    
    try:
        # Connect to both servers
        print("⏳ Connecting to voice server...")
        voice_ws = await websockets.connect(voice_server_url)
        print("✅ Connected to voice server")
        
        print("⏳ Connecting to transcription server...")
        transcription_ws = await websockets.connect(transcription_server_url)
        print("✅ Connected to transcription server\n")
        
        print("🎧 Forwarding audio... (Press Ctrl+C to stop)\n")
        
        # Forward messages from voice server to transcription server
        async for message in voice_ws:
            try:
                # Simply forward the message
                await transcription_ws.send(message)
                
                # Check if call ended
                data = json.loads(message)
                if data.get("event") == "call_ended":
                    print("\n📴 Call ended, stopping forwarder")
                    break
            
            except json.JSONDecodeError:
                continue
            except Exception as e:
                print(f"❌ Error forwarding: {e}")
        
        # Close connections
        await voice_ws.close()
        await transcription_ws.close()
        print("✅ Connections closed")
    
    except websockets.exceptions.ConnectionClosed:
        print("\n📴 Connection closed")
    except Exception as e:
        print(f"\n❌ Error: {e}")


def main():
    """Main entry point"""
    print("\n" + "=" * 70)
    print("🔄 AUDIO FORWARDER")
    print("=" * 70)
    
    # Get user input
    print("\nSelect transcription mode:")
    print("1. Local (Whisper)")
    print("2. Online (Deepgram)")
    
    while True:
        choice = input("\nEnter choice (1 or 2): ").strip()
        if choice in ['1', '2']:
            mode = "local" if choice == '1' else "online"
            break
        print("❌ Invalid choice. Please enter 1 or 2.")
    
    caller_number = input("Enter caller number (e.g., +1234567890): ").strip()
    
    if not caller_number:
        caller_number = "+1234567890"  # Default for testing
        print(f"Using default: {caller_number}")
    
    # Start forwarding
    asyncio.run(forward_audio(mode, caller_number))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n🛑 Stopped by user")
