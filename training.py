import json
import random
import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
# Initialize Gemini client
# Make sure you have set your API key first:
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise RuntimeError("GOOGLE_API_KEY environment variable not set. Please set your Google API key before running.")
client = genai.Client()


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

    chat = client.chats.create(model="gemini-2.5-flash")
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
