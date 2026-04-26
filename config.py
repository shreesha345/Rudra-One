import os
import json
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

class ConfigManager:
    _instance = None
    _config = {}
    _config_file = "user_config.json"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
            cls._instance._load_config()
        return cls._instance

    def _load_config(self):
        # 1. Load from environment variables (defaults)
        self._config = {
            "DEEPGRAM_API_KEY": os.getenv("DEEPGRAM_API_KEY", ""),
            "TWILIO_ACCOUNT_SID": os.getenv("TWILIO_ACCOUNT_SID", ""),
            "TWILIO_AUTH_TOKEN": os.getenv("TWILIO_AUTH_TOKEN", ""),
            "TWILIO_PHONE_NUMBER": os.getenv("TWILIO_PHONE_NUMBER", ""),
            "GOOGLE_API_KEY": os.getenv("GOOGLE_API_KEY", ""),
            "ELEVENLABS_API_KEY": os.getenv("ELEVENLABS_API_KEY", ""),
            "ELEVENLABS_VOICE": os.getenv("ELEVENLABS_VOICE", "uYXf8XasLslADfZ2MB4u"),
            "SARVAM_API_KEY": os.getenv("SARVAM_API_KEY", ""),
            "GROQ_API_KEY": os.getenv("GROQ_API_KEY", ""),
            "ASSEMBLYAI_API_KEY": os.getenv("ASSEMBLYAI_API_KEY", ""),
            "NGROK_URL": os.getenv("NGROK_URL", ""),
            "PORT": os.getenv("PORT", "8000"),
            "ENVIRONMENT": os.getenv("ENVIRONMENT", "development"),
            "ALLOWED_ORIGINS": os.getenv("ALLOWED_ORIGINS", "*"),
            "ALLOWED_HOSTS": os.getenv("ALLOWED_HOSTS", ""),
            "RECORDINGS_DIR": os.getenv("RECORDINGS_DIR", "recordings"),
            "TRANSCRIPTS_DIR": os.getenv("TRANSCRIPTS_DIR", "transcripts"),
            "AUDIO_RATE": os.getenv("AUDIO_RATE", "16000"),
            "VITE_MAPBOX_TOKEN": os.getenv("VITE_MAPBOX_TOKEN", "") # Frontend setting we might want to persist
        }

        # 2. Override with user_config.json if exists
        if os.path.exists(self._config_file):
            try:
                with open(self._config_file, 'r') as f:
                    user_config = json.load(f)
                    self._config.update(user_config)
                logger.info(f"✅ Loaded user configuration from {self._config_file}")
            except Exception as e:
                logger.error(f"❌ Failed to load user configuration: {e}")

    def get(self, key, default=None):
        return self._config.get(key, default)

    def set(self, key, value):
        self._config[key] = value
        self._save_config()

    def update(self, new_config: dict):
        self._config.update(new_config)
        self._save_config()

    def _save_config(self):
        try:
            # Only save keys that are not system/environment specific if needed, 
            # but for now saving everything that was updated is fine.
            # We might want to exclude PORT or ENVIRONMENT if those should be hardcoded by deployment.
            # But the user wants to control settings.
            
            with open(self._config_file, 'w') as f:
                json.dump(self._config, f, indent=4)
            logger.info(f"💾 Saved user configuration to {self._config_file}")
        except Exception as e:
            logger.error(f"❌ Failed to save user configuration: {e}")

# Global instance
config = ConfigManager()
