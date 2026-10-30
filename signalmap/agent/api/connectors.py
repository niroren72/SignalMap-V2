"""
SignalMap — Multi-Source Cloud & SaaS Connector API endpoints.
Manages authentication, live polling, and on-demand sync for the Salesforce
Cloud Security & Event Monitoring connector.
"""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..collectors.salesforce_collector import (
    SalesforceConnectorConfig,
    SalesforceStreamsConfig,
    salesforce_collector,
)

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


class SalesforceConnectRequest(BaseModel):
    auth_mode: str = "password"  # "password" | "client_credentials" | "access_token" | "sf_cli"
    login_url: str = "https://login.salesforce.com"
    instance_url: str = ""
    access_token: str = ""
    client_id: str = ""
    client_secret: str = ""
    username: str = ""
    password: str = ""
    security_token: str = ""
    cli_alias: str = ""
    poll_interval: int = 30
    lookback_days: int = 7
    streams: Optional[SalesforceStreamsConfig] = None


class DisconnectRequest(BaseModel):
    clear_credentials: bool = False


def _merge_with_saved(req: SalesforceConnectRequest) -> SalesforceConnectorConfig:
    """Merge incoming form request with existing saved secrets if fields were left blank."""
    saved = salesforce_collector.config
    return SalesforceConnectorConfig(
        enabled=True,
        auth_mode=req.auth_mode or saved.auth_mode,
        login_url=req.login_url or saved.login_url or "https://login.salesforce.com",
        instance_url=req.instance_url if req.instance_url != "" else saved.instance_url,
        access_token=req.access_token if req.access_token != "" else saved.access_token,
        client_id=req.client_id if req.client_id != "" else saved.client_id,
        client_secret=req.client_secret if req.client_secret != "" else saved.client_secret,
        username=req.username if req.username != "" else saved.username,
        password=req.password if req.password != "" else saved.password,
        security_token=req.security_token if req.security_token != "" else saved.security_token,
        cli_alias=req.cli_alias if req.cli_alias != "" else saved.cli_alias,
        poll_interval=max(10, min(3600, req.poll_interval or saved.poll_interval or 30)),
        lookback_days=max(1, min(90, req.lookback_days or saved.lookback_days or 7)),
        streams=req.streams or saved.streams,
    )


@router.get("/salesforce/status")
async def get_salesforce_status() -> dict[str, Any]:
    """Return current Salesforce connector health, org metadata, and stream counts."""
    return salesforce_collector.get_status()


@router.get("/salesforce/cli-orgs")
async def list_salesforce_cli_orgs() -> dict[str, Any]:
    """Detect authenticated Salesforce CLI (`sf` / `sfdx`) orgs on the local host."""
    orgs = salesforce_collector.detect_cli_orgs()
    return {"orgs": orgs, "count": len(orgs)}


@router.post("/salesforce/oauth/start")
async def start_salesforce_browser_oauth(req: SalesforceConnectRequest) -> dict[str, Any]:
    """
    Start a zero-setup OAuth 2.0 PKCE Browser Login session on `http://localhost:1717/OauthRedirect`
    using Salesforce's built-in `PlatformCLI` client ID.
    Returns the authorization URL to open in a browser popup where the user signs in with
    their simple Salesforce Username & Password (no Security Token or Connected App required).
    """
    try:
        auth_url = await salesforce_collector.start_browser_oauth_flow(
            login_url=req.login_url or req.instance_url or "https://login.salesforce.com",
            client_id=req.client_id,
            poll_interval=req.poll_interval,
            lookback_days=req.lookback_days,
            streams=req.streams,
        )
        return {
            "status": "ok",
            "authorize_url": auth_url,
            "message": "Complete login in the Salesforce browser popup window.",
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/salesforce/test")
async def test_salesforce_connection(req: SalesforceConnectRequest) -> dict[str, Any]:
    """Test Salesforce tenant credentials and return Organization details without starting polling."""
    cfg = _merge_with_saved(req)
    try:
        org_info = await salesforce_collector.authenticate(cfg)
        return {
            "status": "ok",
            "message": f"Authenticated to {org_info.get('org_name')} ({org_info.get('org_edition')})",
            "org": org_info,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/salesforce/connect")
async def connect_salesforce_tenant(req: SalesforceConnectRequest) -> dict[str, Any]:
    """
    Authenticate against the Salesforce tenant, persist configuration,
    perform an immediate telemetry sync, and start live background polling.
    """
    cfg = _merge_with_saved(req)
    try:
        org_info = await salesforce_collector.authenticate(cfg)
        salesforce_collector.save_config(cfg)
        sync_result = await salesforce_collector.sync_once()
        await salesforce_collector.start()
        return {
            "status": "ok",
            "message": (
                f"Connected to {org_info.get('org_name')} — synced "
                f"{sync_result.get('fetched_count', 0)} Salesforce security events."
            ),
            "org": org_info,
            "sync": sync_result,
            "connector": salesforce_collector.get_status(),
        }
    except Exception as exc:
        salesforce_collector.last_error = str(exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/salesforce/sync")
async def sync_salesforce_now() -> dict[str, Any]:
    """Trigger an immediate on-demand sync of all enabled Salesforce streams."""
    try:
        sync_result = await salesforce_collector.sync_once()
        return {
            "status": "ok",
            "sync": sync_result,
            "connector": salesforce_collector.get_status(),
        }
    except Exception as exc:
        salesforce_collector.last_error = str(exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/salesforce/disconnect")
async def disconnect_salesforce_tenant(req: DisconnectRequest = DisconnectRequest()) -> dict[str, Any]:
    """Stop background Salesforce polling and optionally clear saved credentials."""
    await salesforce_collector.stop()
    if req.clear_credentials:
        salesforce_collector.save_config(SalesforceConnectorConfig(enabled=False))
        salesforce_collector._connected = False
        salesforce_collector.org_name = None
        salesforce_collector.org_id = None
        salesforce_collector.org_edition = None
    else:
        cfg = salesforce_collector.config
        cfg.enabled = False
        salesforce_collector.save_config(cfg)

    return {
        "status": "ok",
        "message": "Salesforce connector stopped.",
        "connector": salesforce_collector.get_status(),
    }

