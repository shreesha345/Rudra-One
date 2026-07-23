"""
Training service — simulated 911 dispatcher training.

Refactored to use the OpenAI-compatible LLM factory.  No more Google Gemini
dependency; any OpenAI-compatible endpoint works.
"""
from __future__ import annotations

import json
import logging
import random
import os

from backend import config
from backend.services.llm import get_chat_completion

logger = logging.getLogger(__name__)


class UnifiedResponse:
    def __init__(self, text):
        self.text = text


class UnifiedChatSession:
    """A simple chat session that manages message history and calls the LLM."""

    def __init__(self, model: str | None = None):
        self.model = model or config.TRAINING_LLM_MODEL
        self.history: list[dict] = []

    def send_message(self, message: str) -> UnifiedResponse:
        self.history.append({"role": "user", "content": message})
        response = get_chat_completion(
            self.history,
            model=self.model,
            temperature=0.8,
            max_tokens=300,
        )
        text = response.choices[0].message.content
        self.history.append({"role": "assistant", "content": text})
        return UnifiedResponse(text)


class UnifiedTrainingClient:
    """Mimics the old `client.chats.create()` interface."""

    def __init__(self):
        self.chats = self  # self-referential so `client.chats.create()` works

    def create(self, model: str | None = None) -> UnifiedChatSession:
        return UnifiedChatSession(model=model)


def load_scenarios(file_path: str = "911_calls.json") -> list:
    """Load 911 dataset from JSON file."""
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def select_random_scenario(scenarios: list) -> dict:
    return random.choice(scenarios)


def get_training_client() -> UnifiedTrainingClient | None:
    """Return a training client if LLM is configured, else None."""
    if not config.LLM_API_KEY:
        logger.warning("LLM_API_KEY not set, training system disabled")
        return None
    return UnifiedTrainingClient()
