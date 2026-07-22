// ElevenLabs Text-to-Speech Service
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = import.meta.env.VITE_ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1';
// Pre-defined voice IDs from ElevenLabs (5 different voices)
const VOICE_IDS = [
  '21m00Tcm4TlvDq8ikWAM', // Rachel - calm female
  'AZnzlk1XvdvUeBnXmlld', // Domi - strong female
  'EXAVITQu4vr4xnSDxMaL', // Bella - soft female
  'ErXwobaYiN019PkySvjV', // Antoni - well-rounded male
  'MF3mGyEYCl7XYWbV9V6O', // Elli - emotional female
];

class ElevenLabsService {
  private selectedVoiceId: string | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isPlaying: boolean = false;

  
  selectRandomVoice(): string {
    const randomIndex = Math.floor(Math.random() * VOICE_IDS.length);
    this.selectedVoiceId = VOICE_IDS[randomIndex];
    console.log('🎤 Selected voice ID:', this.selectedVoiceId);
    return this.selectedVoiceId;
  }

  /**
   * Get the currently selected voice ID
   */
  getSelectedVoice(): string | null {
    return this.selectedVoiceId;
  }

  /**
   * Reset voice selection (for new training sessions)
   */
  resetVoice(): void {
    this.selectedVoiceId = null;
    this.stopCurrentAudio();
  }

  /**
   * Stop any currently playing audio
   */
  stopCurrentAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }

  /**
   * Check if audio is currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Convert text to speech using ElevenLabs API
   * @param text - The text to convert to speech
   * @param voiceId - Optional voice ID (uses selected voice if not provided)
   * @returns Promise that resolves when audio finishes playing
   */
  async textToSpeech(text: string, voiceId?: string): Promise<void> {
    // Use provided voice or the selected voice for the session
    const voice = voiceId || this.selectedVoiceId;
    
    if (!voice) {
      console.warn('⚠️ No voice selected. Call selectRandomVoice() first.');
      return;
    }

    // Stop any currently playing audio
    this.stopCurrentAudio();

    try {
      console.log('🗣️ Converting text to speech:', text.substring(0, 50) + '...');
      
      const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voice}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play audio
      this.currentAudio = new Audio(audioUrl);
      this.isPlaying = true;

      // Return promise that resolves when audio finishes
      return new Promise((resolve, reject) => {
        if (!this.currentAudio) {
          reject(new Error('Audio element not created'));
          return;
        }

        this.currentAudio.onended = () => {
          console.log('✅ Audio playback finished');
          this.isPlaying = false;
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        this.currentAudio.onerror = (error) => {
          console.error('❌ Audio playback error:', error);
          this.isPlaying = false;
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        this.currentAudio.play().catch((error) => {
          console.error('❌ Failed to play audio:', error);
          this.isPlaying = false;
          URL.revokeObjectURL(audioUrl);
          reject(error);
        });
      });

    } catch (error) {
      console.error('❌ ElevenLabs TTS error:', error);
      this.isPlaying = false;
      throw error;
    }
  }
}

// Export singleton instance
export const elevenlabsService = new ElevenLabsService();
