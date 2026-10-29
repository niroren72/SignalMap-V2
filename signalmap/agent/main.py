"""
SignalMap — Main FastAPI application & entry point.
"""

from __future__ import annotations

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Safe encoding configuration on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import config
from .collectors.socket_collector import PsutilSocketCollector
from .enrichment import enricher
from .store.sqlite_store import SQLiteStore
from .api import rest, ws, upload, netutils, actions

# ── Application state ──────────────────────────────────────────────────

store = SQLiteStore()
_collector_task: asyncio.Task | None = None
collector = PsutilSocketCollector(poll_interval=1.0)

async def _run_collector():
    """Background task: poll psutil, enrich, store, broadcast."""
    print("* Starting socket collector and enrichment loading...")
    # Load maxmind db and download if needed before we start pumping events
    enricher.load()
    await collector.start()
    print("* Socket collector running")
    
    try:
        async for event in collector.events():
            enriched = enricher.enrich(event)
            await store.append(enriched)
            await ws.broadcast_event(enriched)
    finally:
        await collector.stop()
        enricher.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _collector_task
    # Startup
    await store.init()
    rest.set_buffer(store)
    upload.set_store(store)

    if config.collectors.socket_enabled:
        _collector_task = asyncio.create_task(_run_collector())
    elif config.collectors.mock_enabled:
        # Keeping mock optional fallback if user wants
        from .mock_generator import mock_event_stream
        async def _run_mock():
            async for event in mock_event_stream(rate=config.collectors.mock_rate):
                await store.append(event)
                await ws.broadcast_event(event)
        _collector_task = asyncio.create_task(_run_mock())
        print("* Mock generator started")

    print(f"* SignalMap backend running at http://localhost:{config.server.port}")
    yield

    # Shutdown
    if _collector_task:
        _collector_task.cancel()
        try:
            await _collector_task
        except asyncio.CancelledError:
            pass
            
    await store.close()
    print("* SignalMap backend stopped")


# ── FastAPI app ────────────────────────────────────────────────────────

app = FastAPI(
    title="SignalMap",
    version="0.1.0",
    description="Local connection monitor & visualizer",
    lifespan=lifespan,
)

# CORS for local dev (Vite on 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(rest.router)
app.include_router(ws.router)
app.include_router(upload.router)
app.include_router(netutils.router)
app.include_router(actions.router)

# Serve built frontend if exists
frontend_dist = Path(__file__).resolve().parent.parent / "web" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


def main():
    uvicorn.run(
        "agent.main:app",
        host=config.server.host,
        port=config.server.port,
        reload=config.server.dev_mode,
        log_level="info",
    )


if __name__ == "__main__":
    main()
