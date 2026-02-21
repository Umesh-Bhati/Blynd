# Remote Brain (blender-mcp integrated)

This service reuses the upstream `external/blender-mcp` repository and provides a cloud API for:
- Prompt -> Blender Python code generation (`POST /generate`)
- Health checks (`GET /health`)

## Why this exists

`blender-mcp` is used as the upstream protocol and strategy source so we don't build MCP plumbing from scratch.
This service adds:
- SaaS auth/token gate
- Provider routing (OpenAI + Anthropic + Groq)
- A stable HTTP endpoint used by the Tauri app

## Run

```bash
cd services/remote-brain
cp .env.example .env
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## Request example

```bash
curl -X POST http://localhost:8080/generate \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_TOKEN' \
  -d '{"prompt":"Create a red metallic sphere above a cube","model":"groq/llama-3.3-70b-versatile"}'
```
