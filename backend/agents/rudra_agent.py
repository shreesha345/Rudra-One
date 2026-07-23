"""
RudraAgent — emergency-call AI agent.

Refactored to use the OpenAI-compatible LLM factory so it works with any
provider that speaks the OpenAI Chat Completions API.
"""
from __future__ import annotations

import logging
import uuid

from backend import config
from backend.services.llm import get_chat_completion
from backend.services.twilio import send_sms
from backend.prompts import RUDRA_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class RudraAgent:
    def __init__(self, caller_number: str | None = None, call_sid: str | None = None, public_url: str | None = None):
        self.call_transferred = False
        self.is_active = True
        self.has_been_transferred = False
        self.caller_number = caller_number
        self.call_sid = call_sid
        self.public_url = public_url
        self.location_details = None

        self.system_prompt = RUDRA_SYSTEM_PROMPT
        self.chat_history: list[dict] = [
            {"role": "system", "content": self.system_prompt}
        ]

        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "send_location_link",
                    "description": "Send a link to the caller's phone number to request their live GPS location. Use this IMMEDIATELY to get the caller's location instead of asking verbally.",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "check_location_status",
                    "description": "Check if the caller's location has been received. Use this to verify if the location link has been clicked.",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
        ]

    def process_input(self, user_input: str):
        if self.has_been_transferred or not self.is_active or self.call_transferred:
            return None, True, None
        if not user_input or not user_input.strip():
            return None, False, None

        try:
            self.chat_history.append({"role": "user", "content": user_input})

            response = get_chat_completion(
                self.chat_history,
                temperature=config.LLM_TEMPERATURE,
                max_tokens=config.LLM_MAX_TOKENS,
                tools=self.tools,
                tool_choice="auto",
            )
            message = response.choices[0].message

            if message.tool_calls:
                for tool_call in message.tool_calls:
                    if tool_call.function.name == "send_location_link":
                        logger.info("AI triggered tool: send_location_link for %s", self.caller_number)
                        if self.caller_number and self.caller_number != "unknown":
                            base_url = self.public_url or f"http://localhost:{config.PORT}"
                            if base_url.endswith("/"):
                                base_url = base_url[:-1]
                            request_id = str(uuid.uuid4())[:8]
                            link = f"{base_url}/location-request?id={request_id}&caller={self.caller_number}"
                            self.last_location_link = link
                            sms_body = f"RudraOne Emergency: Please click here to share your live location: {link}"
                            try:
                                send_sms(self.caller_number, sms_body)
                                logger.info("Location link SMS sent (request_id: %s)", request_id)
                            except Exception as e:
                                logger.error("Failed to send location SMS: %s", e)
                        else:
                            logger.warning("Cannot send location link: caller number unknown")

                        tool_response_text = "I have sent a link to your mobile number. Please click on it to share your live location."
                        self.chat_history.append({"role": "assistant", "content": tool_response_text})
                        return tool_response_text, False, "send_location_link"

                    elif tool_call.function.name == "check_location_status":
                        logger.info("AI triggered tool: check_location_status for %s", self.caller_number)
                        if self.location_details:
                            tool_response_text = "I have received your location."
                        else:
                            tool_response_text = "I haven't received your location yet. Please click the link I sent to your mobile number."
                        self.chat_history.append({"role": "assistant", "content": tool_response_text})
                        return tool_response_text, False, "check_location_status"

            response_text = message.content
            if not response_text:
                logger.warning("LLM returned empty response. Sending fallback.")
                fallback_text = "I didn't catch that. Could you please repeat?"
                self.chat_history.append({"role": "assistant", "content": fallback_text})
                return fallback_text, False, None

            self.chat_history.append({"role": "assistant", "content": response_text})

            if "TRANSFER_TO_HUMAN:" in response_text:
                self.call_transferred = True
                self.is_active = False
                self.has_been_transferred = True
                parts = response_text.split("TRANSFER_TO_HUMAN:")
                reason = parts[1].strip() if len(parts) > 1 else "emergency situation"
                return f"I'm transferring you to a human dispatcher now. {reason}", True, None

            return response_text, self.call_transferred, None

        except Exception as e:
            logger.error("Error in RudraAgent: %s", e)
            return "I'm sorry, I'm having trouble processing that. Let me transfer you to a human dispatcher.", True, None

    def process_system_event(self):
        if self.has_been_transferred or not self.is_active or self.call_transferred:
            return None, True, None

        try:
            response = get_chat_completion(
                self.chat_history,
                temperature=config.LLM_TEMPERATURE,
                max_tokens=config.LLM_MAX_TOKENS,
                tools=self.tools,
                tool_choice="auto",
            )
            message = response.choices[0].message

            if message.tool_calls:
                pass

            response_text = message.content
            if not response_text:
                return None, False, None

            self.chat_history.append({"role": "assistant", "content": response_text})

            if "TRANSFER_TO_HUMAN:" in response_text:
                self.call_transferred = True
                self.is_active = False
                self.has_been_transferred = True
                parts = response_text.split("TRANSFER_TO_HUMAN:")
                reason = parts[1].strip() if len(parts) > 1 else "emergency situation"
                return response_text.replace(f"TRANSFER_TO_HUMAN: {reason}", f"I'm transferring you to a human dispatcher now. {reason}"), True, None

            return response_text, self.call_transferred, None

        except Exception as e:
            logger.error("Error in RudraAgent (System Event): %s", e)
            return None, False, None

    def receive_location_update(self, address: str, language_code: str = "en"):
        logger.info("RudraAgent received location update: %s (Language: %s)", address, language_code)
        self.location_details = address

        lang_map = {
            "en": "English", "hi": "Hindi", "es": "Spanish", "fr": "French",
            "de": "German", "bn": "Bengali", "ta": "Tamil", "te": "Telugu",
            "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam",
        }
        language_name = lang_map.get(language_code, "the same language as the caller")

        self.chat_history.append({
            "role": "system",
            "content": f"SYSTEM UPDATE: The caller's live location has been received via the link. Address: {address}. You should acknowledge this to the caller. IMPORTANT: Respond in {language_name} ONLY."
        })
