# Blender-AI Workspace (Phase 1-4 Scaffold)

Tauri 2.0 + React/Vite desktop shell with:
- Project sidebar + chat workspace UI
- Supabase Auth gate (magic-link sign-in)
- Tauri handshake command: `detect_blender_installation` (Windows scan paths)
- Remote AI call function: `generateBlenderCode` (cloud endpoint -> Blender Python)
- Upstream `blender-mcp` repo integrated under `external/blender-mcp`
- One-click Windows addon install command: `install_blender_addon`
- Local Blender execution command: `execute_blender_code`

## Run

```bash
pnpm install
cp .env.example .env
pnpm tauri dev
```

The app requires:
- `VITE_ENABLE_AUTH` (`false` for local testing)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_REMOTE_BRAIN_URL`
- `VITE_REMOTE_BRAIN_TOKEN` (optional bearer token for your cloud gateway)

Set `VITE_ENABLE_AUTH=false` to skip login while testing locally.

## Remote Brain Service

The cloud generation API is in `services/remote-brain` and reuses upstream `blender-mcp` strategy/addon assets.

```bash
cd services/remote-brain
cp .env.example .env
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Provider support in remote brain: OpenAI, Anthropic, Groq (`DEFAULT_PROVIDER=groq` for immediate Groq usage).

## Mac + Windows Setup

If Blender runs on Windows and remote brain runs on Mac (same Wi-Fi):

1. On Mac, run remote brain:
```bash
cd services/remote-brain
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

2. On Windows app `.env`, point to Mac LAN IP:
```env
VITE_ENABLE_AUTH=false
VITE_REMOTE_BRAIN_URL=http://<MAC_LAN_IP>:8080/generate
```

3. In Windows desktop app:
- `Detect Blender Install`
- `Install Addon`
- In Blender, enable addon `Interface: Blender MCP` and click `Connect to MCP server`
- Send prompt with `Auto-apply generated code` enabled

## Windows EXE Build

Build on Windows machine:
```bash
pnpm install
pnpm tauri build
```

Installer/output will be generated under `src-tauri/target/release/bundle/`.
