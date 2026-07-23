"""
Text-to-Speech service — combines ElevenLabs and Sarvam AI.

`text_to_speech_hybrid` picks Sarvam for Indian languages + English and
falls back to ElevenLabs for everything else.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from typing import Optional

from backend import config

logger = logging.getLogger(__name__)

# ── ElevenLabs ─────────────────────────────────────────────────────────────────

_VOICE_MAP = {
    'hi': 'pNInz6obpgDQGcFmaJgB',
    'bn': 'pNInz6obpgDQGcFmaJgB',
    'ta': 'pNInz6obpgDQGcFmaJgB',
    'te': 'pNInz6obpgDQGcFmaJgB',
    'es': 'EXAVITQu4vr4xnSDxMaL',
    'fr': 'EXAVITQu4vr4xnSDxMaL',
    'de': 'pNInz6obpgDQGcFmaJgB',
    'zh': 'pNInz6obpgDQGcFmaJgB',
    'ja': 'pNInz6obpgDQGcFmaJgB',
    'ar': 'pNInz6obpgDQGcFmaJgB',
}


def _get_elevenlabs_client():
    try:
        from elevenlabs.client import ElevenLabs
        if not config.ELEVENLABS_API_KEY:
            logger.error("ElevenLabs API key not configured")
            return None
        return ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
    except ImportError:
        logger.error("ElevenLabs library not installed")
        return None


def _get_voice_id(language_code: str) -> str:
    return _VOICE_MAP.get(language_code, config.ELEVENLABS_VOICE)


async def text_to_speech_elevenlabs(text: str, language_code: str = 'en') -> Optional[bytes]:
    """Convert text to speech using ElevenLabs."""
    if not config.ELEVENLABS_API_KEY:
        logger.error("ElevenLabs API key not configured - cannot generate speech")
        return None
    if not text or not text.strip():
        return None

    def _generate():
        try:
            from elevenlabs import VoiceSettings
            client = _get_elevenlabs_client()
            if not client:
                return None
            voice_id = _get_voice_id(language_code)
            logger.info("ElevenLabs TTS: '%s...' | Lang: %s | Voice: %s", text[:50], language_code, voice_id)
            audio_generator = client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id="eleven_multilingual_v2",
                voice_settings=VoiceSettings(
                    stability=0.5,
                    similarity_boost=0.75,
                    style=0.0,
                    use_speaker_boost=True,
                ),
            )
            audio_chunks = []
            for chunk in audio_generator:
                if chunk:
                    audio_chunks.append(chunk)
            if not audio_chunks:
                logger.error("No audio generated from ElevenLabs")
                return None
            audio_data = b"".join(audio_chunks)
            logger.info("ElevenLabs generated %d bytes", len(audio_data))
            return audio_data
        except ImportError:
            logger.error("ElevenLabs library not installed")
            return None
        except Exception as e:
            logger.error("ElevenLabs TTS error: %s", e)
            return None

    return await asyncio.to_thread(_generate)


# ── Sarvam AI ──────────────────────────────────────────────────────────────────

_SARVAM_SPEAKERS = {
    'hi': 'anushka', 'bn': 'anushka', 'ta': 'meera', 'te': 'anushka',
    'kn': 'anushka', 'ml': 'anushka', 'gu': 'anushka', 'pa': 'anushka',
    'mr': 'anushka', 'en': 'anushka',
}

_LANGUAGE_CODE_MAP = {
    'hi': 'hi-IN', 'bn': 'bn-IN', 'ta': 'ta-IN', 'te': 'te-IN',
    'kn': 'kn-IN', 'ml': 'ml-IN', 'gu': 'gu-IN', 'pa': 'pa-IN',
    'mr': 'mr-IN', 'en': 'en-IN',
}


def is_indian_language(language_code: str) -> bool:
    return language_code in _SARVAM_SPEAKERS or language_code == 'en'


async def text_to_speech_sarvam(text: str, language_code: str = 'hi') -> Optional[bytes]:
    """Convert text to speech using Sarvam AI streaming WebSocket."""
    if not config.SARVAM_API_KEY or config.SARVAM_API_KEY == 'your_sarvam_api_key_here':
        logger.error("Sarvam API key not configured")
        return None
    if not text or not text.strip():
        return None

    try:
        from sarvamai import AsyncSarvamAI, AudioOutput, EventResponse

        speaker = _SARVAM_SPEAKERS.get(language_code, 'anushka')
        target_language = _LANGUAGE_CODE_MAP.get(language_code, 'hi-IN')
        logger.info("Sarvam TTS: '%s...' | Lang: %s | Speaker: %s", text[:50], target_language, speaker)

        client = AsyncSarvamAI(api_subscription_key=config.SARVAM_API_KEY)

        async with client.text_to_speech_streaming.connect(
            model="bulbul:v2",
            send_completion_event=True,
        ) as ws:
            await ws.configure(
                target_language_code=target_language,
                speaker=speaker,
                pitch=1.0,
                pace=1.1,
                min_buffer_size=50,
                max_chunk_length=200,
                output_audio_codec="mp3",
                output_audio_bitrate="128k",
            )
            await ws.convert(text)
            await ws.flush()

            audio_chunks = []
            async for message in ws:
                if isinstance(message, AudioOutput):
                    audio_chunks.append(base64.b64decode(message.data.audio))
                elif isinstance(message, EventResponse):
                    if message.data.event_type == "final":
                        break

            if not audio_chunks:
                logger.error("No audio generated from Sarvam")
                return None
            audio_data = b"".join(audio_chunks)
            logger.info("Sarvam generated %d bytes", len(audio_data))
            return audio_data

    except ImportError:
        logger.error("Sarvam SDK not installed. Install with: pip install sarvamai")
        return None
    except Exception as e:
        logger.error("Sarvam TTS error: %s", e)
        return None


# ── Hybrid ────────────────────────────────────────────────────────────────────

async def text_to_speech_hybrid(text: str, language_code: str = 'en') -> Optional[bytes]:
    """Use Sarvam for Indian languages + English, ElevenLabs for others."""
    if is_indian_language(language_code):
        logger.info("Using Sarvam AI for %s", language_code)
        return await text_to_speech_sarvam(text, language_code)
    else:
        logger.info("Using ElevenLabs for %s", language_code)
        return await text_to_speech_elevenlabs(text, language_code)
