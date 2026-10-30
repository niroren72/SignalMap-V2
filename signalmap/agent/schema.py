"""
SignalMap — Canonical data model.

All sources (collectors, importers, connectors) emit ConnectionEvent.
Run `python -m agent.schema` to regenerate shared/types.ts.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────

class Direction(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class State(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class Protocol(str, Enum):
    TCP = "tcp"
    UDP = "udp"
    HTTP = "http"
    HTTPS = "https"
    WS = "ws"
    WSS = "wss"
    DNS = "dns"
    QUIC = "quic"
    SSH = "ssh"
    RDP = "rdp"
    SMB = "smb"
    NTP = "ntp"


class NodeType(str, Enum):
    LOCAL_PROCESS = "local_process"
    LOCAL_HOST = "local_host"
    REMOTE_ENDPOINT = "remote_endpoint"
    SERVICE = "service"
    GEO_LOCATION = "geo_location"


class ServiceCategory(str, Enum):
    FINANCE = "finance"
    CRM = "crm"
    DEV = "dev"
    COMMS = "comms"
    CLOUD = "cloud"
    CDN = "cdn"
    OTHER = "other"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ── Sub-models ─────────────────────────────────────────────────────────

class LocalEndpoint(BaseModel):
    pid: Optional[int] = None
    process_name: Optional[str] = None
    user: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None


class RemoteEndpoint(BaseModel):
    ip: Optional[str] = None
    hostname: Optional[str] = None
    port: Optional[int] = None


class GeoInfo(BaseModel):
    lat: Optional[float] = None
    lon: Optional[float] = None
    country: Optional[str] = None
    city: Optional[str] = None


class AsnInfo(BaseModel):
    number: Optional[int] = None
    org: Optional[str] = None


class ServiceInfo(BaseModel):
    name: Optional[str] = None
    category: Optional[ServiceCategory] = None


class HttpMeta(BaseModel):
    method: Optional[str] = None
    url_path: Optional[str] = None
    status_code: Optional[int] = None
    req_size: Optional[int] = None
    resp_size: Optional[int] = None
    content_type: Optional[str] = None


class Metrics(BaseModel):
    bytes_in: int = 0
    bytes_out: int = 0
    packets: int = 0
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None


class AnomalyInfo(BaseModel):
    is_anomaly: bool = True
    severity: Severity = Severity.MEDIUM
    title: str = "Suspicious Network Activity"
    description: Optional[str] = None
    rule: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


# ── Main event ─────────────────────────────────────────────────────────

class ConnectionEvent(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:12])
    source_collector: str = "mock"
    direction: Direction = Direction.OUTBOUND
    state: State = State.ACTIVE
    protocol: Protocol = Protocol.TCP
    transport: Optional[str] = None

    local: LocalEndpoint = Field(default_factory=LocalEndpoint)
    remote: RemoteEndpoint = Field(default_factory=RemoteEndpoint)
    geo: GeoInfo = Field(default_factory=GeoInfo)
    asn: AsnInfo = Field(default_factory=AsnInfo)
    service: ServiceInfo = Field(default_factory=ServiceInfo)
    metrics: Metrics = Field(default_factory=Metrics)
    http: Optional[HttpMeta] = None
    anomaly: Optional[AnomalyInfo] = None

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


# ── TypeScript type generation ─────────────────────────────────────────

_TS_TYPE_MAP = {
    "string": "string",
    "integer": "number",
    "number": "number",
    "boolean": "boolean",
    "null": "null",
}


def _json_schema_to_ts(schema: dict, name: str, definitions: dict) -> str:
    """Convert a JSON schema object to a TypeScript interface."""
    lines = [f"export interface {name} {{"]
    props = schema.get("properties", {})
    required = set(schema.get("required", []))
    for prop_name, prop_schema in props.items():
        ts_type = _resolve_ts_type(prop_schema, definitions)
        optional = "" if prop_name in required else "?"
        lines.append(f"  {prop_name}{optional}: {ts_type};")
    lines.append("}")
    return "\n".join(lines)


def _resolve_ts_type(prop: dict, definitions: dict) -> str:
    """Resolve a JSON schema property to a TypeScript type string."""
    # Handle anyOf (Optional fields)
    if "anyOf" in prop:
        types = []
        for variant in prop["anyOf"]:
            t = _resolve_ts_type(variant, definitions)
            if t != "null":
                types.append(t)
            else:
                types.append("null")
        return " | ".join(types)

    # Handle $ref
    if "$ref" in prop:
        ref_name = prop["$ref"].split("/")[-1]
        return ref_name

    # Handle enum
    if "enum" in prop:
        return " | ".join(f'"{v}"' for v in prop["enum"])

    # Handle const
    if "const" in prop:
        return f'"{prop["const"]}"'

    # Handle basic types
    json_type = prop.get("type")
    if json_type == "array":
        items = prop.get("items", {})
        item_type = _resolve_ts_type(items, definitions)
        return f"{item_type}[]"
    if json_type == "object":
        return "Record<string, unknown>"
    if isinstance(json_type, list):
        return " | ".join(_TS_TYPE_MAP.get(t, "unknown") for t in json_type)
    if json_type in _TS_TYPE_MAP:
        return _TS_TYPE_MAP[json_type]

    # Format-based
    fmt = prop.get("format")
    if fmt == "date-time":
        return "string"  # ISO string

    return "unknown"


def generate_typescript() -> str:
    """Generate TypeScript interfaces from the Pydantic schema."""
    schema = ConnectionEvent.model_json_schema()
    definitions = schema.get("$defs", {})

    parts = [
        "// Auto-generated — do not edit. Run: python -m agent.schema",
        f"// Generated at: {datetime.utcnow().isoformat()}Z",
        "",
    ]

    # Emit enums
    enum_models = [Direction, State, Protocol, NodeType, ServiceCategory, Severity]
    for enum_cls in enum_models:
        values = " | ".join(f'"{e.value}"' for e in enum_cls)
        parts.append(f"export type {enum_cls.__name__} = {values};")
    parts.append("")

    # Emit sub-model interfaces
    for def_name, def_schema in definitions.items():
        if def_schema.get("type") == "object":
            parts.append(_json_schema_to_ts(def_schema, def_name, definitions))
            parts.append("")

    # Emit main interface
    parts.append(_json_schema_to_ts(schema, "ConnectionEvent", definitions))
    parts.append("")

    return "\n".join(parts)


if __name__ == "__main__":
    if "--emit-ts" in sys.argv:
        ts_code = generate_typescript()
        # Write to shared/types.ts
        out_path = Path(__file__).resolve().parent.parent / "shared" / "types.ts"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(ts_code, encoding="utf-8")
        print(f"Written to {out_path}")
    else:
        # Print JSON schema
        print(json.dumps(ConnectionEvent.model_json_schema(), indent=2))
