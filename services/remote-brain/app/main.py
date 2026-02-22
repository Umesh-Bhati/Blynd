from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import Settings
from .blender_remote import BlenderRemoteError, execute_code as remote_execute_code
from .providers import ProviderError, generate_python_code
from .upstream_blender_mcp import UPSTREAM_DIR, build_system_prompt


app = FastAPI(title="Blender AI Remote Brain", version="0.1.0")
settings = Settings.from_env()

# Local/dev desktop clients and browser checks can trigger CORS preflight.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    model: str | None = None
    projectId: str | None = None


class GenerateResponse(BaseModel):
    python_code: str
    provider: str
    model: str


class GenerateAndApplyRequest(BaseModel):
    prompt: str = Field(min_length=1)
    model: str | None = None
    projectId: str | None = None
    blender_host: str | None = None
    blender_port: int = 9876
    include_code: bool = False


class GenerateAndApplyResponse(BaseModel):
    applied: bool
    provider: str
    model: str
    blender_host: str
    blender_port: int
    message: str
    blender_result: dict | list | str | int | float | bool | None = None
    python_code: str | None = None


class ProviderCapability(BaseModel):
    configured: bool


class CapabilitiesResponse(BaseModel):
    providers: dict[str, ProviderCapability]
    default_provider: str


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "upstream_blender_mcp_present": UPSTREAM_DIR.exists(),
    }


@app.get("/")
def root() -> dict[str, str]:
    return {
        "status": "ok",
        "message": "Blender AI Remote Brain is running. Use /health or POST /generate.",
    }


@app.get("/capabilities", response_model=CapabilitiesResponse)
def capabilities() -> CapabilitiesResponse:
    return CapabilitiesResponse(
        providers={
            "openai": ProviderCapability(configured=bool((settings.openai_api_key or "").strip())),
            "anthropic": ProviderCapability(configured=bool((settings.anthropic_api_key or "").strip())),
            "groq": ProviderCapability(configured=bool((settings.groq_api_key or "").strip())),
        },
        default_provider=settings.default_provider,
    )


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


@app.post("/generate-and-apply", response_model=GenerateAndApplyResponse)
def generate_and_apply(
    req: GenerateAndApplyRequest,
    request: Request,
    authorization: str | None = Header(default=None),
) -> GenerateAndApplyResponse:
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

    inferred_host = request.client.host if request.client else None
    blender_host = (req.blender_host or inferred_host or "").strip()
    if not blender_host:
        raise HTTPException(
            status_code=400,
            detail="Unable to determine Blender host. Provide blender_host explicitly.",
        )

    try:
        response = remote_execute_code(host=blender_host, port=req.blender_port, code=code)
    except BlenderRemoteError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Remote Blender apply failed: {exc}") from exc

    message = response.get("message") if isinstance(response, dict) else None
    result = response.get("result") if isinstance(response, dict) else None

    return GenerateAndApplyResponse(
        applied=True,
        provider=provider,
        model=selected_model,
        blender_host=blender_host,
        blender_port=req.blender_port,
        message=str(message or "Applied in Blender via remote backend."),
        blender_result=result,
        python_code=code if req.include_code else None,
    )
