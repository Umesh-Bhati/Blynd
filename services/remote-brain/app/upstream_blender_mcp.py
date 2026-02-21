from __future__ import annotations

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[3]
UPSTREAM_DIR = ROOT / "external" / "blender-mcp"
UPSTREAM_SERVER = UPSTREAM_DIR / "src" / "blender_mcp" / "server.py"
UPSTREAM_ADDON = UPSTREAM_DIR / "addon.py"


def load_asset_creation_strategy() -> str:
    if not UPSTREAM_SERVER.exists():
        return ""

    source = UPSTREAM_SERVER.read_text(encoding="utf-8", errors="ignore")

    match = re.search(
        r"def\s+asset_creation_strategy\(\)\s*->\s*str:\s*.*?return\s*\"\"\"(.*?)\"\"\"",
        source,
        re.DOTALL,
    )
    if not match:
        return ""

    return match.group(1).strip()


def load_addon_source() -> str:
    if not UPSTREAM_ADDON.exists():
        return ""

    return UPSTREAM_ADDON.read_text(encoding="utf-8", errors="ignore")


def build_system_prompt() -> str:
    strategy = load_asset_creation_strategy()

    base = [
        "You are an expert Blender Python engineer for production 3D workflows.",
        "Return valid Blender Python only. Do not include prose explanations.",
        "Prefer safe, deterministic operations and preserve existing scene data when possible.",
        "If assumptions are required, encode them in comments at the top of the script.",
        "Output should be executable in Blender Text Editor directly.",
    ]

    if strategy:
        base.append("Reference strategy from upstream blender-mcp:\n" + strategy)

    return "\n\n".join(base)
