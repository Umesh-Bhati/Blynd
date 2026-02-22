from __future__ import annotations

import json
import socket
from typing import Any


class BlenderRemoteError(RuntimeError):
    pass


def _recv_json(sock: socket.socket, timeout_seconds: float = 45.0) -> dict[str, Any]:
    sock.settimeout(timeout_seconds)
    chunks: list[bytes] = []

    while True:
        try:
            chunk = sock.recv(8192)
        except socket.timeout as exc:
            if chunks:
                break
            raise BlenderRemoteError("Timeout waiting for Blender addon response.") from exc

        if not chunk:
            break

        chunks.append(chunk)
        data = b"".join(chunks)
        try:
            return json.loads(data.decode("utf-8"))
        except json.JSONDecodeError:
            continue

    if not chunks:
        raise BlenderRemoteError("No response received from Blender addon.")

    try:
        return json.loads(b"".join(chunks).decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise BlenderRemoteError("Blender addon response was not valid JSON.") from exc


def send_blender_command(
    host: str,
    port: int,
    command_type: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "type": command_type,
        "params": params or {},
    }

    try:
        with socket.create_connection((host, port), timeout=8.0) as sock:
            sock.sendall(json.dumps(payload).encode("utf-8"))
            response = _recv_json(sock)
    except OSError as exc:
        raise BlenderRemoteError(f"Could not connect to Blender addon at {host}:{port}: {exc}") from exc

    if response.get("status") == "error":
        message = response.get("message") or "Unknown Blender addon error"
        raise BlenderRemoteError(str(message))

    return response


def get_scene_info(host: str, port: int = 9876) -> dict[str, Any]:
    return send_blender_command(host=host, port=port, command_type="get_scene_info")


def execute_code(host: str, port: int, code: str) -> dict[str, Any]:
    if not code.strip():
        raise BlenderRemoteError("Generated code is empty.")

    return send_blender_command(
        host=host,
        port=port,
        command_type="execute_code",
        params={"code": code},
    )
