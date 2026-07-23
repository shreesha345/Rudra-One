"""
Twilio SMS service — sends formatted emergency alerts.

Refactored to use the OpenAI-compatible LLM factory instead of Google Gemini.
"""
from __future__ import annotations

import logging
from typing import Dict, Optional

from backend import config
from backend.services.llm import get_chat_completion

logger = logging.getLogger(__name__)


def _get_twilio_client():
    """Lazily initialise and return a Twilio client, or None."""
    if not config.TWILIO_ACCOUNT_SID or not config.TWILIO_AUTH_TOKEN:
        return None
    try:
        from twilio.rest import Client
        return Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
    except ImportError:
        logger.error("Twilio library not installed. Run: pip install twilio")
        return None
    except Exception as e:
        logger.error("Failed to initialise Twilio: %s", e)
        return None


class TwilioSMSService:
    def __init__(self):
        self.twilio_client = _get_twilio_client()
        if self.twilio_client:
            logger.info("Twilio SMS client initialised")

    # ── formatting ──────────────────────────────────────────────────────────
    def format_sms_message(self, insights_data: Dict, location_address: str, emergency_type: str) -> str:
        try:
            summary = insights_data.get('summary', '')
            persons = insights_data.get('persons_described', [])
            incident_info = insights_data.get('incident', {})
            time_info = insights_data.get('time_info', {})
            additional_info = insights_data.get('additional_info', [])

            raw_text = f"""
Emergency Type: {emergency_type.upper()}
Location: {location_address}

Incident Summary: {summary}

Persons Involved: {', '.join([p.get('name', 'Unknown') for p in persons]) if persons else 'Not specified'}

Incident Details:
- Type: {incident_info.get('type', 'Unknown')}
- Severity: {incident_info.get('severity', 'Unknown')}
- Status: {incident_info.get('status', 'Active')}

Time Information: {time_info.get('occurred_at', 'Unknown time')}

Additional Information: {', '.join(additional_info) if additional_info else 'None'}
"""
            if config.LLM_API_KEY:
                try:
                    prompt = f"""Format this 112 emergency information into a clear, concise SMS message (max 160 characters) for emergency services.
Focus on: location, incident type, severity, and immediate action needed.

IMPORTANT: The 'Emergency Type' provided below is the CONFIRMED classification. If 'Incident Details' or 'Summary' conflicts with 'Emergency Type', YOU MUST prioritize 'Emergency Type' and frame the message accordingly.

Raw Information:
{raw_text}

Format the SMS to be professional, urgent, and actionable. Start with the emergency type and location."""

                    response = get_chat_completion(
                        [{"role": "user", "content": prompt}],
                        temperature=0.3,
                        max_tokens=200,
                    )
                    formatted = response.choices[0].message.content.strip()
                    logger.info("SMS formatted with LLM: %s...", formatted[:50])
                    return formatted
                except Exception as e:
                    logger.warning("LLM formatting failed: %s, using fallback", e)

            incident_type = incident_info.get('type', 'Emergency')
            severity = incident_info.get('severity', 'Unknown')
            return (
                f"🚨 {emergency_type.upper()} EMERGENCY\n"
                f"📍 {location_address}\n"
                f"Type: {incident_type}\n"
                f"Severity: {severity}\n"
                f"{summary[:100] if summary else 'Emergency assistance required'}\n"
                f"Time: {time_info.get('occurred_at', 'Now')}"
            )
        except Exception as e:
            logger.error("Error formatting SMS: %s", e)
            return f"🚨 {emergency_type.upper()} EMERGENCY at {location_address}. Immediate assistance required."

    # ── sending ─────────────────────────────────────────────────────────────
    def send_emergency_sms(
        self,
        to_number: str,
        insights_data: Dict,
        location_address: str,
        emergency_type: str,
        station_name: Optional[str] = None,
        maps_link: Optional[str] = None,
    ) -> Dict:
        if not self.twilio_client:
            return {'status': 'error', 'message': 'Twilio client not initialized'}
        if not config.TWILIO_PHONE_NUMBER:
            return {'status': 'error', 'message': 'Twilio phone number not configured'}

        try:
            sms_body = self.format_sms_message(insights_data, location_address, emergency_type)
            if maps_link:
                sms_body = f"{sms_body}\nMap: {maps_link}"[:500]
            if station_name:
                sms_body = f"To: {station_name}\n{sms_body}"

            # Get public tunnel URL for status callback
            from backend.services.tunnel import get_tunnel_url
            public_domain = get_tunnel_url()
            callback_url = None
            if public_domain:
                if not public_domain.startswith("http"):
                    public_domain = f"https://{public_domain}"
                callback_url = f"{public_domain}/api/sms/status"

            create_kwargs = {
                'body': sms_body,
                'from_': config.TWILIO_PHONE_NUMBER,
                'to': to_number,
            }
            if callback_url:
                create_kwargs['status_callback'] = callback_url
                logger.info("Using SMS status callback: %s", callback_url)

            message = self.twilio_client.messages.create(**create_kwargs)
            logger.info("SMS sent successfully to %s, SID: %s", to_number, message.sid)
            return {
                'status': 'success',
                'message': 'SMS sent successfully',
                'message_sid': message.sid,
                'to_number': to_number,
                'sms_body': sms_body,
            }
        except Exception as e:
            logger.error("Failed to send SMS: %s", e)
            return {'status': 'error', 'message': f'Failed to send SMS: {str(e)}'}

    def send_raw_sms(self, to_number: str, body: str) -> Dict:
        if not self.twilio_client:
            return {'status': 'error', 'message': 'Twilio client not initialized'}
        if not config.TWILIO_PHONE_NUMBER:
            return {'status': 'error', 'message': 'Twilio phone number not configured'}
        try:
            from backend.services.tunnel import get_tunnel_url
            public_domain = get_tunnel_url()
            callback_url = None
            if public_domain:
                if not public_domain.startswith("http"):
                    public_domain = f"https://{public_domain}"
                callback_url = f"{public_domain}/api/sms/status"

            create_kwargs = {
                'body': body,
                'from_': config.TWILIO_PHONE_NUMBER,
                'to': to_number,
            }
            if callback_url:
                create_kwargs['status_callback'] = callback_url
                logger.info("Using raw SMS status callback: %s", callback_url)

            message = self.twilio_client.messages.create(**create_kwargs)
            logger.info("Raw SMS sent to %s, SID: %s", to_number, message.sid)
            return {'status': 'success', 'message': 'SMS sent successfully', 'message_sid': message.sid}
        except Exception as e:
            logger.error("Failed to send SMS: %s", e)
            return {'status': 'error', 'message': f'Failed to send SMS: {str(e)}'}


