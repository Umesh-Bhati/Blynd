from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    remote_brain_token: str | None
    openai_api_key: str | None
    anthropic_api_key: str | None
    groq_api_key: str | None
    groq_base_url: str
    default_provider: str
    default_openai_model: str
    default_anthropic_model: str
    default_groq_model: str


    @staticmethod
    def from_env() -> "Settings":
        env_file = Path(__file__).resolve().parents[1] / ".env"
        load_dotenv(env_file, override=False)

        return Settings(
            remote_brain_token=os.getenv("REMOTE_BRAIN_TOKEN"),
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
            groq_api_key=os.getenv("GROQ_API_KEY"),
            groq_base_url=os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            default_provider=os.getenv("DEFAULT_PROVIDER", "openai"),
            default_openai_model=os.getenv("DEFAULT_OPENAI_MODEL", "gpt-4o-mini"),
            default_anthropic_model=os.getenv("DEFAULT_ANTHROPIC_MODEL", "claude-3-5-sonnet-latest"),
            default_groq_model=os.getenv("DEFAULT_GROQ_MODEL", "llama-3.3-70b-versatile"),
        )
