from __future__ import annotations

from anthropic import Anthropic
from openai import OpenAI

from .config import Settings


class ProviderError(RuntimeError):
    pass


def choose_provider(model: str, default_provider: str = "openai") -> str:
    normalized = model.lower()
    if normalized.startswith("groq/"):
        return "groq"
    if normalized.startswith("openai/"):
        return "openai"
    if normalized.startswith("anthropic/"):
        return "anthropic"
    if normalized.startswith("claude"):
        return "anthropic"
    if normalized.startswith("llama") or normalized.startswith("mixtral"):
        return "groq"
    return "openai"


def _extract_python_block(text: str) -> str:
    if "```" not in text:
        return text.strip()

    marker = "```python"
    lowered = text.lower()
    start = lowered.find(marker)
    if start == -1:
        start = lowered.find("```")
        start += 3
    else:
        start += len(marker)

    end = lowered.find("```", start)
    if end == -1:
        return text.strip()

    return text[start:end].strip()


def _resolve_provider_and_model(model: str | None, settings: Settings) -> tuple[str, str]:
    requested = (model or "").strip()
    default_provider = settings.default_provider.strip().lower()

    if requested:
        provider = choose_provider(requested, default_provider=default_provider)
        if "/" in requested and provider in {"openai", "anthropic", "groq"}:
            _, provider_model = requested.split("/", 1)
            provider_model = provider_model.strip()
        else:
            provider_model = requested
        if provider_model:
            return provider, provider_model

    if default_provider == "anthropic":
        return "anthropic", settings.default_anthropic_model
    if default_provider == "groq":
        return "groq", settings.default_groq_model
    return "openai", settings.default_openai_model


def generate_python_code(prompt: str, model: str | None, system_prompt: str, settings: Settings) -> tuple[str, str, str]:
    provider, selected_model = _resolve_provider_and_model(model, settings)

    if provider == "openai":
        if not settings.openai_api_key:
            raise ProviderError("OPENAI_API_KEY is not configured.")

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=selected_model,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
        text = getattr(response, "output_text", "") or ""
        if not text:
            raise ProviderError("OpenAI response was empty.")
        return _extract_python_block(text), provider, f"openai/{selected_model}"

    if provider == "groq":
        if not settings.groq_api_key:
            raise ProviderError("GROQ_API_KEY is not configured.")

        client = OpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url)
        response = client.chat.completions.create(
            model=selected_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        text = (response.choices[0].message.content or "").strip()
        if not text:
            raise ProviderError("Groq response was empty.")
        return _extract_python_block(text), provider, f"groq/{selected_model}"

    if not settings.anthropic_api_key:
        raise ProviderError("ANTHROPIC_API_KEY is not configured.")

    client = Anthropic(api_key=settings.anthropic_api_key)
    message = client.messages.create(
        model=selected_model or settings.default_anthropic_model,
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}],
    )

    content = []
    for block in message.content:
        if getattr(block, "type", None) == "text":
            content.append(block.text)

    text = "\n".join(content).strip()
    if not text:
        raise ProviderError("Anthropic response was empty.")

    return _extract_python_block(text), provider, f"anthropic/{selected_model}"
