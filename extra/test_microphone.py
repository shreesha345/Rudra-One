"""Test microphone input to verify it's working and loud enough"""
import pyaudio
import audioop
import time

CHUNK = 160
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 8000

p = pyaudio.PyAudio()

print("\n🎤 Microphone Test")
print("=" * 70)
print("Speak into your microphone...")
print("You should see volume levels when speaking")
print("Press Ctrl+C to stop")
print("=" * 70)

# List available devices
print("\n📋 Available audio devices:")
for i in range(p.get_device_count()):
    info = p.get_device_info_by_index(i)
    if info['maxInputChannels'] > 0:
        print(f"  [{i}] {info['name']} (inputs: {info['maxInputChannels']})")

print("\n🎤 Using default microphone...\n")

try:
    stream = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        frames_per_buffer=CHUNK
    )
    
    max_volume = 0
    sample_count = 0
    
    while True:
        data = stream.read(CHUNK, exception_on_overflow=False)
        
        # Calculate volume
        rms = audioop.rms(data, 2)
        
        # Track max
        if rms > max_volume:
            max_volume = rms
        
        sample_count += 1
        
        # Display volume bar
        bar_length = min(50, rms // 100)
        bar = "█" * bar_length
        
        status = "🔇 Silent" if rms < 100 else "🔊 SPEAKING!" if rms > 500 else "🎤 Talking"
        
        print(f"\r{status} | Volume: {rms:5d} | Max: {max_volume:5d} | {bar:<50}", end="", flush=True)
        
        if sample_count % 100 == 0:
            print(f"\n💡 Tip: Speak louder if volume is below 500")
        
        time.sleep(0.02)
        
except KeyboardInterrupt:
    print("\n\n✅ Test complete!")
    print(f"📊 Maximum volume recorded: {max_volume}")
    if max_volume < 300:
        print("⚠️  Volume is low - speak louder or adjust microphone settings")
    elif max_volume < 800:
        print("✅ Volume is good")
    else:
        print("🔊 Volume is excellent!")
finally:
    stream.stop_stream()
    stream.close()
    p.terminate()