sms_service = TwilioSMSService()


def send_emergency_alert(
    to_number: str,
    insights_data: Dict,
    location_address: str,
    emergency_type: str,
    station_name: Optional[str] = None,
    maps_link: Optional[str] = None,
) -> Dict:
    return sms_service.send_emergency_sms(
        to_number=to_number,
        insights_data=insights_data,
        location_address=location_address,
        emergency_type=emergency_type,
        station_name=station_name,
        maps_link=maps_link,
    )


def send_sms(to_number: str, body: str) -> Dict:
    return sms_service.send_raw_sms(to_number, body)


def format_call_message(insights_data: dict, location_address: str, emergency_type: str) -> str:
    """Format a voice call message using the LLM, with fallback."""
    try:
        if not config.LLM_API_KEY:
            summary = insights_data.get('summary', 'Emergency assistance required')
            return f"Emergency dispatch calling. We have a {emergency_type} emergency at {location_address}. {summary[:100]}. Please respond immediately."

        summary = insights_data.get('summary', '')
        persons = insights_data.get('persons_described', [])
        incident_info = insights_data.get('incident', {})
        additional_info = insights_data.get('additional_info', [])

        context = f"""
Emergency Type: {emergency_type.upper()}
Location: {location_address}
Summary: {summary}
Persons: {', '.join([p.get('name', 'Unknown') for p in persons]) if persons else 'Not specified'}
Incident Type: {incident_info.get('type', 'Unknown')}
Additional Info: {', '.join(additional_info) if additional_info else 'None'}
"""
        prompt = f"""Create a professional emergency dispatch voice message (max 30 seconds speaking time).
This will be spoken to emergency services when they answer the phone.

Context: {context}

IMPORTANT: The 'Emergency Type' provided in Context is the CONFIRMED classification. If other details conflict, prioritize 'Emergency Type'.

Format requirements:
- Start with "This is emergency dispatch"
- State the emergency type and location clearly
- Briefly mention key details
- End with "Please respond immediately"
- Keep it concise and urgent"""

        response = get_chat_completion(
            [{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=200,
        )
        formatted = response.choices[0].message.content.strip().replace('"', '').replace("'", "")
        logger.info("Call message formatted with LLM: %s...", formatted[:50])
        return formatted
    except Exception as e:
        logger.error("Error formatting call message: %s", e)
        return f"Emergency dispatch calling. {emergency_type} emergency at {location_address}. Please respond immediately."
