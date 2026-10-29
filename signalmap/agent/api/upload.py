"""
SignalMap — Log file upload endpoint.

POST /api/upload-log
  Accepts a multipart file upload, auto-detects the log format,
  enriches each parsed event, and persists to SQLiteStore.
  Returns import stats immediately after processing completes.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

from fastapi import APIRouter, UploadFile, File, HTTPException

from ..parsers import get_parser
from ..enrichment import enricher

if TYPE_CHECKING:
    pass

router = APIRouter(prefix="/api")

# Back-reference to main store — set at startup via set_store()
_store = None


def set_store(store) -> None:
    global _store
    _store = store


async def _byte_stream(upload: UploadFile):
    """Convert an UploadFile into an async byte iterator in 64 KB chunks."""
    while True:
        chunk = await upload.read(65536)
        if not chunk:
            break
        yield chunk


@router.post("/upload-log")
async def upload_log(file: UploadFile = File(...)):
    """
    Upload a log file for parsing.
    Supported formats: Nginx/Apache access logs, JSON Lines (.jsonl),
    Windows Event Log (.evtx / XML export).
    """
    if _store is None:
        raise HTTPException(status_code=503, detail="Store not yet initialised")

    filename = file.filename or "upload.log"

    # Peek at the first 512 bytes to help with auto-detection
    first_bytes = await file.read(512)
    await file.seek(0)

    parser = get_parser(filename, first_bytes)
    if parser is None:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file format: '{filename}'. "
                "Supported: .log, .txt, .jsonl, .ndjson, .evtx, .xml"
            ),
        )

    imported = 0
    skipped = 0
    t0 = time.monotonic()

    try:
        async for event in parser.parse(_byte_stream(file)):
            try:
                enriched = enricher.enrich(event)
                await _store.append(enriched)
                imported += 1
            except Exception:
                skipped += 1
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse error: {exc}")

    duration = round(time.monotonic() - t0, 2)

    return {
        "imported": imported,
        "skipped": skipped,
        "duration_s": duration,
        "filename": filename,
        "parser": parser.__class__.__name__,
    }
