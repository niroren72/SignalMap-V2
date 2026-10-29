"""
SignalMap — Abstract collector / importer interfaces.

All connection sources implement one of these two flavors.
Both emit ConnectionEvent as their output type.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator, Iterator

from ..schema import ConnectionEvent


class BaseCollector(ABC):
    """Live collector: continuously emits events from an OS-level source."""

    name: str = "base"
    requires_privileges: bool = False

    @abstractmethod
    async def start(self) -> None:
        """Initialize and begin collecting."""
        ...

    @abstractmethod
    async def stop(self) -> None:
        """Stop collecting and clean up."""
        ...

    @abstractmethod
    async def events(self) -> AsyncIterator[ConnectionEvent]:
        """Async generator of live connection events."""
        ...


class BaseImporter(ABC):
    """Batch importer: parses a historical source and yields events."""

    name: str = "base_importer"
    requires_privileges: bool = False

    @abstractmethod
    def parse(self, source: str) -> Iterator[ConnectionEvent]:
        """Yield historical ConnectionEvents from a file or data source."""
        ...

    def follow(self, source: str) -> AsyncIterator[ConnectionEvent]:
        """Optional: tail a growing file for near-live import."""
        raise NotImplementedError(f"{self.name} does not support follow mode")
