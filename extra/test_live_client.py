import asyncio
import websockets
import json

async def listen_to_transcription(mode, caller_number):
    """
    Connect to live transcription WebSocket and receive real-time transcripts
    
    Args:
        mode: "local" for Whisper or "online" for Deepgram
        caller_number: Phone number of the caller
    """
    uri = f"ws://localhost:8081/live_transcribe/{mode}/{caller_number}"
    
    print(f"\n🎙️  Connecting to live transcription...")
    print(f"Mode: {mode}")
    print(f"Caller: {caller_number}")
    print(f"URI: {uri}\n")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected! Waiting for transcriptions...\n")
            print("=" * 70)
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    
                    if data.get("event") == "connected":
                        print(f"📡 {data.get('message')}\n")
                        continue
                    
                    if data.get("error"):
                        print(f"❌ Error: {data['error']}")
                        break
                    
                    # Display transcription
                    speaker = data.get("speaker", "UNKNOWN")
                    message_text = data.get("message", "")
                    timestamp = data.get("timestamp", "")
                    is_final = data.get("is_final", False)
                    confidence = data.get("confidence", 0)
                    
                    # Format output
                    if speaker == "CALLER":
                        color = "\033[94m"  # Blue
                        icon = "📞"
                    else:  # CR (Control Room)
                        color = "\033[92m"  # Green
                        icon = "🎛️"
                    
                    reset = "\033[0m"
                    
                    if is_final:
                        # Final transcription
                        print(f"\n{color}{icon} {speaker} [{timestamp[:19]}]{reset}")
                        print(f"{color}   {message_text}{reset}")
                        print(f"   Confidence: {confidence:.2f}\n")
                    else:
                        # Partial transcription (interim)
                        print(f"\r{color}{icon} {speaker}: {message_text}...{reset}", end="", flush=True)
                
                except json.JSONDecodeError:
                    print(f"❌ Invalid JSON received: {message}")
                except Exception as e:
                    print(f"❌ Error processing message: {e}")
    
    except websockets.exceptions.ConnectionClosed:
        print("\n\n📴 Connection closed")
    except Exception as e:
        print(f"\n❌ Connection error: {e}")


def main():
    """Main entry point"""
    print("\n" + "=" * 70)
    print("🎙️  LIVE TRANSCRIPTION CLIENT TEST")
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
    
    # Connect and listen
    asyncio.run(listen_to_transcription(mode, caller_number))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n🛑 Stopped by user")
