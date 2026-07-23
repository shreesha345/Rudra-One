from openai import OpenAI
from dotenv import load_dotenv
import logging
import os
import time
from twilio_sms_send import send_sms
from prompts import RUDRA_SYSTEM_PROMPT

load_dotenv()

logger = logging.getLogger(__name__)

class RudraAgent:
    def __init__(self, caller_number: str = None, call_sid: str = None, public_url: str = None):
        self.call_transferred = False
        self.is_active = True
        self.has_been_transferred = False  # Once transferred, AI cannot be re-enabled
        self.caller_number = caller_number
        self.call_sid = call_sid
        self.public_url = public_url
        self.location_details = None
        
        # Initialize OpenAI client
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            # Fallback or error - user might not have set it yet
            logger.error("OPENAI_API_KEY not set in environment")
            # We don't raise error here to avoid crashing server on startup if key is missing,
            # but process_input will fail.
        
        self.client = OpenAI(api_key=api_key)
        self.model_id = 'gpt-4o'  # High intelligence model
        
        self.system_prompt = RUDRA_SYSTEM_PROMPT
        
        # Initialize history with system prompt
        self.chat_history = [
            {"role": "system", "content": self.system_prompt}
        ]
        
        # Define tools
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "send_location_link",
                    "description": "Send a link to the caller's phone number to request their live GPS location. Use this IMMEDIATELY to get the caller's location instead of asking verbally.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "check_location_status",
                    "description": "Check if the caller's location has been received. Use this to verify if the location link has been clicked.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                }
            }
        ]

    def process_input(self, user_input: str):
        """
        Process user input and return the agent's response using OpenAI.
        Returns: (response_text, call_transferred, tool_used)
        """
        # If call has been transferred to human, AI should never respond again
        if self.has_been_transferred or not self.is_active or self.call_transferred:
            return None, True, None

        if not user_input or not user_input.strip():
            return None, False, None

        try:
            # Add user message to history
            self.chat_history.append({"role": "user", "content": user_input})
            
            # Generate response with OpenAI
            response = self.client.chat.completions.create(
                model=self.model_id,
                messages=self.chat_history,
                temperature=0.7,
                max_tokens=150,
                tools=self.tools,
                tool_choice="auto"
            )
            
            message = response.choices[0].message
            
            # Handle tool calls
            if message.tool_calls:
                for tool_call in message.tool_calls:
                    if tool_call.function.name == "send_location_link":
                        logger.info(f"🛠️ AI triggered tool: send_location_link for {self.caller_number}")
                        
                        # Execute the tool (send SMS)
                        if self.caller_number and self.caller_number != "unknown":
                            # Generate unique link using the public URL (ngrok or production)
                            base_url = self.public_url if self.public_url else "http://localhost:8000"
                            # Ensure no trailing slash
                            if base_url.endswith('/'):
                                base_url = base_url[:-1]
                            
                            # Generate unique request ID to avoid browser caching issues
                            import uuid
                            request_id = str(uuid.uuid4())[:8]
                            link = f"{base_url}/location-request?id={request_id}&caller={self.caller_number}"
                            sms_body = f"RudraOne Emergency: Please click here to share your live location: {link}"
                            
                            try:
                                send_sms(self.caller_number, sms_body)
                                logger.info(f"✅ Location link SMS sent successfully (request_id: {request_id})")
                            except Exception as e:
                                logger.error(f"❌ Failed to send location SMS: {e}")
                        else:
                            logger.warning("⚠️ Cannot send location link: Caller number unknown")
                        
                        # Return a canned response to the user immediately
                        # We append this to history so the AI knows it happened
                        tool_response_text = "I have sent a link to your mobile number. Please click on it to share your live location."
                        
                        # Add the tool call and result to history to keep state consistent (optional but good practice)
                        # For simplicity and speed, we just pretend the AI said the response text
                        self.chat_history.append({"role": "assistant", "content": tool_response_text})
                        
                        return tool_response_text, False, "send_location_link"

                    elif tool_call.function.name == "check_location_status":
                        logger.info(f"🛠️ AI triggered tool: check_location_status for {self.caller_number}")
                        
                        if self.location_details:
                            # Short confirmation, let the system event handle the rest
                            tool_response_text = "I have received your location."
                        else:
                            tool_response_text = "I haven't received your location yet. Please click the link I sent to your mobile number."
                        
                        self.chat_history.append({"role": "assistant", "content": tool_response_text})
                        return tool_response_text, False, "check_location_status"

            response_text = message.content
            
            if not response_text:
                # If no content and no tool call (shouldn't happen usually), fallback
                logger.warning("OpenAI returned empty response. Sending fallback.")
                fallback_text = "I didn't catch that. Could you please repeat?"
                
                # Add fallback response to history
                self.chat_history.append({"role": "assistant", "content": fallback_text})
                return fallback_text, False, None

            # Add assistant response to history
            self.chat_history.append({"role": "assistant", "content": response_text})
            
            # Check if AI wants to transfer the call
            if "TRANSFER_TO_HUMAN:" in response_text:
                self.call_transferred = True
                self.is_active = False
                self.has_been_transferred = True  # Permanent flag - cannot be reversed
                # Extract the reason and return a clean message
                parts = response_text.split("TRANSFER_TO_HUMAN:")
                reason = parts[1].strip() if len(parts) > 1 else "emergency situation"
                return f"I'm transferring you to a human dispatcher now. {reason}", True, None
            
            return response_text, self.call_transferred, None
            
        except Exception as e:
            logger.error(f"Error in RudraAgent (OpenAI): {e}")
            return "I'm sorry, I'm having trouble processing that. Let me transfer you to a human dispatcher.", True, None

    def process_system_event(self):
        """
        Trigger a response from the agent based on the current history (e.g. after a system update).
        Does NOT add a user message, but generates an assistant response based on the latest state.
        Returns: (response_text, call_transferred, tool_used)
        """
        # If call has been transferred to human, AI should never respond again
        if self.has_been_transferred or not self.is_active or self.call_transferred:
            return None, True, None

        try:
            # Generate response with OpenAI based on current history (which includes system update)
            response = self.client.chat.completions.create(
                model=self.model_id,
                messages=self.chat_history,
                temperature=0.7,
                max_tokens=150,
                tools=self.tools,
                tool_choice="auto"
            )
            
            message = response.choices[0].message
            
            # Handle tool calls (unlikely here but possible)
            if message.tool_calls:
                # ... (Simplified tool handling for system events if needed, mostly just return text)
                pass

            response_text = message.content
            
            if not response_text:
                return None, False, None

            # Add assistant response to history
            self.chat_history.append({"role": "assistant", "content": response_text})
            
            # Check if AI wants to transfer the call
            if "TRANSFER_TO_HUMAN:" in response_text:
                self.call_transferred = True
                self.is_active = False
                self.has_been_transferred = True
                parts = response_text.split("TRANSFER_TO_HUMAN:")
                reason = parts[1].strip() if len(parts) > 1 else "emergency situation"
                # Return the full text so the user hears the summary first
                return response_text.replace(f"TRANSFER_TO_HUMAN: {reason}", f"I'm transferring you to a human dispatcher now. {reason}"), True, None
            
            return response_text, self.call_transferred, None
            
        except Exception as e:
            logger.error(f"Error in RudraAgent (System Event): {e}")
            return None, False, None

    def receive_location_update(self, address: str, language_code: str = "en"):
        """
        Receive location update from the system and inject it into the chat history.
        """
        logger.info(f"📍 RudraAgent received location update: {address} (Language: {language_code})")
        self.location_details = address
        
        lang_map = {
            "en": "English",
            "hi": "Hindi",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "bn": "Bengali",
            "ta": "Tamil",
            "te": "Telugu",
            "mr": "Marathi",
            "gu": "Gujarati",
            "kn": "Kannada",
            "ml": "Malayalam"
        }
        language_name = lang_map.get(language_code, "the same language as the caller")
        
        self.chat_history.append({
            "role": "system", 
            "content": f"SYSTEM UPDATE: The caller's live location has been received via the link. Address: {address}. You should acknowledge this to the caller. IMPORTANT: Respond in {language_name} ONLY."
        })


