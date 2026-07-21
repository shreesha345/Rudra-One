export class AudioService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  
  // Audio playback - continuous stream with proper buffering
  private playbackContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private playbackQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private nextPlayTime = 0;
  private sampleRate = 16000; // 16kHz wideband (phone audio upsampled from 8kHz)
  private minBufferSize = 2; // Minimum buffers before starting playback (reduced for lower latency)
  private maxBufferSize = 8; // Maximum buffers to prevent excessive latency (reduced from 15)

  async startRecording(onAudioData: (audioData: Float32Array) => void): Promise<void> {
    try {
      // Request microphone access with optimal settings
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 48000 },
          channelCount: 1,
        },
      };

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        const getUserMedia = (navigator as any).webkitGetUserMedia ||
                           (navigator as any).mozGetUserMedia ||
                           (navigator as any).msGetUserMedia;
        
        if (!getUserMedia) {
           throw new Error('MediaDevices API not supported. Please ensure you are using HTTPS or localhost.');
        }

        this.mediaStream = await new Promise((resolve, reject) => {
          getUserMedia.call(navigator, constraints, resolve, reject);
        });
      }

      // Create audio context with 16kHz for voice quality
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Use 1024 buffer for lower latency (reduced from 2048)
      this.processor = this.audioContext.createScriptProcessor(1024, 1, 1);

      this.processor.onaudioprocess = (event) => {
        if (this.isRecording) {
          const audioData = event.inputBuffer.getChannelData(0);
          onAudioData(audioData);
        }
      };

      // Connect nodes
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.isRecording = true;
      console.log('✅ Audio recording started at 16kHz');
    } catch (error) {
      console.error('❌ Failed to start audio recording:', error);
      throw error;
    }
  }

  stopRecording(): void {
    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    console.log('Audio recording stopped');
  }

  // Convert Float32Array to Int16Array (PCM16)
  floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  // Convert Int16Array to base64
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  isActive(): boolean {
    return this.isRecording;
  }

  // Initialize audio playback with high quality
  async initPlayback(): Promise<void> {
    if (!this.playbackContext) {
      // Use 48kHz for smooth playback (browser will resample from 16kHz)
      this.playbackContext = new AudioContext({ sampleRate: 48000 });
      
      // Create master gain node for global volume/mute control
      this.masterGainNode = this.playbackContext.createGain();
      this.masterGainNode.gain.value = 1.0;
      this.masterGainNode.connect(this.playbackContext.destination);
      
      // Ensure AudioContext is running (required by browsers)
      if (this.playbackContext.state === 'suspended') {
        await this.playbackContext.resume();
      }
      
      console.log('✅ Audio playback initialized at', this.playbackContext.sampleRate, 'Hz, state:', this.playbackContext.state);
    }
  }

  // Play audio from phone (PCM16 data at 16kHz) - Continuous stream with proper buffering
  async playAudio(base64Audio: string, encoding: string = 'pcm16'): Promise<void> {
    try {
      if (!this.playbackContext) {
        await this.initPlayback();
      }

      // Ensure AudioContext is running
      if (this.playbackContext!.state === 'suspended') {
        await this.playbackContext!.resume();
      }

      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let pcm16: Int16Array;
      
      if (encoding === 'pcm16') {
        // Direct PCM16 data (16kHz upsampled from 8kHz phone)
        pcm16 = new Int16Array(bytes.buffer);
      } else {
        // μ-law format (8kHz) - properly decode using lookup table
        pcm16 = this.ulawToPCM16(bytes);
      }
      
      // Convert PCM16 to Float32 with proper normalization
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      // Create AudioBuffer at 16kHz (will be resampled by browser to 48kHz)
      const audioBuffer = this.playbackContext!.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      // Add to playback queue
      this.playbackQueue.push(audioBuffer);
      
      // Prevent queue from growing too large (drop old packets)
      if (this.playbackQueue.length > this.maxBufferSize) {
        const dropped = this.playbackQueue.length - this.maxBufferSize;
        this.playbackQueue.splice(0, dropped);
        console.warn('⚠️ Dropped', dropped, 'audio packets (queue too large)');
      }
      
      // Debug log occasionally
      if (Math.random() < 0.02) {
        console.log('🔊 Audio queued:', float32.length, 'samples, queue size:', this.playbackQueue.length);
      }

      // Start playback only when we have enough buffers (prevents underruns)
      if (!this.isPlaying && this.playbackQueue.length >= this.minBufferSize) {
        this.isPlaying = true;
        this.nextPlayTime = this.playbackContext!.currentTime + 0.05; // 50ms initial delay
        console.log('▶️ Starting audio playback with', this.playbackQueue.length, 'buffers');
        this.scheduleNextBuffer();
      }
    } catch (error) {
      console.error('❌ Failed to queue audio:', error);
    }
  }

  // Schedule next audio buffer for continuous playback with precise timing
  private scheduleNextBuffer(): void {
    if (!this.playbackContext || !this.isPlaying) return;

    // Schedule all available buffers with precise timing (no gaps or overlaps)
    while (this.playbackQueue.length > 0) {
      const audioBuffer = this.playbackQueue.shift()!;

      // Create source node
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;

      // Simplified audio processing chain (less processing = less artifacts)
      
      // High-pass filter (remove low-frequency rumble below 80Hz)
      const highPassFilter = this.playbackContext.createBiquadFilter();
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.value = 80;
      highPassFilter.Q.value = 0.7;

      // Gentle presence boost for voice clarity (2-3kHz range)
      const presenceBoost = this.playbackContext.createBiquadFilter();
      presenceBoost.type = 'peaking';
      presenceBoost.frequency.value = 2500;
      presenceBoost.Q.value = 1.0;
      presenceBoost.gain.value = 3; // Gentle boost

      // Low-pass filter (remove high-frequency noise above 7kHz)
      const lowPassFilter = this.playbackContext.createBiquadFilter();
      lowPassFilter.type = 'lowpass';
      lowPassFilter.frequency.value = 7000;
      lowPassFilter.Q.value = 0.7;

      // Moderate gain for comfortable listening
      const gainNode = this.playbackContext.createGain();
      gainNode.gain.value = 2.5; // Conservative gain to prevent clipping

      // Gentle compressor to smooth volume variations
      const compressor = this.playbackContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Connect audio processing chain
      source.connect(highPassFilter);
      highPassFilter.connect(presenceBoost);
      presenceBoost.connect(lowPassFilter);
      lowPassFilter.connect(gainNode);
      gainNode.connect(compressor);
      
      // Connect to master gain node instead of destination
      if (this.masterGainNode) {
        compressor.connect(this.masterGainNode);
      } else {
        compressor.connect(this.playbackContext.destination);
      }

      // Calculate precise start time (no gaps, no overlaps)
      const currentTime = this.playbackContext.currentTime;
      const startTime = Math.max(currentTime, this.nextPlayTime);
      
      // Start playback at precise time
      source.start(startTime);

      // Calculate when this buffer will finish
      const duration = audioBuffer.duration;
      this.nextPlayTime = startTime + duration;

      // Schedule next buffer when this one is about to end
      const timeUntilEnd = (startTime + duration - currentTime) * 1000;
      if (timeUntilEnd > 0) {
        setTimeout(() => {
          if (this.playbackQueue.length > 0) {
            this.scheduleNextBuffer();
          } else if (this.playbackQueue.length === 0) {
            // Queue is empty, stop playing but keep ready to resume
            this.isPlaying = false;
            console.log('⏸️ Audio playback paused (queue empty)');
          }
        }, Math.max(0, timeUntilEnd - 50)); // Schedule 50ms before end
      }

      // Only schedule one buffer at a time for precise timing
      break;
    }
  }

  // Convert μ-law to PCM16 with proper decompression (ITU-T G.711)
  private ulawToPCM16(ulawData: Uint8Array): Int16Array {
    const pcm16 = new Int16Array(ulawData.length);
    
    // Pre-computed μ-law decompression lookup table (ITU-T G.711 standard)
    // This is the correct μ-law to linear PCM conversion
    const ULAW_TABLE = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      const ulaw = ~i; // Invert bits
      const sign = (ulaw & 0x80) ? -1 : 1;
      const exponent = (ulaw >> 4) & 0x07;
      const mantissa = ulaw & 0x0F;
      
      // Decode using ITU-T G.711 formula
      let magnitude = ((mantissa << 3) + 0x84) << exponent;
      magnitude = magnitude - 0x84;
      
      ULAW_TABLE[i] = sign * magnitude;
    }

    // Decode all samples using lookup table
    for (let i = 0; i < ulawData.length; i++) {
      pcm16[i] = ULAW_TABLE[ulawData[i]];
    }
    
    return pcm16;
  }

  stopPlayback(): void {
    this.isPlaying = false;
    this.playbackQueue = [];
    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = null;
    }
  }

  setMute(muted: boolean): void {
    if (this.masterGainNode && this.playbackContext) {
      // Smooth transition to avoid clicks
      const currentTime = this.playbackContext.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(currentTime);
      this.masterGainNode.gain.setTargetAtTime(muted ? 0 : 1, currentTime, 0.1);
      console.log(muted ? '🔇 Audio muted' : '🔊 Audio unmuted');
    }
  }
}
