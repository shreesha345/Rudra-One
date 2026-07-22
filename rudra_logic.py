from google import genai
from google.genai import types
from dotenv import load_dotenv
import logging
import os

load_dotenv()

logger = logging.getLogger(__name__)

class RudraAgent:
    def __init__(self):
        self.call_transferred = False
        self.is_active = True
        self.has_been_transferred = False  # Once transferred, AI cannot be re-enabled
        
        # Initialize Gemini client
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not set in environment")
        
        self.client = genai.Client(api_key=api_key)
        self.model_id = 'gemini-2.5-flash'  # Fast model for real-time responses
        
        self.system_prompt = (
            "You are a 112 Emergency Services AI assistant for India. "
            "Your role is to quickly assess emergency situations and gather critical information. "
            "\n\nYour PRIMARY GOALS:\n"
            "1. Quickly identify the type of emergency\n"
            "2. Get the caller's location immediately\n"
            "3. Assess severity and nature of the situation\n"
            "\n\nIMPORTANT RULES:\n"
            "- If this is a LIFE-THREATENING emergency or SERIOUS INCIDENT (medical, fire, any crime, accident, domestic violence), "
            "say EXACTLY: 'TRANSFER_TO_HUMAN: [brief reason]'\n"
            "- If it's a non-emergency (noise complaint, general inquiry, lost item), handle it yourself\n"
            "- Keep responses SHORT and DIRECT (1-2 sentences max)\n"
            "- Ask ONE question at a time\n"
            "- Speak naturally and calmly\n"
            "\n\nStart by asking: 'What is your emergency?'"
        )
        
        self.chat_history = []

    def process_input(self, user_input: str):
        """
        Process user input and return the agent's response using Gemini.
        Returns: (response_text, call_transferred)
        """
        # If call has been transferred to human, AI should never respond again
        if self.has_been_transferred or not self.is_active or self.call_transferred:
            return None, True

        if not user_input or not user_input.strip():
            return None, False

        try:
            # Add user message to history
            self.chat_history.append(types.Content(
                role='user',
                parts=[types.Part(text=user_input)]
            ))
            
            # Generate response with Gemini
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=self.chat_history,
                config=types.GenerateContentConfig(
                    system_instruction=self.system_prompt,
                    temperature=0.7,
                    max_output_tokens=150  # Keep responses concise
                )
            )
            
            response_text = response.text
            
            if not response_text:
                logger.warning("Gemini returned empty response (possibly blocked). Sending fallback.")
                fallback_text = "I didn't catch that. Could you please repeat?"
                
                # Add fallback response to history to maintain conversation flow
                self.chat_history.append(types.Content(
                    role='model',
                    parts=[types.Part(text=fallback_text)]
                ))
                return fallback_text, False

            # Add assistant response to history
            self.chat_history.append(types.Content(
                role='model',
                parts=[types.Part(text=response_text)]
            ))
            
            # Check if AI wants to transfer the call
            if "TRANSFER_TO_HUMAN:" in response_text:
                self.call_transferred = True
                self.is_active = False
                self.has_been_transferred = True  # Permanent flag - cannot be reversed
                # Extract the reason and return a clean message
                reason = response_text.split("TRANSFER_TO_HUMAN:")[1].strip()
                return f"I'm transferring you to a human dispatcher now. {reason}", True
            
            return response_text, self.call_transferred
            
        except Exception as e:
            logger.error(f"Error in RudraAgent (Gemini): {e}")
            return "I'm sorry, I'm having trouble processing that. Let me transfer you to a human dispatcher.", True

