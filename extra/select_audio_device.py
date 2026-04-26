"""Select specific audio input/output devices"""
import pyaudio

p = pyaudio.PyAudio()

print("\n🎤 Available INPUT devices (Microphones):")
print("=" * 70)
input_devices = []
for i in range(p.get_device_count()):
    info = p.get_device_info_by_index(i)
    if info['maxInputChannels'] > 0:
        input_devices.append((i, info))
        default = " (DEFAULT)" if i == p.get_default_input_device_info()['index'] else ""
        print(f"[{i}] {info['name']}{default}")

print("\n🔊 Available OUTPUT devices (Speakers):")
print("=" * 70)
output_devices = []
for i in range(p.get_device_count()):
    info = p.get_device_info_by_index(i)
    if info['maxOutputChannels'] > 0:
        output_devices.append((i, info))
        default = " (DEFAULT)" if i == p.get_default_output_device_info()['index'] else ""
        print(f"[{i}] {info['name']}{default}")

print("\n" + "=" * 70)
print("💡 To use a specific device, update voice_phone_call_groq.py:")
print("   Change: input_device_index=None")
print("   To:     input_device_index=X  (where X is the device number)")
print("\n   Example for Headset:")
print("   input_device_index=2  # Headset (Galaxy Buds2)")
print("   output_device_index=2 # Headset (Galaxy Buds2)")
print("=" * 70)

p.terminate()
