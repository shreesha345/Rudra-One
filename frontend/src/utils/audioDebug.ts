// Audio debugging utilities

export const logAudioInfo = (label: string, data: any) => {
  console.log(`🎵 [${label}]`, {
    type: data.type,
    hasAudio: !!data.audio,
    audioLength: data.audio?.length,
    encoding: data.encoding,
    sampleRate: data.sample_rate,
    timestamp: data.timestamp,
  });
};

export const testAudioPlayback = async () => {
  try {
    const audioContext = new AudioContext();
    console.log('🎵 Audio Context Info:', {
      sampleRate: audioContext.sampleRate,
      state: audioContext.state,
      baseLatency: audioContext.baseLatency,
      outputLatency: (audioContext as any).outputLatency,
    });

    // Test with a simple beep
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 440; // A4 note
    gainNode.gain.value = 0.1;
    
    oscillator.start();
    setTimeout(() => oscillator.stop(), 200);
    
    console.log('✅ Audio playback test successful');
    return true;
  } catch (error) {
    console.error('❌ Audio playback test failed:', error);
    return false;
  }
};

export const analyzeAudioData = (base64Audio: string) => {
  try {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pcm16 = new Int16Array(bytes.buffer);
    
    // Calculate statistics
    let sum = 0;
    let max = -32768;
    let min = 32767;
    let nonZero = 0;
    
    for (let i = 0; i < pcm16.length; i++) {
      const val = pcm16[i];
      sum += Math.abs(val);
      max = Math.max(max, val);
      min = Math.min(min, val);
      if (val !== 0) nonZero++;
    }
    
    const avg = sum / pcm16.length;
    
    return {
      samples: pcm16.length,
      avgAmplitude: avg,
      maxAmplitude: max,
      minAmplitude: min,
      nonZeroSamples: nonZero,
      percentNonZero: (nonZero / pcm16.length) * 100,
      isSilent: avg < 100,
    };
  } catch (error) {
    console.error('Failed to analyze audio:', error);
    return null;
  }
};
