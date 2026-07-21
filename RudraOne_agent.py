import asyncio
import io
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent  # Correct import path
from langchain_core.tools import tool
from dotenv import load_dotenv
from pydub import AudioSegment
from pydub.playback import play
from elevenlabs_tts import text_to_speech_elevenlabs, stream_text_to_speech_elevenlabs

load_dotenv()

# Global flag to track call transfer
call_transferred = False

@tool
def call_off_human_dispatcher(city: str) -> str:
    """call off human dispatcher to handle the request"""
    global call_transferred
    call_transferred = True
    return f"call has been transferred to the Human dispatcher!"

async def speak_response(text):
    """Convert text to speech and play it"""
    # Try streaming first for lower latency
    success = stream_text_to_speech_elevenlabs(text)
    if success:
        return

    # Fallback to full download if streaming fails
    # print("Generating audio...")
    audio_bytes = await text_to_speech_elevenlabs(text)
    if audio_bytes:
        try:
            # Load and play audio
            audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format="mp3")
            play(audio)
        except Exception as e:
            print(f"Error playing audio: {e}")
            print("Make sure ffmpeg is installed and accessible.")
    else:
        print("Failed to generate audio.")

async def main():
    llm = ChatOpenAI(model="gpt-4o", max_tokens=600)
    tools = [call_off_human_dispatcher]

    # Create agent with updated system prompt
    agent = create_agent(
        model=llm,
        tools=tools,
        system_prompt="You are Rudra, a helpful AI assistant. You can speak to the user. Keep your answers concise and conversational."
    )

    print("Start chatting (type 'quit' to exit):")
    while True:
        user_input = input("User: ")
        if user_input.lower() in ["quit", "exit"]:
            break
        
        # Invoke with messages format
        response = agent.invoke({
            "messages": [{"role": "user", "content": user_input}]
        })
        
        # Extract the latest message from the response
        latest_message = response["messages"][-1]
        print(f"Agent: {latest_message.content}")

        # Speak the response
        await speak_response(latest_message.content)

        if call_transferred:
            print("Exiting: Call has been transferred.")
            break

if __name__ == "__main__":
    asyncio.run(main())