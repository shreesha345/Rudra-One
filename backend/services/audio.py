"""
Audio processing helpers — format conversion, resampling, u-law encoding.
"""
from __future__ import annotations

import base64
import logging
from typing import Any

from backend import config

logger = logging.getLogger(__name__)

# audioop is a stdlib module on CPython < 3.13; on 3.13+ / other builds
# we fall back to our numpy-based audio_ops shim.
try:
    import audioop  # type: ignore
except ImportError:
    from backend import audio_ops as audioop  # type: ignore


def process_audio_for_clients(audio_data: bytes) -> dict:
    """Process audio data for both browser (16kHz PCM16) and phone (8kHz uLaw)."""
    result: dict[str, Any] = {"browser_audio": None, "phone_chunks": []}

    try:
        from pydub import AudioSegment
        import io

        try:
            audio_segment = AudioSegment.from_file(io.BytesIO(audio_data))
        except Exception:
            audio_segment = AudioSegment.from_mp3(io.BytesIO(audio_data))

        # Browser: 16kHz PCM16
        browser_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        pcm_16khz = browser_segment.raw_data
        result["browser_audio"] = base64.b64encode(pcm_16khz).decode("utf-8")

        # Phone: 8kHz uLaw
        phone_segment = audio_segment.set_frame_rate(8000).set_channels(1).set_sample_width(2)
        pcm_8khz = phone_segment.raw_data

        if len(pcm_8khz) % 2 != 0:
            pcm_8khz += b'\x00'

        ulaw_data = audioop.lin2ulaw(pcm_8khz, 2)

        chunk_size = 160  # 20ms
        for i in range(0, len(ulaw_data), chunk_size):
            chunk = ulaw_data[i:i + chunk_size]
            if len(chunk) == chunk_size:
                result["phone_chunks"].append(base64.b64encode(chunk).decode("utf-8"))

    except Exception as e:
        logger.error("Audio processing error: %s", e)

    return result


def save_recordings(phone_audio_recording: list[bytes], recording_lock: Any) -> None:
    """Save audio recordings to WAV files."""
    import wave
    from datetime import datetime
    import os

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    recordings_dir = config.RECORDINGS_DIR
    os.makedirs(recordings_dir, exist_ok=True)

    with recording_lock:
        if phone_audio_recording:
            phone_filename = os.path.join(recordings_dir, f"phone_{timestamp}.wav")
            try:
                wf = wave.open(phone_filename, "wb")
                wf.setnchannels(config.AUDIO_CHANNELS)
                wf.setsampwidth(2)
                wf.setframerate(config.AUDIO_RATE)
                wf.writeframes(b"".join(phone_audio_recording))
                wf.close()
                logger.info("Phone audio saved: %s", phone_filename)
            except Exception as e:
                logger.error("Failed to save phone recording: %s", e)
