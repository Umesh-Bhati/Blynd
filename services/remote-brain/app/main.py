from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import Settings
from .providers import ProviderError, generate_python_code
from .upstream_blender_mcp import UPSTREAM_DIR, build_system_prompt


app = FastAPI(title="Blender AI Remote Brain", version="0.1.0")
settings = Settings.from_env()


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    model: str | None = None
    projectId: str | None = None


class GenerateResponse(BaseModel):
    python_code: str
    provider: str
    model: str


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "upstream_blender_mcp_present": UPSTREAM_DIR.exists(),
    }


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, authorization: str | None = Header(default=None)) -> GenerateResponse:
    if settings.remote_brain_token:
        expected = f"Bearer {settings.remote_brain_token}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="Invalid bearer token")

    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    system_prompt = build_system_prompt()

    try:
        code, provider, selected_model = generate_python_code(
            prompt=prompt,
            model=req.model,
            system_prompt=system_prompt,
            settings=settings,
        )
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}") from exc

    return GenerateResponse(python_code=code, provider=provider, model=selected_model)
