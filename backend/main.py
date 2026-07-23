"""
Entry point — run with:  python -m backend.main   or   uvicorn backend.main:app
"""
from __future__ import annotations

import logging

import uvicorn

from backend import config
from backend.app import create_app

app = create_app()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(), logging.FileHandler('server.log')],
)
logger = logging.getLogger(__name__)


def main():
    logger.info("=" * 70)
    logger.info("RudraOne Voice Transcription Server")
    logger.info("=" * 70)
    logger.info("Environment: %s", config.ENVIRONMENT)
    logger.info("Port: %s", config.PORT)
    logger.info("LLM: base_url=%s  model=%s", config.LLM_BASE_URL, config.LLM_MODEL)
    logger.info("Deepgram: %s", "Configured" if config.DEEPGRAM_API_KEY else "Not configured")
    logger.info("Twilio: %s", "Configured" if config.TWILIO_ACCOUNT_SID else "Not configured")
    logger.info("Tunnel: Cloudflare (replaces ngrok)")
    logger.info("=" * 70)

    server_config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=config.PORT,
        workers=1,
        log_level="info" if config.ENVIRONMENT == "development" else "warning",
        access_log=config.ENVIRONMENT == "development",
        ws_ping_interval=20,
        ws_ping_timeout=20,
        timeout_keep_alive=30,
    )
    uvicorn.Server(server_config).run()


if __name__ == "__main__":
    main()
