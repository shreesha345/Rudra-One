import json
import random
import os
from google import genai
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class UnifiedResponse:
    def __init__(self, text):
        self.text = text

class UnifiedChatSession:
    def __init__(self, client, provider, model=None):
        self.client = client
        self.provider = provider
        self.model = model
        self.history = [] # For OpenAI, we need to manage history manually
        self.google_chat = None
        
        if provider == "google":
            self.model = model or os.getenv("TRAINING_GOOGLE_MODEL", "gemini-2.5-flash")
            self.google_chat = self.client.chats.create(model=self.model)
        elif provider == "openai":
            self.model = model or os.getenv("TRAINING_OPENAI_MODEL", "gpt-4o")

    def send_message(self, message):
        if self.provider == "google":
            response = self.google_chat.send_message(message)
            return UnifiedResponse(response.text)
        elif self.provider == "openai":
            self.history.append({"role": "user", "content": message})
            response = self.client.chat.completions.create(
                model=self.model,
                messages=self.history
            )
            text = response.choices[0].message.content
            self.history.append({"role": "assistant", "content": text})
            return UnifiedResponse(text)

class UnifiedTrainingClient:
    def __init__(self, provider="google", api_key=None):
        self.provider = provider
        self.api_key = api_key
        self.chats = self # Mocking the structure client.chats.create
        
        if provider == "google":
            if not api_key:
                # Try to get from env if not provided
                self.api_key = os.getenv("GOOGLE_API_KEY")
            
            if not self.api_key:
                raise ValueError("Google API Key required")
            self.client = genai.Client(api_key=self.api_key)
            
        elif provider == "openai":
            if not api_key:
                self.api_key = os.getenv("OPENAI_API_KEY")
                
            if not self.api_key:
                raise ValueError("OpenAI API Key required")
            self.client = OpenAI(api_key=self.api_key)
        else:
            raise ValueError(f"Unsupported provider: {provider}")

    def create(self, model=None):
        return UnifiedChatSession(self.client, self.provider, model)

# Initialize default client for CLI usage if possible
try:
    default_provider = os.getenv("TRAINING_AI_PROVIDER", "google").lower()
    if default_provider == "google":
        api_key = os.getenv("GOOGLE_API_KEY")
        if api_key:
            client = UnifiedTrainingClient("google", api_key)
    elif default_provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            client = UnifiedTrainingClient("openai", api_key)
except Exception as e:
    print(f"Warning: Could not initialize default training client: {e}")
    client = None


def load_scenarios(file_path="911_calls.json"):
    """Load 911 dataset from JSON file."""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data

def select_random_scenario(scenarios):
    """Select a random call scenario from dataset."""
    scenario = random.choice(scenarios)
    return scenario

def start_training_session(scenario):
    """Initialize chat model for simulated emergency call."""
    title = scenario.get("title", "Unknown Emergency")
    desc = scenario.get("desc", "No description")
    location = scenario.get("twp", "Unknown Location")

    intro_prompt = f"""
You are simulating an emergency call for a 911 dispatcher training. Your role is to be the CALLER.

**CRITICAL INSTRUCTIONS FOR YOUR ROLE:**
1.  **NO DESCRIPTIVE ACTIONS:** Do NOT use parentheses or asterisks to describe sounds, actions, or emotions (e.g., no `(sobbing)`, `*sirens wail*`, `(gasping)`).
2.  **STRAIGHT CONVERSATION ONLY:** Your responses must only contain the words spoken by the caller. It should be a direct, back-and-forth conversation.
3.  **BE A DESCRIPTIVE REPORTER:** Act as a person urgently reporting an emergency. When you answer, provide relevant details about what you see, hear, and know. Your goal is to paint a clear picture of the scene with your words.
4.  **ELABORATE WHEN ASKED:** Start with an urgent opening line. When the dispatcher asks a question, answer it fully. For example, if they ask for the location, don't just say "the train tracks." Say something like, "It's under the train tracks on Maple Avenue, just past the old factory." Provide the important details you have.

**SCENARIO BRIEFING:**
*   **INCIDENT TYPE:** {title}
*   **DESCRIPTION:** {desc}
*   **LOCATION:** {location}

Begin the call now with your opening line. It should be urgent and give a key detail about the emergency.
    """

    if not client:
        print("Error: Training client not initialized. Check your API keys and .env configuration.")
        return

    chat = client.chats.create()
    print("Starting simulated emergency call training...")
    print("Type your dispatcher responses. Type 'end session' to stop.\n")

    response = chat.send_message(intro_prompt)
    print("Caller:", response.text)

    while True:
        dispatcher_input = input("You (Dispatcher): ")
        if dispatcher_input.lower().strip() == "end session":
            grading_prompt = """
Evaluate the trainee’s overall performance in this conversation. 
Provide:
1. A percentage score (0–100%)
2. A brief evaluation of performance (e.g., clarity, calmness, accuracy, empathy).
            """
            eval_response = chat.send_message(grading_prompt)
            print("\n----- SESSION SUMMARY -----")
            print(eval_response.text)
            break

        response = chat.send_message(dispatcher_input)
        print("\nCaller:", response.text)

def main():
    scenarios = load_scenarios("911_calls.json")
    selected = select_random_scenario(scenarios)
    start_training_session(selected)

if __name__ == "__main__":
    main()
