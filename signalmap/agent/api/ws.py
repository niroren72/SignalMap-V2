"""
SignalMap — WebSocket live stream endpoint.
"""

from __future__ import annotations

import asyncio
import json
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..schema import ConnectionEvent

router = APIRouter()

# Active WebSocket connections
_clients: Set[WebSocket] = set()


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    """Stream live ConnectionEvents to connected clients."""
    await ws.accept()
    _clients.add(ws)
    try:
        while True:
            # Listen for control messages (pause/resume/ping)
            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                # Send keepalive
                try:
                    await ws.send_text(json.dumps({"type": "heartbeat"}))
                except Exception:
                    break
            except (WebSocketDisconnect, RuntimeError):
                break
    finally:
        _clients.discard(ws)


async def broadcast_event(event: ConnectionEvent) -> None:
    """Send an event to all connected WebSocket clients."""
    if not _clients:
        return
    data = json.dumps({
        "type": "event",
        "data": event.model_dump(mode="json"),
    }, default=str)
    disconnected = set()
    for client_ws in list(_clients):
        try:
            await client_ws.send_text(data)
        except Exception:
            disconnected.add(client_ws)
    if disconnected:
        _clients.difference_update(disconnected)
