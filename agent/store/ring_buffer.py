"""
SignalMap — In-memory ring buffer for live events.

Fixed-size deque with query support. Used as the primary store in Phase 0;
SQLite persistence is added in Phase 1.
"""

from __future__ import annotations

from collections import deque
from typing import Optional

from ..schema import ConnectionEvent


class RingBuffer:
    """Thread-safe-ish ring buffer for ConnectionEvents."""

    def __init__(self, maxlen: int = 5000):
        self._buffer: deque[ConnectionEvent] = deque(maxlen=maxlen)

    def append(self, event: ConnectionEvent) -> None:
        self._buffer.append(event)

    def get_all(self) -> list[ConnectionEvent]:
        return list(self._buffer)

    def get_recent(self, count: int = 100) -> list[ConnectionEvent]:
        items = list(self._buffer)
        return items[-count:] if len(items) > count else items

    def query(
        self,
        protocol: Optional[str] = None,
        source: Optional[str] = None,
        direction: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[ConnectionEvent]:
        results = list(self._buffer)
        if protocol:
            results = [e for e in results if e.protocol.value == protocol]
        if source:
            results = [e for e in results if e.source_collector == source]
        if direction:
            results = [e for e in results if e.direction.value == direction]
        return results[offset : offset + limit]

    @property
    def size(self) -> int:
        return len(self._buffer)

    def clear(self) -> None:
        self._buffer.clear()
