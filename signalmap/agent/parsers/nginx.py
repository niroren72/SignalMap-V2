"""
SignalMap — Nginx / Apache Combined Log Format parser.

Handles lines like:
  203.0.113.42 - frank [10/Oct/2000:13:55:36 -0700] "GET /page HTTP/1.1" 200 2326
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import AsyncIterator

from . import LogParser, register
from ..schema import (
    ConnectionEvent, RemoteEndpoint, LocalEndpoint,
    Protocol, Direction, State, HttpMeta, Metrics,
)

# Standard combined log format regex
_COMBINED_RE = re.compile(
    r'(?P<ip>\S+)'             # Remote IP
    r'\s+\S+\s+\S+'            # ident, auth (ignored)
    r'\s+\[(?P<time>[^\]]+)\]' # Timestamp
    r'\s+"(?P<method>\S+)'     # HTTP method
    r'\s+(?P<path>\S+)'        # URL path
    r'\s+\S+"'                 # Protocol (ignored)
    r'\s+(?P<status>\d{3})'   # Status code
    r'\s+(?P<size>\S+)'        # Response bytes ("-" means 0)
    r'(?:\s+"(?P<ref>[^"]*)")?'  # Referrer (optional)
    r'(?:\s+"(?P<ua>[^"]*)")?',  # User-agent (optional)
)

_TIME_FMT = "%d/%b/%Y:%H:%M:%S %z"


@register
class NginxParser(LogParser):

    @classmethod
    def can_parse(cls, filename: str, first_bytes: bytes) -> bool:
        name = filename.lower()
        if any(name.endswith(ext) for ext in ('.log', '.txt', '.access')):
            return True
        if any(kw in name for kw in ('nginx', 'apache', 'access', 'httpd')):
            return True
        # Sniff first line
        if first_bytes:
            sample = first_bytes.decode('utf-8', errors='ignore')
            return bool(_COMBINED_RE.match(sample.split('\n')[0].strip()))
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
        # Flush remaining
        if buffer.strip():
            event = _parse_line(buffer.decode("utf-8", errors="ignore").strip())
            if event:
                yield event


def _parse_line(line: str) -> ConnectionEvent | None:
    m = _COMBINED_RE.match(line)
    if not m:
        return None
    try:
        ip = m.group("ip")
        method = m.group("method").upper()
        path = m.group("path")
        status = int(m.group("status"))
        size_str = m.group("size")
        resp_size = int(size_str) if size_str and size_str != "-" else 0

        # Guess protocol from status/path
        protocol = Protocol.HTTPS if status < 400 else Protocol.HTTP

        # Parse timestamp
        first_seen: datetime | None = None
        try:
            first_seen = datetime.strptime(m.group("time"), _TIME_FMT)
        except Exception:
            pass

        return ConnectionEvent(
            source_collector="nginx_log",
            direction=Direction.INBOUND,
            state=State.CLOSED,
            protocol=protocol,
            local=LocalEndpoint(process_name="nginx/httpd"),
            remote=RemoteEndpoint(ip=ip),
            http=HttpMeta(
                method=method,
                url_path=path,
                status_code=status,
                resp_size=resp_size,
            ),
            metrics=Metrics(
                bytes_in=0,
                bytes_out=resp_size,
                first_seen=first_seen,
                last_seen=first_seen,
            ),
        )
    except Exception:
        return None
