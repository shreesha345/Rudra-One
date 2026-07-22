"""
Twilio SMS Service for Emergency Dispatch
Formats and sends SMS alerts to emergency services with incident details
"""
import os
import logging
from typing import Dict, Optional
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment variables
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID") or os.getenv("VITE_TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN") or os.getenv("VITE_TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER") or os.getenv("VITE_TWILIO_PHONE_NUMBER")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")


class TwilioSMSService:
    """Service for sending formatted SMS alerts to emergency services"""
    
    def __init__(self):
        """Initialize Twilio client and Gemini for text formatting"""
        self.twilio_client = None
        self.gemini_client = None
        
        # Initialize Twilio
        logger.info(f"Attempting to initialize Twilio with SID: {'Present' if TWILIO_ACCOUNT_SID else 'Missing'} and Token: {'Present' if TWILIO_AUTH_TOKEN else 'Missing'}")
        
        if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
            try:
                from twilio.rest import Client
                self.twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
                logger.info("✅ Twilio SMS client initialized")
            except ImportError:
                logger.error("❌ Twilio library not installed. Run: pip install twilio")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Twilio: {e}")
        else:
            logger.warning("⚠️ Twilio credentials not configured")
        
        # Initialize Gemini for text summarization
        if GOOGLE_API_KEY:
            try:
                self.gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
                logger.info("✅ Gemini client initialized for SMS formatting")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Gemini: {e}")
        else:
            logger.warning("⚠️ Google API key not configured")
    
    def format_sms_message(self, insights_data: Dict, location_address: str, emergency_type: str) -> str:
        """
        Format SMS message from insights data using Gemini
        
        Args:
            insights_data: Dictionary containing incident insights
            location_address: Full address of the emergency location
            emergency_type: Type of emergency ('hospital', 'police', 'fire')
        
        Returns:
            Formatted SMS message string
        """
        try:
            # Extract key information from insights
            summary = insights_data.get('summary', '')
            persons = insights_data.get('persons_described', [])
            incident_info = insights_data.get('incident', {})
            time_info = insights_data.get('time_info', {})
            additional_info = insights_data.get('additional_info', [])
            
            # Build raw information text
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
            
            # Use Gemini to format and summarize if available
            if self.gemini_client:
                try:
                    prompt = f"""Format this 112 emergency information into a clear, concise SMS message (max 160 characters) for emergency services.
Focus on: location, incident type, severity, and immediate action needed.

IMPORTANT: The 'Emergency Type' provided below is the CONFIRMED classification. If 'Incident Details' or 'Summary' conflicts with 'Emergency Type', YOU MUST prioritize 'Emergency Type' and frame the message accordingly.

Raw Information:
{raw_text}

Format the SMS to be professional, urgent, and actionable. Start with the emergency type and location."""
                    
                    response = self.gemini_client.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=prompt
                    )
                    
                    formatted_message = response.text.strip()
                    logger.info(f"✅ SMS formatted with Gemini: {formatted_message[:50]}...")
                    return formatted_message
                    
                except Exception as e:
                    logger.warning(f"⚠️ Gemini formatting failed: {e}, using fallback")
            
            # Fallback: Manual formatting if Gemini is unavailable
            incident_type = incident_info.get('type', 'Emergency')
            severity = incident_info.get('severity', 'Unknown')
            
            fallback_message = f"""🚨 {emergency_type.upper()} EMERGENCY
📍 {location_address}
Type: {incident_type}
Severity: {severity}
{summary[:100] if summary else 'Emergency assistance required'}
Time: {time_info.get('occurred_at', 'Now')}"""
            
            return fallback_message
            
        except Exception as e:
            logger.error(f"❌ Error formatting SMS: {e}")
            # Absolute fallback
            return f"🚨 {emergency_type.upper()} EMERGENCY at {location_address}. Immediate assistance required."
    
    def send_emergency_sms(
        self,
        to_number: str,
        insights_data: Dict,
        location_address: str,
        emergency_type: str,
        station_name: Optional[str] = None,
        maps_link: Optional[str] = None
    ) -> Dict:
        """
        Send formatted emergency SMS to emergency service
        
        Args:
            to_number: Emergency service phone number
            insights_data: Dictionary containing incident insights
            location_address: Full address of emergency
            emergency_type: Type of emergency ('hospital', 'police', 'fire')
            station_name: Name of the emergency station (optional)
        
        Returns:
            Dictionary with status and message
        """
        if not self.twilio_client:
            return {
                'status': 'error',
                'message': 'Twilio client not initialized'
            }
        
        if not TWILIO_PHONE_NUMBER:
            return {
                'status': 'error',
                'message': 'Twilio phone number not configured'
            }
        
        try:
            # Format the SMS message
            sms_body = self.format_sms_message(insights_data, location_address, emergency_type)
            # Append Google Maps link if provided
            if maps_link:
                sms_body = f"{sms_body}\nMap: {maps_link}"[:500]  # safeguard max length
            
            # Add station name if provided
            if station_name:
                sms_body = f"To: {station_name}\n{sms_body}"
            
            # Send SMS via Twilio
            message = self.twilio_client.messages.create(
                body=sms_body,
                from_=TWILIO_PHONE_NUMBER,
                to=to_number
            )
            
            logger.info(f"✅ SMS sent successfully to {to_number}, SID: {message.sid}")
            
            return {
                'status': 'success',
                'message': 'SMS sent successfully',
                'message_sid': message.sid,
                'to_number': to_number,
                'sms_body': sms_body
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to send SMS: {e}")
            return {
                'status': 'error',
                'message': f'Failed to send SMS: {str(e)}'
            }
        
    def send_raw_sms(self, to_number: str, body: str) -> Dict:
        """
        Send a raw SMS message
        
        Args:
            to_number: Recipient phone number
            body: Message body
            
        Returns:
            Dictionary with status and message
        """
        if not self.twilio_client:
            return {
                'status': 'error',
                'message': 'Twilio client not initialized'
            }
        
        if not TWILIO_PHONE_NUMBER:
            return {
                'status': 'error',
                'message': 'Twilio phone number not configured'
            }
            
        try:
            message = self.twilio_client.messages.create(
                body=body,
                from_=TWILIO_PHONE_NUMBER,
                to=to_number
            )
            
            logger.info(f"✅ Raw SMS sent successfully to {to_number}, SID: {message.sid}")
            
            return {
                'status': 'success',
                'message': 'SMS sent successfully',
                'message_sid': message.sid
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to send SMS: {e}")
            return {
                'status': 'error',
                'message': f'Failed to send SMS: {str(e)}'
            }


# Create global instance
sms_service = TwilioSMSService()


def send_emergency_alert(
    to_number: str,
    insights_data: Dict,
    location_address: str,
    emergency_type: str,
    station_name: Optional[str] = None,
    maps_link: Optional[str] = None
) -> Dict:
    """
    Convenience function to send emergency SMS
    
    Args:
        to_number: Emergency service phone number
        insights_data: Dictionary containing incident insights
        location_address: Full address of emergency
        emergency_type: Type of emergency ('hospital', 'police', 'fire')
        station_name: Name of the emergency station (optional)
    
    Returns:
        Dictionary with status and message
    """
    return sms_service.send_emergency_sms(
        to_number=to_number,
        insights_data=insights_data,
        location_address=location_address,
        emergency_type=emergency_type,
        station_name=station_name,
        maps_link=maps_link
    )


def send_sms(to_number: str, body: str) -> Dict:
    """
    Convenience function to send raw SMS
    """
    return sms_service.send_raw_sms(to_number, body)


if __name__ == "__main__":
    # Test the SMS service
    test_insights = {
        'summary': 'Noise complaint from large party with approximately 100 people',
        'location': ['123 Main Street', 'Apartment 4B'],
        'persons_described': [
            {'name': 'John Smith', 'role': 'Caller'}
        ],
        'incident': {
            'type': 'Noise Complaint',
            'severity': 'Medium',
            'status': 'Active'
        },
        'time_info': {
            'occurred_at': '3 hours ago'
        },
        'additional_info': ['Loud music', 'People shouting', 'Furniture moving']
    }
    
    test_location = "123 Main Street, Apartment 4B, New York, NY 10001"
    
    # Test formatting only (don't actually send)
    formatted_msg = sms_service.format_sms_message(
        insights_data=test_insights,
        location_address=test_location,
        emergency_type='police'
    )
    
    print("\n" + "="*70)
    print("📱 TEST SMS MESSAGE:")
    print("="*70)
    print(formatted_msg)
    print("="*70)
