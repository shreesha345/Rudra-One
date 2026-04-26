import asyncio
import websockets
import json
from datetime import datetime


async def connect_to_transcription_stream(caller_number: str):
    """Connect to a specific caller's transcription stream"""
    server_url = f"ws://localhost:8080/client/{caller_number}"
    
    print(f"\n📞 Connecting to transcription stream for: {caller_number}")
    
    try:
        async with websockets.connect(server_url) as websocket:
            print(f"✅ Connected to {caller_number}'s stream")
            print("🎧 Receiving transcriptions...\n")
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    
                    # Show raw WebSocket data
                    print(f"\n📦 RAW WEBSOCKET DATA:")
                    print(json.dumps(data, indent=2))
                    print("-" * 70)
                    
                    msg_type = data.get("type")
                    
                    if msg_type == "call_ended":
                        print(f"\n📴 Call ended")
                        break
                
                except json.JSONDecodeError:
                    print(f"⚠️  Non-JSON message: {message}")
                except Exception as e:
                    print(f"⚠️  Error: {e}")
    
    except websockets.exceptions.ConnectionClosed:
        print(f"\n🔌 Connection closed for {caller_number}")
    except Exception as e:
        print(f"\n❌ Connection error: {e}")


async def listen_for_calls():
    """Listen for incoming call notifications and auto-connect to transcription streams"""
    server_url = "ws://localhost:8080/client/notifications"
    
    print(f"\n🎙️  Smart Transcription Client")
    print(f"=" * 70)
    print(f"Connecting to: {server_url}")
    print(f"Waiting for incoming calls...")
    print(f"=" * 70 + "\n")
    
    active_streams = {}
    
    try:
        async with websockets.connect(server_url) as websocket:
            print("✅ Connected to notification service")
            print("⏳ Waiting for calls...\n")
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")
                    
                    if msg_type == "connected":
                        print(f"✅ {data.get('message')}\n")
                    
                    elif msg_type == "call_started":
                        caller_number = data.get("caller_number")
                        call_sid = data.get("call_sid")
                        timestamp = data.get("timestamp")
                        
                        print(f"\n{'=' * 70}")
                        print(f"📞 NEW CALL DETECTED!")
                        print(f"   Caller: {caller_number}")
                        print(f"   Call ID: {call_sid}")
                        print(f"   Time: {timestamp}")
                        print(f"{'=' * 70}")
                        
                        task = asyncio.create_task(connect_to_transcription_stream(caller_number))
                        active_streams[call_sid] = task
                    
                    elif msg_type == "call_ended":
                        caller_number = data.get("caller_number")
                        call_sid = data.get("call_sid")
                        
                        print(f"\n{'=' * 70}")
                        print(f"📴 CALL ENDED")
                        print(f"   Caller: {caller_number}")
                        print(f"   Call ID: {call_sid}")
                        print(f"{'=' * 70}\n")
                        
                        if call_sid in active_streams:
                            active_streams[call_sid].cancel()
                            del active_streams[call_sid]
                    
                    elif msg_type == "keepalive":
                        pass
                    
                    else:
                        print(f"📨 Unknown message: {data}")
                
                except json.JSONDecodeError:
                    print(f"⚠️  Non-JSON message: {message}")
                except Exception as e:
                    print(f"⚠️  Error processing message: {e}")
    
    except websockets.exceptions.ConnectionClosed:
        print("\n🔌 Connection closed by server")
    except Exception as e:
        print(f"\n❌ Connection error: {e}")
    finally:
        for task in active_streams.values():
            task.cancel()


async def main():
    """Main entry point"""
    try:
        await listen_for_calls()
    except KeyboardInterrupt:
        print("\n\n👋 Disconnected by user")


if __name__ == "__main__":
    asyncio.run(main())
