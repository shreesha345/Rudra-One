const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface CallNotification {
  type: 'call_started' | 'call_ended';
  caller_number: string;
  call_sid: string;
  timestamp: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  environment: string;
  deepgram_configured: boolean;
  twilio_configured: boolean;
}

export const apiService = {
  async checkHealth(): Promise<HealthResponse> {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    return response.json();
  },

  async checkWebSocketStatus(): Promise<{ status: string; available: boolean }> {
    try {
      const response = await fetch(`${API_BASE_URL}/ws/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        return { status: 'unavailable', available: false };
      }
      
      const data = await response.json();
      return { status: data.status, available: data.status === 'available' };
    } catch (error) {
      console.error('WebSocket status check failed:', error);
      return { status: 'error', available: false };
    }
  },

  async streamAudio(audioData: string, callerNumber: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/audio/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: audioData,
        caller_number: callerNumber,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to stream audio');
    }
  },

  async login(username: string, password: string): Promise<{ message: string; agent_id: string }> {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    return response.json();
  },

  getWebSocketUrl(endpoint: string): string {
    const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const baseUrl = API_BASE_URL.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${baseUrl}${endpoint}`;
  },

  getBaseUrl(): string {
    return API_BASE_URL;
  },

  async saveInsights(callSid: string, insights: any): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/calls/${callSid}/insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(insights),
      });

      if (!response.ok) {
        throw new Error('Failed to save insights');
      }
    } catch (error) {
      console.error('Error saving insights:', error);
    }
  },

  async clearDatabase(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/database/clear`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to clear database');
    }
  },
};
