"""
Translation service — uses MyMemory API (free, no key required).
"""
from __future__ import annotations

import logging

import requests

logger = logging.getLogger(__name__)


def detect_language_from_text(text: str) -> str:
    """Detect language from text using character-based heuristics."""
    if not text or not text.strip():
        return 'en'

    if any('\u0900' <= c <= '\u097F' for c in text):
        return 'hi'
    elif any('\u0980' <= c <= '\u09FF' for c in text):
        return 'bn'
    elif any('\u0B80' <= c <= '\u0BFF' for c in text):
        return 'ta'
    elif any('\u0C00' <= c <= '\u0C7F' for c in text):
        return 'te'
    elif any('\u0C80' <= c <= '\u0CFF' for c in text):
        return 'kn'
    elif any('\u0D00' <= c <= '\u0D7F' for c in text):
        return 'ml'
    elif any('\u0A80' <= c <= '\u0AFF' for c in text):
        return 'gu'
    elif any('\u0A00' <= c <= '\u0A7F' for c in text):
        return 'pa'
    elif any('\u0600' <= c <= '\u06FF' for c in text):
        return 'ar'
    elif any('\u4E00' <= c <= '\u9FFF' for c in text):
        return 'zh'
    elif any('\u3040' <= c <= '\u309F' for c in text) or any('\u30A0' <= c <= '\u30FF' for c in text):
        return 'ja'
    elif any('\uAC00' <= c <= '\uD7AF' for c in text):
        return 'ko'
    elif any('\u0400' <= c <= '\u04FF' for c in text):
        return 'ru'

    return 'en'


async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text using MyMemory API (free, no API key required)."""
    if not text or not text.strip():
        return text
    if source_lang == target_lang:
        return text

    try:
        lang_pair = f"{source_lang}|{target_lang}"
        encoded_text = requests.utils.quote(text)
        url = f"https://api.mymemory.translated.net/get?q={encoded_text}&langpair={lang_pair}"

        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("responseStatus") == 200:
                translated = data.get("responseData", {}).get("translatedText", text)
                logger.info("Translated (%s->%s): %s... -> %s...", source_lang, target_lang, text[:30], translated[:30])
                return translated

        logger.warning("Translation failed, using original text")
        return text
    except Exception as e:
        logger.error("Translation error: %s", e)
        return text
