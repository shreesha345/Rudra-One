// Frontend-only Twilio SMS helper replicating raw curl request.
// WARNING: Putting your Auth Token in frontend code exposes it to users.
// This should only be used for quick testing. For production, use a backend.

export interface SMSResponse {
  success: boolean;
  messageSid?: string;
  error?: string;
}

// Hard-code Account SID (from curl) and read Auth Token from env so it isn't committed.
// Replace VITE_TWILIO_AUTH_TOKEN in your .env with the real token.
const ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID ;
const AUTH_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN ;
const FROM_NUMBER = import.meta.env.VITE_TWILIO_PHONE_NUMBER;

// Use the backend API URL for the tracking link. 
// NOTE: VITE_API_URL must be set to your public ngrok URL for this to work on a mobile device.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function buildAuthHeader(): string {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.error('❌ Missing ACCOUNT_SID or AUTH_TOKEN');
  }
  return 'Basic ' + btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);
}

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
    console.log('📤 Sending SMS (frontend-only) to:', to);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
    const form = new URLSearchParams();
    form.append('To', to);
    form.append('From', FROM_NUMBER);
    form.append('Body', body);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': buildAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString()
    });

    const data = await response.json().catch(() => ({}));


    console.log(data)

    if (response.ok) {
      console.log('✅ Twilio accepted message:', data.sid);
      return { success: true, messageSid: data.sid };
    }
    console.error('❌ Twilio error', data);
    return { success: false, error: data.message || 'Twilio API error' };
  } catch (e) {
    console.error('❌ Frontend SMS send failed', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function sendTrackingLink(to: string): Promise<SMSResponse> {
  const publicUrl = await getPublicUrl();
  const trackingUrl = `${publicUrl}/location-request?caller=${encodeURIComponent(to)}`;
  const body = `📍 Location Tracking\n${trackingUrl}`;
  return sendRawSMS(to, body);
}

export const twilioService = {
  sendRawSMS,
  sendTrackingLink
};
