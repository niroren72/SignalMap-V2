"""
SignalMap — 4-Stage Automated Verification & Pre-Completion Gate (`verify.py`).

Run before claiming any feature, refactor, or bugfix is complete:
    python signalmap/verify.py

Stages:
  1. Schema & Type Contract Check (`agent.schema` <-> `shared/types.ts`)
  2. Backend Unit, Collector, Enrichment & FastAPI Endpoint Smoke Suite (`TestClient`)
  3. Frontend Static Analysis & Production Build (`oxlint` + `tsc -b` + `vite build`)
  4. Live Server Reachability Check (if `:8765` is running)
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"

# Ensure signalmap/ is on sys.path
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _banner(stage: int, title: str) -> None:
    print(f"\n{'=' * 68}")
    print(f"  [STAGE {stage}/4] {title}")
    print(f"{'=' * 68}")


def stage_1_schema_and_types() -> None:
    _banner(1, "Schema & TypeScript Contract Verification")
    from agent.schema import ConnectionEvent, Protocol, Direction, State, ServiceCategory, Severity

    # 1. Verify all 12 protocols are present in Protocol enum
    expected_protocols = {
        "tcp", "udp", "http", "https", "ws", "wss",
        "dns", "quic", "ssh", "rdp", "smb", "ntp",
    }
    actual_protocols = {p.value for p in Protocol}
    missing = expected_protocols - actual_protocols
    assert not missing, f"Missing protocols in Protocol enum: {missing}"
    print(f"  [OK] Protocol enum contains all {len(actual_protocols)} protocols")

    # 2. Verify shared/types.ts exists and contains all protocol literals
    types_ts_path = ROOT / "shared" / "types.ts"
    assert types_ts_path.exists(), f"Missing {types_ts_path}"
    types_ts = types_ts_path.read_text(encoding="utf-8")
    for proto in expected_protocols:
        assert f'"{proto}"' in types_ts, f'shared/types.ts is missing protocol "{proto}"'
    print("  [OK] shared/types.ts matches agent/schema.py Protocol contract")

    # 3. Validate ConnectionEvent serialization roundtrip
    sample = ConnectionEvent(
        source_collector="salesforce_login",
        direction=Direction.INBOUND,
        state=State.ACTIVE,
        protocol=Protocol.HTTPS,
    )
    dumped = sample.model_dump(mode="json")
    assert dumped["source_collector"] == "salesforce_login"
    assert dumped["protocol"] == "https"
    print("  [OK] ConnectionEvent Pydantic model roundtrip verified")


def stage_2_backend_smoke_tests() -> None:
    _banner(2, "Backend Collectors, Enrichment & FastAPI Endpoint Smoke Tests")
    from fastapi.testclient import TestClient
    from agent.main import app
    from agent.schema import (
        AnomalyInfo,
        ConnectionEvent,
        GeoInfo,
        Protocol,
        RemoteEndpoint,
        ServiceCategory,
        ServiceInfo,
        Severity,
    )
    from agent.enrichment import enricher
    from agent.collectors.salesforce_collector import SalesforceCollector

    # 1. Verify URL normalization strips paths and converts Lightning domains
    norm_1 = SalesforceCollector._normalize_url(
        "https://acme-dev.develop.lightning.force.com/lightning/page/home?0.source=aloha"
    )
    assert norm_1 == "https://acme-dev.develop.my.salesforce.com", f"Unexpected normalized URL: {norm_1}"
    norm_2 = SalesforceCollector._normalize_url("login.salesforce.com/")
    assert norm_2 == "https://login.salesforce.com", f"Unexpected normalized URL: {norm_2}"
    print("  [OK] Salesforce URL normalization strips paths & converts Lightning domains")

    # 2. Verify DataEnricher preserves connector-provided GeoInfo, ServiceInfo, and AnomalyInfo
    enricher.load()
    custom_evt = ConnectionEvent(
        source_collector="salesforce_login",
        protocol=Protocol.HTTPS,
        remote=RemoteEndpoint(ip="13.110.14.1", hostname="acme.my.salesforce.com", port=443),
        geo=GeoInfo(lat=50.1109, lon=8.6821, city="Frankfurt", country="DE"),
        service=ServiceInfo(name="Salesforce (Acme Tenant)", category=ServiceCategory.CRM),
        anomaly=AnomalyInfo(
            is_anomaly=True,
            severity=Severity.HIGH,
            title="Salesforce Login Failure: Invalid Password",
            rule="sf_auth_failure",
        ),
    )
    enriched = enricher.enrich(custom_evt)
    assert enriched.geo.city == "Frankfurt" and enriched.geo.lat == 50.1109, (
        "DataEnricher overwrote connector GeoInfo!"
    )
    assert enriched.service.name == "Salesforce (Acme Tenant)", (
        "DataEnricher overwrote connector ServiceInfo!"
    )
    assert enriched.anomaly is not None and enriched.anomaly.rule == "sf_auth_failure", (
        "DataEnricher overwrote connector AnomalyInfo!"
    )
    print("  [OK] DataEnricher preserves connector GeoInfo, ServiceInfo & AnomalyInfo")

    # 3. Exercise FastAPI endpoints via TestClient (disable background socket loop during unit test)
    from agent.config import config
    orig_socket_enabled = config.collectors.socket_enabled
    config.collectors.socket_enabled = False
    try:
        with TestClient(app) as client:
            # GET /api/events
            r_events = client.get("/api/events?limit=50")
            assert r_events.status_code == 200, f"/api/events failed: {r_events.status_code}"
            assert "events" in r_events.json()
            print("  [OK] GET /api/events -> 200 OK")

            # GET /api/events/stats
            r_stats = client.get("/api/events/stats")
            assert r_stats.status_code == 200, f"/api/events/stats failed: {r_stats.status_code}"
            assert "total_events" in r_stats.json()
            print("  [OK] GET /api/events/stats -> 200 OK")

            # GET /api/events/timeline
            r_tl = client.get("/api/events/timeline?buckets=10")
            assert r_tl.status_code == 200, f"/api/events/timeline failed: {r_tl.status_code}"
            assert "timeline" in r_tl.json()
            print("  [OK] GET /api/events/timeline -> 200 OK")

            # GET /api/connectors/salesforce/status
            r_sf = client.get("/api/connectors/salesforce/status")
            assert r_sf.status_code == 200, f"/api/connectors/salesforce/status failed: {r_sf.status_code}"
            sf_body = r_sf.json()
            assert "streams" in sf_body and "login_history" in sf_body["streams"]
            print("  [OK] GET /api/connectors/salesforce/status -> 200 OK")

            # GET /api/connectors/salesforce/cli-orgs
            r_cli = client.get("/api/connectors/salesforce/cli-orgs")
            assert r_cli.status_code == 200, f"/api/connectors/salesforce/cli-orgs failed: {r_cli.status_code}"
            assert "orgs" in r_cli.json()
            print("  [OK] GET /api/connectors/salesforce/cli-orgs -> 200 OK")

            # POST /api/connectors/salesforce/oauth/start
            r_oauth = client.post(
                "/api/connectors/salesforce/oauth/start",
                json={"login_url": "https://login.salesforce.com/lightning/page/home"},
            )
            assert r_oauth.status_code == 200, f"/api/connectors/salesforce/oauth/start failed: {r_oauth.text}"
            oauth_data = r_oauth.json()
            assert oauth_data.get("authorize_url", "").startswith(
                "https://login.salesforce.com/services/oauth2/authorize?"
            )
            print("  [OK] POST /api/connectors/salesforce/oauth/start -> 200 OK (PKCE URL verified)")
    finally:
        config.collectors.socket_enabled = orig_socket_enabled


def stage_3_frontend_lint_and_build() -> None:
    _banner(3, "Frontend Static Analysis (oxlint) & Production Build (tsc + vite)")

    lint_proc = subprocess.run(
        ["npm", "run", "lint"],
        cwd=str(WEB_DIR),
        capture_output=True,
        text=True,
        shell=(os.name == "nt"),
    )
    if lint_proc.returncode != 0:
        print(lint_proc.stdout)
        print(lint_proc.stderr)
        raise RuntimeError("Frontend `npm run lint` failed with errors!")
    print("  [OK] npm run lint (oxlint) passed with 0 errors")

    build_proc = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(WEB_DIR),
        capture_output=True,
        text=True,
        shell=(os.name == "nt"),
    )
    if build_proc.returncode != 0:
        print(build_proc.stdout)
        print(build_proc.stderr)
        raise RuntimeError("Frontend `npm run build` (tsc -b && vite build) failed!")
    print("  [OK] npm run build (tsc -b && vite build) succeeded")


def stage_4_live_daemon_check() -> None:
    _banner(4, "Live Server Reachability & Health Check")
    import httpx

    try:
        resp = httpx.get("http://127.0.0.1:8765/api/connectors/salesforce/status", timeout=2.5)
        if resp.status_code == 200:
            print("  [OK] Live backend on http://127.0.0.1:8765 is UP and responding 200 OK")
        else:
            print(f"  [WARN] Live backend on :8765 returned HTTP {resp.status_code}")
    except Exception:
        print("  [INFO] Live backend on :8765 is not currently running (in-memory TestClient passed)")


def main() -> None:
    print("Starting SignalMap 4-Stage Verification Gate...")
    stage_1_schema_and_types()
    stage_2_backend_smoke_tests()
    stage_3_frontend_lint_and_build()
    stage_4_live_daemon_check()
    print(f"\n{'=' * 68}")
    print("  [PASS] ALL 4 VERIFICATION STAGES PASSED WITH ZERO ERRORS")
    print(f"{'=' * 68}\n")


if __name__ == "__main__":
    main()
