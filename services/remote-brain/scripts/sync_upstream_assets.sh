#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
UPSTREAM_ADDON="$ROOT_DIR/external/blender-mcp/addon.py"
TARGET_DIR="$ROOT_DIR/services/remote-brain/upstream-assets"
TARGET_ADDON="$TARGET_DIR/addon.py"

if [[ ! -f "$UPSTREAM_ADDON" ]]; then
  echo "Missing upstream addon at: $UPSTREAM_ADDON"
  exit 1
fi

mkdir -p "$TARGET_DIR"
cp "$UPSTREAM_ADDON" "$TARGET_ADDON"

echo "Synced addon.py -> $TARGET_ADDON"
