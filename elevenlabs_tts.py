import os
import logging
import subprocess
import shutil
import asyncio
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE = os.getenv("ELEVENLABS_VOICE", "uYXf8XasLslADfZ2MB4u")

def get_elevenlabs_client():
    try:
        from elevenlabs.client import ElevenLabs
        if not ELEVENLABS_API_KEY:
            logger.error("❌ ElevenLabs API key not configured")
            return None
        return ElevenLabs(api_key=ELEVENLABS_API_KEY)
    except ImportError:
        logger.error("❌ ElevenLabs library not installed")
        return None

def get_voice_id(language_code: str) -> str:
    voice_map = {
        'hi': 'pNInz6obpgDQGcFmaJgB',  # Adam - works well with Hindi
        'bn': 'pNInz6obpgDQGcFmaJgB',  # Bengali
        'ta': 'pNInz6obpgDQGcFmaJgB',  # Tamil
        'te': 'pNInz6obpgDQGcFmaJgB',  # Telugu
        'es': 'EXAVITQu4vr4xnSDxMaL',  # Bella - Spanish
        'fr': 'EXAVITQu4vr4xnSDxMaL',  # French
        'de': 'pNInz6obpgDQGcFmaJgB',  # German
        'zh': 'pNInz6obpgDQGcFmaJgB',  # Chinese
        'ja': 'pNInz6obpgDQGcFmaJgB',  # Japanese
        'ar': 'pNInz6obpgDQGcFmaJgB',  # Arabic
    }
    return voice_map.get(language_code, ELEVENLABS_VOICE)

def stream_audio_ffplay(audio_stream):
    """Stream audio using ffplay if mpv is not available"""
    if not shutil.which("ffplay"):
        raise FileNotFoundError("ffplay not found")
        
    args = ["ffplay", "-autoexit", "-nodisp", "-"]
    proc = subprocess.Popen(
        args=args,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    
    for chunk in audio_stream:
        if chunk:
            try:
                proc.stdin.write(chunk)
                proc.stdin.flush()
            except BrokenPipeError:
                break
                
    if proc.stdin:
        proc.stdin.close()
    proc.wait()

def stream_text_to_speech_elevenlabs(text: str, language_code: str = 'en') -> bool:
    """Stream text to speech using ElevenLabs API and play immediately"""
    if not text or not text.strip():
        return False
    
    try:
        from elevenlabs import VoiceSettings, stream
        
        client = get_elevenlabs_client()
        if not client:
            return False
            
        voice_id = get_voice_id(language_code)
        logger.info(f"🎤 Streaming speech for: '{text[:50]}...'")
        
        audio_stream = client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id="eleven_multilingual_v2",
            voice_settings=VoiceSettings(
                stability=0.5,
                similarity_boost=0.75,
                style=0.0,
                use_speaker_boost=True
            )
        )
        
        # Try using the official stream function (uses mpv)
        try:
            stream(audio_stream)
            return True
        except ValueError as e:
            # If mpv is not found, try ffplay
            if "mpv not found" in str(e):
                logger.info("⚠️ mpv not found, falling back to ffplay...")
                # We need to recreate the generator because stream() might have consumed some of it?
                # Actually, stream() checks for mpv before consuming.
                # But to be safe, let's just try to stream the existing generator.
                # If stream() consumed it, we might lose data.
                # However, the error usually happens at the start.
                
                # Re-create stream to be safe as generators can be exhausted
                audio_stream = client.text_to_speech.convert(
                    voice_id=voice_id,
                    text=text,
                    model_id="eleven_multilingual_v2",
                    voice_settings=VoiceSettings(
                        stability=0.5,
                        similarity_boost=0.75,
                        style=0.0,
                        use_speaker_boost=True
                    )
                )
                stream_audio_ffplay(audio_stream)
                return True
            else:
                raise e
        
    except Exception as e:
        logger.error(f"❌ ElevenLabs Streaming error: {e}")
        return False

async def text_to_speech_elevenlabs(text: str, language_code: str = 'en') -> Optional[bytes]:
    """Convert text to speech using ElevenLabs API with language support"""
    if not ELEVENLABS_API_KEY:
        logger.error("❌ ElevenLabs API key not configured - cannot generate speech")
        return None
    
    if not text or not text.strip():
        logger.warning("⚠️ Empty text provided to TTS")
        return None
    
    def _generate_audio_blocking():
        try:
            from elevenlabs import VoiceSettings
            
            client = get_elevenlabs_client()
            if not client:
                return None
            
            voice_id = get_voice_id(language_code)
            
            logger.info(f"🎤 Generating speech for: '{text[:50]}...' | Language: {language_code} | Voice: {voice_id}")
            
            # Generate audio
            audio_generator = client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id="eleven_multilingual_v2",  # Multilingual model
                voice_settings=VoiceSettings(
                    stability=0.5,
                    similarity_boost=0.75,
                    style=0.0,
                    use_speaker_boost=True
                )
            )
            
            # Collect audio chunks
            audio_chunks = []
            chunk_count = 0
            for chunk in audio_generator:
                if chunk:
                    audio_chunks.append(chunk)
                    chunk_count += 1
            
            if not audio_chunks:
                logger.error("❌ No audio generated from ElevenLabs")
                return None
            
            audio_data = b"".join(audio_chunks)
            logger.info(f"✅ Generated {len(audio_data)} bytes of audio from {chunk_count} chunks")
            
            return audio_data
            
        except ImportError:
            logger.error("❌ ElevenLabs library not installed. Install with: pip install elevenlabs")
            return None
        except Exception as e:
            logger.error(f"❌ ElevenLabs TTS error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    # Run the blocking generation in a thread
    return await asyncio.to_thread(_generate_audio_blocking)
