"""
Sarvam AI Streaming Text-to-Speech Integration
Real-time TTS for Indian languages using WebSocket streaming
"""
import os
import asyncio
import base64
import logging
from typing import Optional
import json

logger = logging.getLogger(__name__)

# Sarvam AI Configuration
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_WS_URL = "wss://api.sarvam.ai/text-to-speech-websocket"

# Language to speaker mapping for Sarvam AI
SARVAM_SPEAKERS = {
    'hi': 'anushka',  # Hindi
    'bn': 'anushka',  # Bengali (use Hindi voice)
    'ta': 'meera',    # Tamil
    'te': 'anushka',  # Telugu (use Hindi voice)
    'kn': 'anushka',  # Kannada
    'ml': 'anushka',  # Malayalam
    'gu': 'anushka',  # Gujarati
    'pa': 'anushka',  # Punjabi
    'mr': 'anushka',  # Marathi
    'en': 'anushka',  # English (Indian accent)
}

# Language code mapping (ISO 639-1 to Sarvam format)
LANGUAGE_CODE_MAP = {
    'hi': 'hi-IN',
    'bn': 'bn-IN',
    'ta': 'ta-IN',
    'te': 'te-IN',
    'kn': 'kn-IN',
    'ml': 'ml-IN',
    'gu': 'gu-IN',
    'pa': 'pa-IN',
    'mr': 'mr-IN',
    'en': 'en-IN',
}


def is_indian_language(language_code: str) -> bool:
    """Check if language is an Indian language supported by Sarvam"""
    # Sarvam supports all Indian languages AND English
    return language_code in SARVAM_SPEAKERS or language_code == 'en'


async def text_to_speech_sarvam(text: str, language_code: str = 'hi') -> Optional[bytes]:
    """
    Convert text to speech using Sarvam AI streaming WebSocket API (using official SDK)
    
    Args:
        text: Text to convert to speech
        language_code: Language code (hi, ta, te, kn, ml, gu, pa, mr, bn, en)
    
    Returns:
        MP3 audio bytes or None if failed
    """
    if not SARVAM_API_KEY or SARVAM_API_KEY == 'your_sarvam_api_key_here':
        logger.error("❌ Sarvam API key not configured")
        return None
    
    if not text or not text.strip():
        logger.warning("⚠️ Empty text provided to Sarvam TTS")
        return None
    
    try:
        from sarvamai import AsyncSarvamAI, AudioOutput, EventResponse
        
        # Get speaker and language code
        speaker = SARVAM_SPEAKERS.get(language_code, 'anushka')
        target_language = LANGUAGE_CODE_MAP.get(language_code, 'hi-IN')
        
        logger.info(f"🎤 Sarvam TTS: '{text[:50]}...' | Lang: {target_language} | Speaker: {speaker}")
        
        # Initialize Sarvam client
        client = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        
        # Connect to streaming TTS
        async with client.text_to_speech_streaming.connect(
            model="bulbul:v2",
            send_completion_event=True
        ) as ws:
            # Configure the connection
            await ws.configure(
                target_language_code=target_language,
                speaker=speaker,
                pitch=1.0,
                pace=1.1,  # Slightly faster for emergency context
                min_buffer_size=50,
                max_chunk_length=200,
                output_audio_codec="mp3",
                output_audio_bitrate="128k"
            )
            logger.debug("📤 Sent configuration")
            
            # Send text for conversion
            await ws.convert(text)
            logger.debug(f"📤 Sent text: {text[:50]}...")
            
            # Flush to ensure all text is processed
            await ws.flush()
            logger.debug("📤 Sent flush")
            
            # Collect audio chunks
            audio_chunks = []
            chunk_count = 0
            
            async for message in ws:
                if isinstance(message, AudioOutput):
                    chunk_count += 1
                    # Decode base64 audio data
                    audio_chunk = base64.b64decode(message.data.audio)
                    audio_chunks.append(audio_chunk)
                    
                    # Log progress
                    if chunk_count % 10 == 0:
                        logger.debug(f"📥 Received {chunk_count} audio chunks")
                
                elif isinstance(message, EventResponse):
                    # Handle completion event
                    if message.data.event_type == "final":
                        logger.debug("✅ Received final event from Sarvam")
                        break
            
            if not audio_chunks:
                logger.error("❌ No audio generated from Sarvam")
                return None
            
            # Combine all audio chunks
            audio_data = b"".join(audio_chunks)
            logger.info(f"✅ Sarvam TTS: Generated {len(audio_data)} bytes from {chunk_count} chunks")
            
            return audio_data
    
    except ImportError:
        logger.error("❌ Sarvam SDK not installed. Install with: pip install sarvamai")
        return None
    except Exception as e:
        logger.error(f"❌ Sarvam TTS error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


async def text_to_speech_hybrid(text: str, language_code: str = 'en') -> Optional[bytes]:
    """
    Hybrid TTS: Use Sarvam for all supported languages (Indian languages + English)
    Falls back to ElevenLabs only for unsupported languages
    
    Args:
        text: Text to convert to speech
        language_code: Language code
    
    Returns:
        Audio bytes (MP3 format) or None if failed
    """
    # Use Sarvam for Indian languages AND English (Sarvam supports English with Indian accent)
    if is_indian_language(language_code):
        logger.info(f"🇮🇳 Using Sarvam AI for {language_code}")
        return await text_to_speech_sarvam(text, language_code)
    
    # Use ElevenLabs only for other languages not supported by Sarvam
    else:
        logger.info(f"🌍 Using ElevenLabs for {language_code}")
        # Import here to avoid circular dependency
        from server import text_to_speech_elevenlabs
        return await text_to_speech_elevenlabs(text, language_code)
