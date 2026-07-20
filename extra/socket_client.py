"""
WebSocket Client for Emergency Services Call Monitoring
Connects to the /monitor endpoint and displays real-time call data
"""
import asyncio
import websockets
import json
from datetime import datetime
from colorama import init, Fore, Style

# Initialize colorama for colored terminal output
init(autoreset=True)

class CallMonitor:
    def __init__(self, websocket_url):
        self.websocket_url = websocket_url
        self.active_calls = {}
    
    def format_timestamp(self, timestamp):
        """Convert timestamp to readable format"""
        return datetime.fromtimestamp(timestamp).strftime('%H:%M:%S')
    
    def print_call_started(self, data):
        """Display call started event"""
        print(f"\n{Fore.GREEN}{'='*80}")
        print(f"{Fore.GREEN}📞 NEW CALL STARTED")
        print(f"{Fore.GREEN}{'='*80}")
        print(f"{Fore.CYAN}Caller Number: {Fore.WHITE}{data['caller_number']}")
        print(f"{Fore.CYAN}Call ID: {Fore.WHITE}{data['caller_id']}")
        print(f"{Fore.CYAN}AI Model: {Fore.WHITE}{data['AI_model']}")
        print(f"{Fore.CYAN}Time: {Fore.WHITE}{self.format_timestamp(data['timestamp'])}")
        print(f"{Fore.GREEN}{'='*80}\n")
        
        self.active_calls[data['caller_id']] = {
            'caller_number': data['caller_number'],
            'start_time': data['timestamp'],
            'message_count': 0
        }
    
    def print_conversation(self, data):
        """Display conversation event"""
        call_id = data['caller_id']
        
        print(f"{Fore.YELLOW}[{self.format_timestamp(data['timestamp'])}] Call: {call_id[:8]}...")
        print(f"{Fore.BLUE}👤 Human: {Fore.WHITE}{data['message_human']}")
        print(f"{Fore.MAGENTA}🤖 AI: {Fore.WHITE}{data['message_AI']}")
        print(f"{Fore.YELLOW}{'-'*80}\n")
        
        if call_id in self.active_calls:
            self.active_calls[call_id]['message_count'] += 1
    
    def print_call_ended(self, data):
        """Display call ended event"""
        print(f"\n{Fore.RED}{'='*80}")
        print(f"{Fore.RED}📴 CALL ENDED")
        print(f"{Fore.RED}{'='*80}")
        print(f"{Fore.CYAN}Caller Number: {Fore.WHITE}{data['caller_number']}")
        print(f"{Fore.CYAN}Call ID: {Fore.WHITE}{data['caller_id']}")
        print(f"{Fore.CYAN}Duration: {Fore.WHITE}{data['duration']:.1f} seconds")
        print(f"{Fore.CYAN}Total Messages: {Fore.WHITE}{data['total_messages']}")
        print(f"{Fore.CYAN}Time: {Fore.WHITE}{self.format_timestamp(data['timestamp'])}")
        print(f"{Fore.RED}{'='*80}\n")
        
        if data['caller_id'] in self.active_calls:
            del self.active_calls[data['caller_id']]
    
    def print_status(self):
        """Display current monitoring status"""
        print(f"{Fore.GREEN}{'='*80}")
        print(f"{Fore.GREEN}📊 MONITORING STATUS")
        print(f"{Fore.GREEN}{'='*80}")
        print(f"{Fore.CYAN}Active Calls: {Fore.WHITE}{len(self.active_calls)}")
        
        if self.active_calls:
            for call_id, info in self.active_calls.items():
                duration = datetime.now().timestamp() - info['start_time']
                print(f"{Fore.YELLOW}  • {call_id[:8]}... - {info['caller_number']} - {duration:.0f}s - {info['message_count']} msgs")
        
        print(f"{Fore.GREEN}{'='*80}\n")
    
    async def connect(self):
        """Connect to WebSocket and monitor calls"""
        print(f"{Fore.CYAN}Connecting to {self.websocket_url}...")
        
        try:
            async with websockets.connect(self.websocket_url) as websocket:
                print(f"{Fore.GREEN}✅ Connected successfully!")
                print(f"{Fore.YELLOW}Monitoring emergency calls... (Press Ctrl+C to stop)\n")
                
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        event = data.get('event')
                        
                        if event == 'call_started':
                            self.print_call_started(data)
                        elif event == 'conversation':
                            self.print_conversation(data)
                        elif event == 'call_ended':
                            self.print_call_ended(data)
                        else:
                            print(f"{Fore.YELLOW}Unknown event: {event}")
                    
                    except json.JSONDecodeError:
                        print(f"{Fore.RED}Error: Invalid JSON received")
                    except Exception as e:
                        print(f"{Fore.RED}Error processing message: {e}")
        
        except websockets.exceptions.WebSocketException as e:
            print(f"{Fore.RED}❌ WebSocket error: {e}")
        except ConnectionRefusedError:
            print(f"{Fore.RED}❌ Connection refused. Is the server running?")
        except KeyboardInterrupt:
            print(f"\n{Fore.YELLOW}Disconnecting...")
        except Exception as e:
            print(f"{Fore.RED}❌ Unexpected error: {e}")


async def main():
    """Main function"""
    # Default WebSocket URL - update this with your ngrok URL
    default_url = "ws://localhost:8080/monitor"
    
    print(f"{Fore.CYAN}{'='*80}")
    print(f"{Fore.CYAN}Emergency Services Call Monitor")
    print(f"{Fore.CYAN}{'='*80}\n")
    
    # Get WebSocket URL from user or use default
    url_input = input(f"Enter WebSocket URL (or press Enter for {default_url}): ").strip()
    websocket_url = url_input if url_input else default_url
    
    # Create monitor and connect
    monitor = CallMonitor(websocket_url)
    await monitor.connect()


if __name__ == "__main__":
    asyncio.run(main())
