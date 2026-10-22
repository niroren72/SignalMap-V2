"""
SignalMap — REST API endpoints.
"""

from __future__ import annotations

import csv
import io
import socket
from fastapi import APIRouter, Query, Response
from typing import Optional

from ..config import config
from ..store.sqlite_store import SQLiteStore
from ..enrichment import enricher

router = APIRouter(prefix="/api")

# Will be set by main.py at startup
_buffer: SQLiteStore | None = None


def set_buffer(buffer: SQLiteStore) -> None:
    global _buffer
    _buffer = buffer


@router.get("/events")
async def get_events(
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    protocol: Optional[str] = None,
    source: Optional[str] = None,
    direction: Optional[str] = None,
    search: Optional[str] = None,
    is_anomaly: Optional[bool] = None,
    severity: Optional[str] = None,
    from_time: Optional[str] = None,
    to_time: Optional[str] = None,
):
    """Query stored events with rich filtering."""
    if _buffer is None:
        return {"events": [], "total": 0}

    events = await _buffer.query(
        protocol=protocol,
        source=source,
        direction=direction,
        search=search,
        is_anomaly=is_anomaly,
        severity=severity,
        from_time=from_time,
        to_time=to_time,
        limit=limit,
        offset=offset,
    )
    total = await _buffer.get_size()
    return {
        "events": [e.model_dump(mode="json") for e in events],
        "total": total,
    }


@router.get("/events/timeline")
async def get_timeline(
    buckets: int = Query(40, ge=10, le=100),
    from_time: Optional[str] = None,
    to_time: Optional[str] = None,
):
    """Get time-bucketed event counts and anomaly frequencies for timeline visualization."""
    if _buffer is None:
        return {"timeline": []}

    data = await _buffer.get_timeline(buckets=buckets, from_time=from_time, to_time=to_time)
    return {"timeline": data}


@router.get("/events/export")
async def export_events(
    format: str = Query("json", pattern="^(json|csv)$"),
    limit: int = Query(5000, ge=1, le=10000),
):
    """Export historical connection events as JSON or CSV."""
    if _buffer is None:
        return Response(content="[]", media_type="application/json")

    events = await _buffer.get_recent(limit)

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Timestamp", "Process", "PID", "Local IP", "Local Port",
            "Remote IP", "Remote Port", "Remote Host", "Protocol", "Direction",
            "Service", "Category", "City", "Country", "ASN Org", "Bytes In",
            "Bytes Out", "Packets", "Is Anomaly", "Severity", "Anomaly Rule"
        ])

        for e in events:
            writer.writerow([
                e.id,
                e.metrics.last_seen.isoformat() if e.metrics.last_seen else "",
                e.local.process_name or "",
                e.local.pid or "",
                e.local.host or "",
                e.local.port or "",
                e.remote.ip or "",
                e.remote.port or "",
                e.remote.hostname or "",
                e.protocol.value if hasattr(e.protocol, 'value') else str(e.protocol),
                e.direction.value if hasattr(e.direction, 'value') else str(e.direction),
                e.service.name if e.service else "",
                e.service.category.value if (e.service and e.service.category) else "",
                e.geo.city if e.geo else "",
                e.geo.country if e.geo else "",
                e.asn.org if e.asn else "",
                e.metrics.bytes_in,
                e.metrics.bytes_out,
                e.metrics.packets,
                "YES" if (e.anomaly and e.anomaly.is_anomaly) else "NO",
                e.anomaly.severity.value if (e.anomaly and e.anomaly.severity) else "",
                e.anomaly.rule if (e.anomaly and e.anomaly.rule) else ""
            ])

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=signalmap_events.csv"}
        )

    # JSON export
    json_data = [e.model_dump(mode="json") for e in events]
    import json
    return Response(
        content=json.dumps(json_data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=signalmap_events.json"}
    )


@router.get("/events/stats")
async def get_stats():
    """Summary statistics and threat counts."""
    if _buffer is None:
        return {"total_events": 0, "anomalies": 0, "protocols": {}, "services": {}}
    return await _buffer.get_stats()


@router.get("/config")
async def get_config():
    """Get current configuration."""
    return config.model_dump()


@router.get("/status")
async def get_status():
    """Get collector status."""
    return {
        "mock_enabled": config.collectors.mock_enabled,
        "socket_enabled": config.collectors.socket_enabled,
        "pcap_enabled": config.collectors.pcap_enabled,
        "proxy_enabled": config.collectors.proxy_enabled,
        "buffer_size": await _buffer.get_size() if _buffer else 0,
    }


@router.get("/system/origin")
async def get_origin():
    """Returns local host origin coordinates for 3D globe visualization without external privacy leaks."""
    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    geo = enricher._resolve_geo(local_ip)
    
    # Fallback to standard SOC coordinate (37.7749, -122.4194) if unmapped/internal
    lat = geo.lat if geo.lat is not None else 37.7749
    lon = geo.lon if geo.lon is not None else -122.4194
    city = geo.city or "Local SOC"
    country = geo.country or "US"

    return {
        "latitude": lat,
        "longitude": lon,
        "city": city,
        "country": country,
        "ip": local_ip,
        "is_local": True
    }

