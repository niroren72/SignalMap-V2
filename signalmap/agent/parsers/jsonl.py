"""
SignalMap — JSON Lines (.jsonl / .ndjson) parser.

Handles newline-delimited JSON files. Flexible field mapping so it works
with exported SignalMap events, Zeek conn.log (JSON mode), and generic exports.
"""

from __future__ import annotations

import json
from typing import AsyncIterator

from . import LogParser, register
from ..schema import (
    ConnectionEvent, RemoteEndpoint, LocalEndpoint,
    Protocol, Direction, State, Metrics, HttpMeta,
)

# Fields we try in order when looking for the remote IP
_IP_CANDIDATES = ("remote_ip", "src_ip", "ip", "client_ip", "source_ip", "dst_ip", "remote.ip")
_PORT_CANDIDATES = ("remote_port", "src_port", "port", "dport", "dest_port")
_PROC_CANDIDATES = ("process_name", "process", "app", "application")
_METHOD_CANDIDATES = ("method", "http_method", "verb")
_PATH_CANDIDATES = ("path", "url", "url_path", "uri", "request_path")
_STATUS_CANDIDATES = ("status", "status_code", "http_status", "resp_status")


@register
class JsonlParser(LogParser):

    @classmethod
    def can_parse(cls, filename: str, first_bytes: bytes) -> bool:
        name = filename.lower()
        if any(name.endswith(ext) for ext in ('.jsonl', '.ndjson', '.json')):
            return True
        # Sniff: first non-empty line is a JSON object
        if first_bytes:
            first_line = first_bytes.decode('utf-8', errors='ignore').split('\n')[0].strip()
            return first_line.startswith('{') and first_line.endswith('}')
        return False

    async def parse(self, stream: AsyncIterator[bytes]) -> AsyncIterator[ConnectionEvent]:
        buffer = b""
        async for chunk in stream:
            buffer += chunk
            while b"\n" in buffer:
                line_bytes, buffer = buffer.split(b"\n", 1)
                line = line_bytes.decode("utf-8", errors="ignore").strip()
                if not line:
                    continue
                event = _parse_line(line)
                if event:
                    yield event
        if buffer.strip():
            event = _parse_line(buffer.decode("utf-8", errors="ignore").strip())
            if event:
                yield event


def _get(d: dict, *candidates):
    """Try a list of candidate keys and return the first match."""
    for key in candidates:
        if "." in key:
            # Dotted path
            parts = key.split(".", 1)
            sub = d.get(parts[0])
            if isinstance(sub, dict):
                val = sub.get(parts[1])
                if val is not None:
                    return val
        val = d.get(key)
        if val is not None:
            return val
    return None


def _parse_line(line: str) -> ConnectionEvent | None:
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    # If it already looks like a SignalMap ConnectionEvent, try direct validation
    if "source_collector" in data and "remote" in data:
        try:
            return ConnectionEvent.model_validate(data)
        except Exception:
            pass

    # Generic mapping
    ip = _get(data, *_IP_CANDIDATES)
    if not ip:
        return None

    port_raw = _get(data, *_PORT_CANDIDATES)
    port = int(port_raw) if port_raw else None

    process = _get(data, *_PROC_CANDIDATES) or "unknown"
    method = _get(data, *_METHOD_CANDIDATES)
    path = _get(data, *_PATH_CANDIDATES)
    status_raw = _get(data, *_STATUS_CANDIDATES)
    status = int(status_raw) if status_raw else None

    proto_raw = (data.get("protocol") or data.get("proto") or "tcp").lower()
    try:
        protocol = Protocol(proto_raw)
    except ValueError:
        protocol = Protocol.TCP

    http = None
    if method or path or status:
        http = HttpMeta(method=method, url_path=path, status_code=status)

    return ConnectionEvent(
        source_collector="jsonl_log",
        direction=Direction.INBOUND,
        state=State.CLOSED,
        protocol=protocol,
        local=LocalEndpoint(process_name=process),
        remote=RemoteEndpoint(ip=str(ip), port=port),
        http=http,
        metrics=Metrics(),
    )
