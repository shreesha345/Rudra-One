// Frontend Twilio SMS helper using backend API.

export interface SMSResponse {
  success: boolean;
  messageSid?: string;
  error?: string;
}

// Use the backend API URL for the tracking link. 
// NOTE: VITE_API_URL must be set to your public ngrok URL for this to work on a mobile device.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function getPublicUrl(): Promise<string> {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    return data.public_url || API_URL;
  } catch (e) {
    console.error('Failed to fetch public URL', e);
    return API_URL;
  }
}

async function sendRawSMS(to: string, body: string): Promise<SMSResponse> {
  try {
    console.log('📤 Sending SMS via backend to:', to);
    
    const response = await fetch(`${API_URL}/api/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, body })
    });

    const data = await response.json();

    if (response.ok && data.status === 'success') {
      console.log('✅ SMS sent successfully:', data.message_sid);
      return { success: true, messageSid: data.message_sid };
    }
    
    console.error('❌ SMS send failed', data);
    return { success: false, error: data.message || 'Failed to send SMS' };
  } catch (e) {
    console.error('❌ SMS send failed', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function sendTrackingLink(to: string): Promise<SMSResponse> {
  const publicUrl = await getPublicUrl();
  const trackingUrl = `${publicUrl}/location-request?caller=${encodeURIComponent(to)}`;
  console.log('🔗 Constructed tracking URL:', trackingUrl);
  const body = `📍 Location Tracking\n${trackingUrl}`;
  return sendRawSMS(to, body);
}

export const twilioService = {
  sendRawSMS,
  sendTrackingLink
};
