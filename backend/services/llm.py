"""
OpenAI-compatible LLM client factory.

Every component (agent, analytics, training, SMS formatting) calls
`get_chat_completion()` here instead of instantiating its own client.
This lets you swap providers (OpenAI, Azure, Ollama, vLLM, Groq, Together,
OpenRouter, DeepSeek, LM Studio, …) by changing just the env vars:

    LLM_API_KEY=sk-...
    LLM_BASE_URL=https://api.openai.com/v1
    LLM_MODEL=gpt-4o

For a local Ollama setup:
    LLM_API_KEY=ollama
    LLM_BASE_URL=http://localhost:11434/v1
    LLM_MODEL=llama3.1
"""
from __future__ import annotations

import logging
from typing import Optional

from openai import OpenAI
from langchain_openai import ChatOpenAI

from backend import config

logger = logging.getLogger(__name__)

_client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    """Return a singleton OpenAI-compatible client."""
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=config.LLM_API_KEY or "dummy-key",
            base_url=config.LLM_BASE_URL,
            timeout=config.LLM_TIMEOUT,
        )
        logger.info(
            "LLM client initialised  |  base_url=%s  model=%s",
            config.LLM_BASE_URL,
            config.LLM_MODEL,
        )
    return _client


from opentelemetry import trace

tracer = trace.get_tracer("rudraone.llm")


def get_chat_completion(
    messages: list[dict],
    *,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    tools: Optional[list] = None,
    tool_choice: Optional[str] = None,
) -> object:
    """
    Thin wrapper around `client.chat.completions.create`.

    Returns the ChatCompletion response object (same shape for every
    OpenAI-compatible provider).
    """
    target_model = model or config.LLM_MODEL
    with tracer.start_as_current_span("llm.chat_completion") as span:
        span.set_attribute("llm.model", target_model)
        span.set_attribute("llm.prompt_message_count", len(messages))
        client = get_openai_client()
        try:
            response = client.chat.completions.create(
                model=target_model,
                messages=messages,
                temperature=temperature if temperature is not None else config.LLM_TEMPERATURE,
                max_tokens=max_tokens or config.LLM_MAX_TOKENS,
                tools=tools,
                tool_choice=tool_choice,
            )
            # Add token usage metrics if returned by the provider
            if hasattr(response, "usage") and response.usage:
                span.set_attribute("llm.usage.prompt_tokens", getattr(response.usage, "prompt_tokens", 0))
                span.set_attribute("llm.usage.completion_tokens", getattr(response.usage, "completion_tokens", 0))
                span.set_attribute("llm.usage.total_tokens", getattr(response.usage, "total_tokens", 0))
            return response
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.StatusCode.ERROR, str(e))
            raise


def get_langchain_llm(
    *,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
) -> ChatOpenAI:
    """
    Return a LangChain ChatOpenAI instance configured for the same
    OpenAI-compatible endpoint.  Used by the analytics module.
    """
    return ChatOpenAI(
        model=model or config.LLM_MODEL,
        temperature=temperature if temperature is not None else 0,
        api_key=config.LLM_API_KEY or "dummy-key",
        base_url=config.LLM_BASE_URL,
        timeout=config.LLM_TIMEOUT,
    )
