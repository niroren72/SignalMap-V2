"""
SignalMap — Log parser registry.
Auto-detects the correct parser from a filename and returns an iterator of ConnectionEvents.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator, List, Type, TYPE_CHECKING

if TYPE_CHECKING:
    from ..schema import ConnectionEvent


class LogParser(ABC):
    """Base interface for all log parsers."""

    @classmethod
    @abstractmethod
    def can_parse(cls, filename: str, first_bytes: bytes) -> bool:
        """Return True if this parser can handle the given file."""
        ...

    @abstractmethod
    async def parse(self, stream: AsyncIterator[bytes]) -> AsyncIterator["ConnectionEvent"]:
        """Yield ConnectionEvents from a raw byte stream."""
        ...


# Registry — parsers are checked in order, first match wins
_REGISTRY: List[Type[LogParser]] = []
_parsers_loaded = False


def register(cls: Type[LogParser]) -> Type[LogParser]:
    _REGISTRY.append(cls)
    return cls


def _ensure_parsers_loaded() -> None:
    """Lazily import parsers on first use to avoid circular imports and startup crashes."""
    global _parsers_loaded
    if _parsers_loaded:
        return
    _parsers_loaded = True
    try:
        from . import nginx  # noqa: F401
    except Exception as e:
        print(f"[parsers] Warning: failed to load nginx parser: {e}")
    try:
        from . import jsonl  # noqa: F401
    except Exception as e:
        print(f"[parsers] Warning: failed to load jsonl parser: {e}")
    try:
        from . import windows_evtx  # noqa: F401
    except Exception as e:
        print(f"[parsers] Warning: failed to load windows_evtx parser: {e}")


def get_parser(filename: str, first_bytes: bytes = b"") -> "LogParser | None":
    """Return the first matching parser for the given file, or None."""
    _ensure_parsers_loaded()
    for cls in _REGISTRY:
        if cls.can_parse(filename, first_bytes):
            return cls()
    return None
