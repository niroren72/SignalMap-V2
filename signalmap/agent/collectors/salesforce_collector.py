"""
SignalMap — Salesforce Cloud Security & Event Monitoring Collector.

Supports multi-mode authentication against any Salesforce tenant:
  1. Direct Instance URL + Access Token / Session ID (`access_token`)
  2. Username + Password + Security Token (`password` — uses OAuth 2.0 if
     Client ID/Secret are provided, or zero-setup SOAP Partner `login()` if omitted)
  3. OAuth 2.0 Client Credentials (`client_credentials` — Connected App / External Client App)
  4. Local Salesforce CLI session auto-import (`sf_cli` — `sf org display --json`)

Adaptive Telemetry Streams:
  - Standard Objects (All Editions):
      * `LoginHistory` + `LoginGeo`  -> `source_collector = "salesforce_login"`
      * `AuthSession`                -> `source_collector = "salesforce_session"`
      * `SetupAuditTrail`            -> `source_collector = "salesforce_audit"`
  - Event Monitoring / Shield Objects (Auto-probed):
      * `ReportEvent`                -> `source_collector = "salesforce_report"`
      * `ApiEvent`                   -> `source_collector = "salesforce_api"`
      * `EventLogFile`               -> `source_collector = "salesforce_api"` / `"salesforce_report"`
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
import socket
import subprocess
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from html import escape as xml_escape
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Coroutine, Optional

import httpx
from pydantic import BaseModel, Field

from .base import BaseCollector
from ..schema import (
    AnomalyInfo,
    AsnInfo,
    ConnectionEvent,
    Direction,
    GeoInfo,
    HttpMeta,
    LocalEndpoint,
    Metrics,
    Protocol,
    RemoteEndpoint,
    ServiceCategory,
    ServiceInfo,
    Severity,
    State,
)


CONFIG_FILE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "salesforce_connector.json"
SF_API_VERSION = "v60.0"


class SalesforceStreamsConfig(BaseModel):
    login_history: bool = True
    auth_session: bool = True
    setup_audit: bool = True
    event_monitoring: bool = True


class SalesforceConnectorConfig(BaseModel):
    enabled: bool = False
    auth_mode: str = "password"  # "password" | "oauth_browser" | "client_credentials" | "access_token" | "sf_cli"
    login_url: str = "https://login.salesforce.com"
    instance_url: str = ""
    access_token: str = ""
    refresh_token: str = ""
    client_id: str = ""
    client_secret: str = ""
    username: str = ""
    password: str = ""
    security_token: str = ""
    cli_alias: str = ""
    poll_interval: int = Field(default=30, ge=10, le=3600)
    lookback_days: int = Field(default=7, ge=1, le=90)
    streams: SalesforceStreamsConfig = Field(default_factory=SalesforceStreamsConfig)


class StreamHealth(BaseModel):
    enabled: bool = True
    status: str = "standby"  # "active" | "connected" | "standby" | "unsupported" | "error"
    events_ingested: int = 0
    last_message: Optional[str] = None


class SalesforceCollector(BaseCollector):
    """Live & historical Salesforce tenant security telemetry collector."""

    name: str = "salesforce"
    requires_privileges: bool = False

    def __init__(self) -> None:
        self.config: SalesforceConnectorConfig = self._load_saved_config()
        self._running: bool = False
        self._connected: bool = False
        self._task: Optional[asyncio.Task] = None
        self._queue: asyncio.Queue[ConnectionEvent] = asyncio.Queue()
        self._on_event_callback: Optional[Callable[[ConnectionEvent], Coroutine[Any, Any, None]]] = None

        # Active session state
        self._session_token: str = ""
        self._instance_url: str = ""
        self._tenant_hostname: str = "login.salesforce.com"
        self._tenant_ip: str = "13.110.14.1"

        # Tenant metadata
        self.org_id: Optional[str] = None
        self.org_name: Optional[str] = None
        self.org_edition: Optional[str] = None
        self.is_sandbox: bool = False
        self.authenticated_username: Optional[str] = None
        self.last_sync: Optional[str] = None
        self.last_error: Optional[str] = None
        self.total_ingested: int = 0
        self.threats_detected: int = 0

        # Cached lookup tables
        self._user_map: dict[str, dict[str, str]] = {}
        self._geo_map: dict[str, dict[str, Any]] = {}
        self._seen_event_ids: set[str] = set()
        self._oauth_server: Optional[asyncio.AbstractServer] = None
        self._oauth_pending_verifier: str = ""
        self._oauth_pending_base_url: str = "https://login.salesforce.com"
        self._oauth_pending_client_id: str = "PlatformCLI"

        # Per-stream health status
        self.stream_health: dict[str, StreamHealth] = {
            "login_history": StreamHealth(enabled=self.config.streams.login_history),
            "auth_session": StreamHealth(enabled=self.config.streams.auth_session),
            "setup_audit": StreamHealth(enabled=self.config.streams.setup_audit),
            "event_monitoring": StreamHealth(enabled=self.config.streams.event_monitoring),
        }

    # ── Persistence ────────────────────────────────────────────────────

    def _load_saved_config(self) -> SalesforceConnectorConfig:
        """Load persisted Salesforce connector config from disk or environment."""
        if CONFIG_FILE_PATH.exists():
            try:
                raw = json.loads(CONFIG_FILE_PATH.read_text(encoding="utf-8"))
                return SalesforceConnectorConfig(**raw)
            except Exception as exc:
                print(f"* [Salesforce] Failed to load saved config: {exc}")

        # Check environment variables fallback
        env_url = os.environ.get("SF_INSTANCE_URL", "")
        env_token = os.environ.get("SF_ACCESS_TOKEN", "")
        env_user = os.environ.get("SF_USERNAME", "")
        env_pass = os.environ.get("SF_PASSWORD", "")
        env_sec_token = os.environ.get("SF_SECURITY_TOKEN", "")
        env_client_id = os.environ.get("SF_CLIENT_ID", "")
        env_client_secret = os.environ.get("SF_CLIENT_SECRET", "")

        if env_url and env_token:
            return SalesforceConnectorConfig(
                enabled=True,
                auth_mode="access_token",
                instance_url=env_url,
                access_token=env_token,
            )
        if env_user and env_pass:
            return SalesforceConnectorConfig(
                enabled=True,
                auth_mode="password",
                username=env_user,
                password=env_pass,
                security_token=env_sec_token,
                client_id=env_client_id,
                client_secret=env_client_secret,
            )
        return SalesforceConnectorConfig()

    def save_config(self, cfg: SalesforceConnectorConfig) -> None:
        """Persist connector configuration to disk inside `data/` (git-ignored)."""
        self.config = cfg
        self.stream_health["login_history"].enabled = cfg.streams.login_history
        self.stream_health["auth_session"].enabled = cfg.streams.auth_session
        self.stream_health["setup_audit"].enabled = cfg.streams.setup_audit
        self.stream_health["event_monitoring"].enabled = cfg.streams.event_monitoring
        try:
            CONFIG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
            CONFIG_FILE_PATH.write_text(
                json.dumps(cfg.model_dump(), indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            print(f"* [Salesforce] Warning: could not persist config: {exc}")

    def set_event_callback(
        self, callback: Callable[[ConnectionEvent], Coroutine[Any, Any, None]]
    ) -> None:
        """Register pipeline callback (enrich -> store -> ws broadcast)."""
        self._on_event_callback = callback

    # ── Authentication Flows ───────────────────────────────────────────

    @staticmethod
    def _normalize_url(url: str) -> str:
        url = (url or "").strip()
        if not url:
            return "https://login.salesforce.com"
        if not url.startswith("http://") and not url.startswith("https://"):
            url = f"https://{url}"
        parsed = urllib.parse.urlparse(url)
        host = (parsed.netloc or parsed.path.split("/")[0]).strip().lower()
        scheme = parsed.scheme if parsed.scheme in ("http", "https") else "https"
        # Convert Lightning / Visualforce domains to My Domain (.my.salesforce.com)
        if ".lightning.force.com" in host:
            host = host.replace(".lightning.force.com", ".my.salesforce.com")
        elif ".vf.force.com" in host:
            host = host.replace(".vf.force.com", ".my.salesforce.com")
        elif ".salesforce-setup.com" in host:
            host = host.replace(".salesforce-setup.com", ".salesforce.com")
        return f"{scheme}://{host}"

    @staticmethod
    def detect_cli_orgs() -> list[dict[str, Any]]:
        """Detect authenticated Salesforce CLI (`sf` or `sfdx`) orgs on the local host."""
        orgs: list[dict[str, Any]] = []
        for cmd in (["sf", "org", "list", "--json"], ["sfdx", "force:org:list", "--json"]):
            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=8,
                    shell=(os.name == "nt"),
                )
                if proc.returncode == 0 and proc.stdout:
                    payload = json.loads(proc.stdout)
                    result = payload.get("result", {})
                    for group_key in ("nonScratchOrgs", "scratchOrgs", "other", "sandboxes"):
                        for item in result.get(group_key, []) or []:
                            orgs.append(
                                {
                                    "alias": item.get("alias") or item.get("username"),
                                    "username": item.get("username"),
                                    "orgId": item.get("orgId"),
                                    "instanceUrl": item.get("instanceUrl"),
                                    "connectedStatus": item.get("connectedStatus", "Connected"),
                                    "isDefault": bool(item.get("isDefaultUsername")),
                                }
                            )
                    if orgs:
                        break
            except Exception:
                continue
        return orgs

    async def _authenticate_sf_cli(self, alias: str = "") -> tuple[str, str, Optional[str]]:
        """Extract `instanceUrl` and `accessToken` from local `sf org display`."""
        args = ["sf", "org", "display", "--json"]
        if alias.strip():
            args.extend(["--target-org", alias.strip()])

        loop = asyncio.get_running_loop()
        proc = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=12,
                shell=(os.name == "nt"),
            ),
        )
        if proc.returncode != 0:
            raise ValueError(
                f"Salesforce CLI (`sf org display`) failed: {(proc.stderr or proc.stdout or 'CLI not found').strip()}"
            )
        data = json.loads(proc.stdout).get("result", {})
        instance_url = self._normalize_url(data.get("instanceUrl", ""))
        access_token = (data.get("accessToken") or "").strip()
        username = data.get("username")
        if not instance_url or not access_token:
            raise ValueError("Salesforce CLI did not return an active instanceUrl and accessToken.")
        return instance_url, access_token, username

    async def _authenticate_soap_login(
        self, login_url: str, username: str, password: str, security_token: str, alt_url: str = ""
    ) -> tuple[str, str, Optional[str]]:
        """
        Authenticate via Salesforce Partner SOAP `login()` API.
        Tries candidate login endpoints (`login_url`, `alt_url`, `login.salesforce.com`, `test.salesforce.com`).
        """
        candidates: list[str] = []
        for u in (login_url, alt_url, "https://login.salesforce.com", "https://test.salesforce.com"):
            if u:
                norm = self._normalize_url(u)
                if norm not in candidates:
                    candidates.append(norm)

        full_password = password
        if security_token and not password.endswith(security_token):
            full_password = f"{password}{security_token}"

        envelope = f"""<?xml version="1.0" encoding="utf-8" ?>
<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
  <env:Body>
    <n1:login xmlns:n1="urn:partner.soap.sforce.com">
      <n1:username>{xml_escape(username.strip())}</n1:username>
      <n1:password>{xml_escape(full_password)}</n1:password>
    </n1:login>
  </env:Body>
</env:Envelope>"""

        last_fault = "Unknown SOAP login error"
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            for base_url in candidates:
                soap_endpoint = f"{base_url}/services/Soap/u/60.0"
                try:
                    resp = await client.post(
                        soap_endpoint,
                        content=envelope.encode("utf-8"),
                        headers={
                            "Content-Type": "text/xml; charset=UTF-8",
                            "SOAPAction": "login",
                        },
                    )
                except Exception as exc:
                    last_fault = str(exc)
                    continue

                if resp.status_code == 200:
                    try:
                        root = ET.fromstring(resp.text)
                        session_id = ""
                        server_url = ""
                        for elem in root.iter():
                            if elem.tag.endswith("sessionId") and elem.text:
                                session_id = elem.text.strip()
                            elif elem.tag.endswith("serverUrl") and elem.text:
                                server_url = elem.text.strip()
                        if session_id and server_url:
                            parsed = urllib.parse.urlparse(server_url)
                            instance_url = f"{parsed.scheme}://{parsed.netloc}"
                            return instance_url, session_id, username.strip()
                    except Exception as exc:
                        last_fault = f"Invalid SOAP XML response: {exc}"
                        continue
                else:
                    try:
                        root = ET.fromstring(resp.text)
                        for elem in root.iter():
                            if elem.tag.endswith("faultstring") and elem.text:
                                last_fault = elem.text.strip()
                                break
                    except Exception:
                        last_fault = f"HTTP {resp.status_code} at {soap_endpoint}"

                    # If the fault is an explicit credential/token rejection (not domain mismatch), stop early
                    if "INVALID_LOGIN" in last_fault or "MUST_USE_SECURITY_TOKEN" in last_fault:
                        if not security_token:
                            raise ValueError(
                                f"{last_fault} — Your Salesforce org requires either a 24-character Security Token "
                                "for direct API password login OR use the '1-Click Browser Login (No Token Needed)' button above!"
                            )
                        raise ValueError(f"Salesforce SOAP login failed: {last_fault}")

        raise ValueError(
            f"Salesforce SOAP login failed ({last_fault}). Tip: Click '1-Click Browser Login' above to sign in directly via Salesforce without needing a Security Token."
        )

    async def start_browser_oauth_flow(
        self,
        login_url: str = "https://login.salesforce.com",
        client_id: str = "",
        poll_interval: int = 30,
        lookback_days: int = 7,
        streams: Optional[SalesforceStreamsConfig] = None,
    ) -> str:
        """
        Launch a local OAuth 2.0 PKCE callback listener on `http://localhost:1717/OauthRedirect`
        using Salesforce's built-in `PlatformCLI` client ID (present in all Salesforce orgs).
        Allows logging in with simple Username + Password in the browser without a Security Token or custom Connected App.
        """
        base_url = self._normalize_url(login_url)
        cid = (client_id or "").strip() or "PlatformCLI"
        redirect_uri = "http://localhost:1717/OauthRedirect"

        # Generate PKCE verifier & S256 challenge
        verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode("ascii").rstrip("=")
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

        self._oauth_pending_verifier = verifier
        self._oauth_pending_base_url = base_url
        self._oauth_pending_client_id = cid

        # Update config preferences
        self.config.login_url = base_url
        self.config.poll_interval = max(10, poll_interval)
        self.config.lookback_days = max(1, lookback_days)
        if streams:
            self.config.streams = streams

        # Start local callback listener on port 1717 if not already listening
        if self._oauth_server is not None:
            try:
                self._oauth_server.close()
                await self._oauth_server.wait_closed()
            except Exception:
                pass
            self._oauth_server = None

        async def _handle_oauth_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
            try:
                data = await asyncio.wait_for(reader.read(8192), timeout=5.0)
                request_line = data.decode("utf-8", errors="replace").splitlines()[0] if data else ""
                parts = request_line.split(" ")
                path = parts[1] if len(parts) >= 2 else "/"
                parsed_path = urllib.parse.urlparse(path)
                params = urllib.parse.parse_qs(parsed_path.query)

                code = (params.get("code") or [""])[0]
                error = (params.get("error") or [""])[0]
                error_desc = (params.get("error_description") or [""])[0]

                if error or not code:
                    msg = error_desc or error or "Missing authorization code"
                    self.last_error = f"OAuth Browser Login failed: {msg}"
                    html = f"""<html><body style="background:#0b101b;color:#f87171;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                    <div style="padding:24px;border:1px solid #ef4444;border-radius:12px;max-width:460px;text-align:center;">
                      <h3>Salesforce Authentication Failed</h3>
                      <p style="color:#cbd5e1;">{xml_escape(msg)}</p>
                      <button onclick="window.close()" style="margin-top:12px;padding:8px 16px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:6px;cursor:pointer;">Close Window</button>
                    </div></body></html>"""
                else:
                    # Exchange authorization code + PKCE verifier for access_token & instance_url
                    token_url = f"{self._oauth_pending_base_url}/services/oauth2/token"
                    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                        resp = await client.post(
                            token_url,
                            data={
                                "grant_type": "authorization_code",
                                "code": code,
                                "client_id": self._oauth_pending_client_id,
                                "redirect_uri": redirect_uri,
                                "code_verifier": self._oauth_pending_verifier,
                            },
                        )
                    if resp.status_code != 200:
                        err_text = resp.text[:250]
                        self.last_error = f"Token exchange failed: {err_text}"
                        html = f"""<html><body style="background:#0b101b;color:#f87171;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                        <div style="padding:24px;border:1px solid #ef4444;border-radius:12px;max-width:460px;text-align:center;">
                          <h3>Token Exchange Failed</h3>
                          <p style="color:#cbd5e1;">{xml_escape(err_text)}</p>
                        </div></body></html>"""
                    else:
                        token_data = resp.json()
                        inst_url = self._normalize_url(token_data.get("instance_url") or self._oauth_pending_base_url)
                        acc_token = token_data.get("access_token", "")
                        ref_token = token_data.get("refresh_token", "")

                        self.config.enabled = True
                        self.config.auth_mode = "access_token"
                        self.config.instance_url = inst_url
                        self.config.access_token = acc_token
                        if ref_token:
                            self.config.refresh_token = ref_token

                        await self.authenticate(self.config)
                        self.save_config(self.config)
                        asyncio.create_task(self._complete_oauth_sync_and_poll())

                        html = f"""<html><body style="background:#0b101b;color:#34d399;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                        <div style="padding:28px;border:1px solid rgba(52,211,153,0.4);background:rgba(6,78,59,0.2);border-radius:16px;max-width:460px;text-align:center;">
                          <h2 style="margin-top:0;">✓ Salesforce Tenant Connected!</h2>
                          <p style="color:#e2e8f0;font-size:13px;">Authenticated to <strong>{xml_escape(self.org_name or inst_url)}</strong></p>
                          <p style="color:#94a3b8;font-size:11px;">SignalMap is now syncing your Salesforce telemetry. This window will close automatically...</p>
                          <script>setTimeout(() => window.close(), 1200);</script>
                        </div></body></html>"""

                response_bytes = (
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: text/html; charset=utf-8\r\n"
                    f"Content-Length: {len(html.encode('utf-8'))}\r\n"
                    "Connection: close\r\n\r\n"
                ).encode("utf-8") + html.encode("utf-8")
                writer.write(response_bytes)
                await writer.drain()
            except Exception as exc:
                self.last_error = f"OAuth callback error: {exc}"
            finally:
                try:
                    writer.close()
                    await writer.wait_closed()
                except Exception:
                    pass
                if self._oauth_server is not None:
                    self._oauth_server.close()
                    self._oauth_server = None

        self._oauth_server = await asyncio.start_server(_handle_oauth_client, host="127.0.0.1", port=1717)

        query = urllib.parse.urlencode(
            {
                "response_type": "code",
                "client_id": cid,
                "redirect_uri": redirect_uri,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "prompt": "login",
            }
        )
        return f"{base_url}/services/oauth2/authorize?{query}"

    async def _complete_oauth_sync_and_poll(self) -> None:
        try:
            await self.sync_once()
            await self.start()
        except Exception as exc:
            self.last_error = str(exc)

    async def authenticate(self, cfg: Optional[SalesforceConnectorConfig] = None) -> dict[str, Any]:
        """
        Authenticate against the Salesforce tenant using the configured auth_mode
        and verify access by querying Organization metadata.
        """
        target = cfg or self.config
        mode = (target.auth_mode or "password").lower()

        instance_url = ""
        access_token = ""
        resolved_username: Optional[str] = target.username or None

        if mode == "access_token":
            instance_url = self._normalize_url(target.instance_url or target.login_url)
            access_token = (target.access_token or "").strip()
            if not instance_url or not access_token:
                raise ValueError("Instance URL and Access Token are required for Access Token mode.")

        elif mode == "sf_cli":
            instance_url, access_token, resolved_username = await self._authenticate_sf_cli(
                target.cli_alias
            )

        elif mode == "client_credentials":
            base_url = self._normalize_url(target.instance_url or target.login_url)
            if not target.client_id or not target.client_secret:
                raise ValueError("Client ID and Client Secret are required for OAuth 2.0 Client Credentials.")
            token_url = f"{base_url}/services/oauth2/token"
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": target.client_id.strip(),
                        "client_secret": target.client_secret.strip(),
                    },
                )
            if resp.status_code != 200:
                err_body = resp.json() if "json" in resp.headers.get("content-type", "") else {}
                desc = err_body.get("error_description") or err_body.get("error") or resp.text[:200]
                raise ValueError(f"OAuth 2.0 Client Credentials failed: {desc}")
            token_data = resp.json()
            instance_url = self._normalize_url(token_data.get("instance_url") or base_url)
            access_token = token_data.get("access_token", "")

        elif mode in ("password", "oauth_password", "soap_login"):
            if not target.username or not target.password:
                raise ValueError("Username and Password are required.")
            base_url = self._normalize_url(target.login_url or target.instance_url)

            # If Client ID + Client Secret are provided, try OAuth 2.0 Username-Password flow first
            if target.client_id.strip() and target.client_secret.strip():
                token_url = f"{base_url}/services/oauth2/token"
                full_pw = target.password
                if target.security_token and not full_pw.endswith(target.security_token):
                    full_pw = f"{target.password}{target.security_token}"

                async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                    resp = await client.post(
                        token_url,
                        data={
                            "grant_type": "password",
                            "client_id": target.client_id.strip(),
                            "client_secret": target.client_secret.strip(),
                            "username": target.username.strip(),
                            "password": full_pw,
                        },
                    )
                if resp.status_code == 200:
                    token_data = resp.json()
                    instance_url = self._normalize_url(token_data.get("instance_url") or base_url)
                    access_token = token_data.get("access_token", "")
                else:
                    # Fallback to SOAP Partner login if OAuth password flow is disabled on Connected App
                    instance_url, access_token, resolved_username = await self._authenticate_soap_login(
                        base_url, target.username, target.password, target.security_token, target.instance_url
                    )
            else:
                # Zero-Connected-App SOAP Partner login
                instance_url, access_token, resolved_username = await self._authenticate_soap_login(
                    base_url, target.username, target.password, target.security_token, target.instance_url
                )
        else:
            raise ValueError(f"Unsupported authentication mode: {mode}")

        # Verify token and fetch Organization details via Salesforce REST API
        org_info = await self._verify_and_fetch_org_info(instance_url, access_token)

        self._instance_url = instance_url
        self._session_token = access_token
        self._connected = True
        self.last_error = None

        parsed_host = urllib.parse.urlparse(instance_url).hostname or "login.salesforce.com"
        self._tenant_hostname = parsed_host
        self._tenant_ip = await self._resolve_host_ip(parsed_host)

        self.org_id = org_info.get("org_id")
        self.org_name = org_info.get("org_name")
        self.org_edition = org_info.get("org_edition")
        self.is_sandbox = bool(org_info.get("is_sandbox", False))
        self.authenticated_username = org_info.get("username") or resolved_username

        return {
            "connected": True,
            "instance_url": self._instance_url,
            "tenant_hostname": self._tenant_hostname,
            "tenant_ip": self._tenant_ip,
            "org_id": self.org_id,
            "org_name": self.org_name,
            "org_edition": self.org_edition,
            "is_sandbox": self.is_sandbox,
            "username": self.authenticated_username,
        }

    async def _resolve_host_ip(self, hostname: str) -> str:
        """Non-blocking DNS resolution for the Salesforce tenant hostname."""
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, socket.gethostbyname, hostname)
        except Exception:
            return "13.110.14.1"

    async def _verify_and_fetch_org_info(self, instance_url: str, access_token: str) -> dict[str, Any]:
        """Verify REST API access and retrieve Organization & current User details."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            # 1. Query Organization metadata
            soql = "SELECT Id, Name, OrganizationType, InstanceName, IsSandbox, Country FROM Organization LIMIT 1"
            q_url = f"{instance_url}/services/data/{SF_API_VERSION}/query"
            resp = await client.get(q_url, params={"q": soql}, headers=headers)

            if resp.status_code == 401:
                raise ValueError("Salesforce session token rejected (401 Unauthorized). Check token or credentials.")
            if resp.status_code != 200:
                raise ValueError(f"Salesforce REST API query failed ({resp.status_code}): {resp.text[:200]}")

            records = resp.json().get("records", [])
            org = records[0] if records else {}

            # 2. Fetch current identity via /services/oauth2/userinfo (best-effort)
            username = None
            try:
                ui_resp = await client.get(f"{instance_url}/services/oauth2/userinfo", headers=headers)
                if ui_resp.status_code == 200:
                    ui_data = ui_resp.json()
                    username = ui_data.get("preferred_username") or ui_data.get("email") or ui_data.get("name")
            except Exception:
                pass

            return {
                "org_id": org.get("Id"),
                "org_name": org.get("Name") or "Salesforce Tenant",
                "org_edition": org.get("OrganizationType") or "Enterprise Edition",
                "instance_name": org.get("InstanceName"),
                "is_sandbox": bool(org.get("IsSandbox", False)),
                "country": org.get("Country"),
                "username": username,
            }

    # ── SOQL Helper ────────────────────────────────────────────────────

    async def _soql_query(self, client: httpx.AsyncClient, soql: str) -> list[dict[str, Any]]:
        """Execute a SOQL query against the active Salesforce tenant, auto-reauthenticating on 401."""
        if not self._instance_url or not self._session_token:
            await self.authenticate()

        q_url = f"{self._instance_url}/services/data/{SF_API_VERSION}/query"
        headers = {
            "Authorization": f"Bearer {self._session_token}",
            "Accept": "application/json",
        }
        resp = await client.get(q_url, params={"q": soql}, headers=headers)
        if resp.status_code == 401 and self.config.auth_mode != "access_token":
            await self.authenticate()
            headers["Authorization"] = f"Bearer {self._session_token}"
            resp = await client.get(q_url, params={"q": soql}, headers=headers)

        if resp.status_code != 200:
            err_msg = resp.text[:250]
            try:
                err_json = resp.json()
                if isinstance(err_json, list) and err_json:
                    err_msg = f"{err_json[0].get('errorCode')}: {err_json[0].get('message')}"
            except Exception:
                pass
            raise RuntimeError(err_msg)

        return resp.json().get("records", [])

    # ── User & Geo Resolution Caches ───────────────────────────────────

    async def _refresh_user_map(self, client: httpx.AsyncClient) -> None:
        """Cache Salesforce UserId -> Username & Profile name for human-readable attribution."""
        try:
            records = await self._soql_query(
                client,
                "SELECT Id, Username, Name, Department, Profile.Name FROM User LIMIT 250",
            )
            for r in records:
                uid = r.get("Id")
                if not uid:
                    continue
                profile_obj = r.get("Profile") or {}
                self._user_map[uid] = {
                    "username": r.get("Username") or r.get("Name") or uid,
                    "name": r.get("Name") or "",
                    "profile": profile_obj.get("Name") if isinstance(profile_obj, dict) else "",
                }
                # Also index 15-char Salesforce ID prefix
                if len(uid) >= 15:
                    self._user_map[uid[:15]] = self._user_map[uid]
        except Exception:
            pass

    def _resolve_username(self, user_id: Optional[str]) -> str:
        if not user_id:
            return self.authenticated_username or "salesforce-system"
        info = self._user_map.get(user_id) or self._user_map.get(user_id[:15])
        if info:
            return info["username"]
        return user_id

    async def _resolve_login_geos(self, client: httpx.AsyncClient, geo_ids: list[str]) -> None:
        """Fetch `LoginGeo` records for any unseen LoginGeoIds."""
        missing = [gid for gid in set(geo_ids) if gid and gid not in self._geo_map]
        if not missing:
            return
        batch = missing[:40]
        quoted = ",".join(f"'{gid}'" for gid in batch if re.match(r"^[a-zA-Z0-9]{15,18}$", gid))
        if not quoted:
            return
        try:
            records = await self._soql_query(
                client,
                f"SELECT Id, City, Country, CountryIso, Latitude, Longitude, Subdivision FROM LoginGeo WHERE Id IN ({quoted})",
            )
            for r in records:
                gid = r.get("Id")
                if gid:
                    self._geo_map[gid] = {
                        "lat": r.get("Latitude"),
                        "lon": r.get("Longitude"),
                        "city": r.get("City") or r.get("Subdivision"),
                        "country": r.get("Country") or r.get("CountryIso"),
                    }
        except Exception:
            pass

    @staticmethod
    def _parse_sf_datetime(val: Optional[str]) -> datetime:
        if not val:
            return datetime.now(timezone.utc)
        try:
            # Salesforce format: 2026-10-30T15:04:05.000+0000 or Z
            normalized = re.sub(r"\+0000$", "+00:00", val)
            if normalized.endswith("Z"):
                normalized = normalized[:-1] + "+00:00"
            return datetime.fromisoformat(normalized)
        except Exception:
            return datetime.now(timezone.utc)

    def _clean_source_ip(self, raw_ip: Optional[str]) -> str:
        """Return a valid IPv4/IPv6 string, falling back to the resolved Salesforce tenant IP."""
        if not raw_ip or raw_ip in ("Salesforce.com IP", "::1", "127.0.0.1", "0.0.0.0"):
            return self._tenant_ip
        return raw_ip.strip()

    # ── Stream Pollers ─────────────────────────────────────────────────

    async def _poll_login_history(self, client: httpx.AsyncClient) -> list[ConnectionEvent]:
        """Poll Salesforce `LoginHistory` + `LoginGeo`."""
        events: list[ConnectionEvent] = []
        since_dt = (datetime.now(timezone.utc) - timedelta(days=self.config.lookback_days)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        soql = (
            "SELECT Id, UserId, LoginTime, LoginType, SourceIp, LoginUrl, "
            "LoginGeoId, Browser, Platform, Status, Application, ApiType, "
            "CountryIso, CipherSuite, TlsProtocol "
            f"FROM LoginHistory WHERE LoginTime >= {since_dt} "
            "ORDER BY LoginTime DESC LIMIT 100"
        )
        records = await self._soql_query(client, soql)
        geo_ids = [r.get("LoginGeoId") for r in records if r.get("LoginGeoId")]
        await self._resolve_login_geos(client, geo_ids)

        for r in records:
            rec_id = r.get("Id")
            if not rec_id:
                continue
            evt_id = f"sf-login-{rec_id[-10:]}"
            ts = self._parse_sf_datetime(r.get("LoginTime"))
            username = self._resolve_username(r.get("UserId"))
            status = r.get("Status") or "Success"
            app_name = r.get("Application") or r.get("Browser") or r.get("LoginType") or "Interactive"
            source_ip = self._clean_source_ip(r.get("SourceIp"))
            tls_proto = r.get("TlsProtocol") or "TLSv1.3"
            cipher = r.get("CipherSuite") or ""

            geo_info = GeoInfo()
            geo_id = r.get("LoginGeoId")
            if geo_id and geo_id in self._geo_map:
                g = self._geo_map[geo_id]
                geo_info = GeoInfo(
                    lat=g.get("lat"),
                    lon=g.get("lon"),
                    city=g.get("city"),
                    country=g.get("country") or r.get("CountryIso"),
                )
            elif r.get("CountryIso"):
                geo_info = GeoInfo(country=r.get("CountryIso"))

            anomaly: Optional[AnomalyInfo] = None
            if status != "Success":
                sev = Severity.HIGH if "Password" in status or "Lockout" in status else Severity.MEDIUM
                anomaly = AnomalyInfo(
                    is_anomaly=True,
                    severity=sev,
                    title=f"Salesforce Login Failure: {status}",
                    description=(
                        f"Failed login attempt for user '{username}' from IP {source_ip} "
                        f"via {app_name} ({r.get('Platform') or 'Unknown OS'}). Status: {status}."
                    ),
                    rule="sf_auth_failure",
                    tags=["salesforce", "login-history", "auth-failure"],
                )
            elif tls_proto in ("TLS 1.0", "TLS 1.1", "TLSv1", "TLSv1.1"):
                anomaly = AnomalyInfo(
                    is_anomaly=True,
                    severity=Severity.MEDIUM,
                    title=f"Weak TLS Protocol ({tls_proto}) on Salesforce Login",
                    description=f"User '{username}' authenticated using deprecated {tls_proto} from {source_ip}.",
                    rule="sf_weak_tls",
                    tags=["salesforce", "tls-audit"],
                )

            evt = ConnectionEvent(
                id=evt_id,
                source_collector="salesforce_login",
                direction=Direction.INBOUND,
                state=State.ACTIVE if status == "Success" else State.CLOSED,
                protocol=Protocol.HTTPS,
                transport="tcp",
                local=LocalEndpoint(
                    pid=443,
                    process_name=f"SFDC Login · {app_name}",
                    user=username,
                    host=self._tenant_hostname,
                    port=443,
                ),
                remote=RemoteEndpoint(
                    ip=source_ip,
                    hostname=r.get("LoginUrl") or self._tenant_hostname,
                    port=443,
                ),
                geo=geo_info,
                asn=AsnInfo(org="Salesforce Cloud Identity"),
                service=ServiceInfo(
                    name=f"Salesforce ({self.org_name or 'Tenant'})",
                    category=ServiceCategory.CRM,
                ),
                metrics=Metrics(
                    bytes_in=2480,
                    bytes_out=6840 if status == "Success" else 1420,
                    packets=12,
                    first_seen=ts,
                    last_seen=ts,
                ),
                http=HttpMeta(
                    method="POST",
                    url_path=f"/login/{r.get('LoginType') or 'Application'} [{status}]",
                    status_code=200 if status == "Success" else 401,
                    content_type=f"{tls_proto} {cipher}".strip(),
                ),
                anomaly=anomaly,
            )
            events.append(evt)

        return events

    async def _poll_auth_sessions(self, client: httpx.AsyncClient) -> list[ConnectionEvent]:
        """Poll active `AuthSession` records in the Salesforce org."""
        events: list[ConnectionEvent] = []
        soql = (
            "SELECT Id, UsersId, CreatedDate, LastModifiedDate, NumSecondsValid, "
            "UserType, SourceIp, SessionType, SessionSecurityLevel, LoginType, LoginGeoId "
            "FROM AuthSession ORDER BY LastModifiedDate DESC LIMIT 80"
        )
        records = await self._soql_query(client, soql)
        geo_ids = [r.get("LoginGeoId") for r in records if r.get("LoginGeoId")]
        await self._resolve_login_geos(client, geo_ids)

        for r in records:
            rec_id = r.get("Id")
            if not rec_id:
                continue
            evt_id = f"sf-sess-{rec_id[-10:]}"
            first_ts = self._parse_sf_datetime(r.get("CreatedDate"))
            last_ts = self._parse_sf_datetime(r.get("LastModifiedDate") or r.get("CreatedDate"))
            username = self._resolve_username(r.get("UsersId"))
            session_type = r.get("SessionType") or r.get("LoginType") or "UI"
            sec_level = r.get("SessionSecurityLevel") or "STANDARD"
            source_ip = self._clean_source_ip(r.get("SourceIp"))

            geo_info = GeoInfo()
            geo_id = r.get("LoginGeoId")
            if geo_id and geo_id in self._geo_map:
                g = self._geo_map[geo_id]
                geo_info = GeoInfo(
                    lat=g.get("lat"),
                    lon=g.get("lon"),
                    city=g.get("city"),
                    country=g.get("country"),
                )

            evt = ConnectionEvent(
                id=evt_id,
                source_collector="salesforce_session",
                direction=Direction.INBOUND,
                state=State.ACTIVE,
                protocol=Protocol.HTTPS,
                transport="tcp",
                local=LocalEndpoint(
                    pid=443,
                    process_name=f"SFDC Session · {session_type}",
                    user=username,
                    host=self._tenant_hostname,
                    port=443,
                ),
                remote=RemoteEndpoint(
                    ip=source_ip,
                    hostname=self._tenant_hostname,
                    port=443,
                ),
                geo=geo_info,
                asn=AsnInfo(org="Salesforce Active Session"),
                service=ServiceInfo(
                    name=f"Salesforce Session ({sec_level})",
                    category=ServiceCategory.CRM,
                ),
                metrics=Metrics(
                    bytes_in=14200,
                    bytes_out=48900,
                    packets=34,
                    first_seen=first_ts,
                    last_seen=last_ts,
                ),
                http=HttpMeta(
                    method="SESSION",
                    url_path=f"/session/{session_type} (Level: {sec_level})",
                    status_code=200,
                    content_type=r.get("UserType") or "Standard",
                ),
            )
            events.append(evt)

        return events

    async def _poll_setup_audit_trail(self, client: httpx.AsyncClient) -> list[ConnectionEvent]:
        """Poll `SetupAuditTrail` for administrative & security configuration changes."""
        events: list[ConnectionEvent] = []
        since_dt = (datetime.now(timezone.utc) - timedelta(days=self.config.lookback_days)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        soql = (
            "SELECT Id, Action, Section, CreatedDate, CreatedById, Display, DelegateUser "
            f"FROM SetupAuditTrail WHERE CreatedDate >= {since_dt} "
            "ORDER BY CreatedDate DESC LIMIT 60"
        )
        records = await self._soql_query(client, soql)

        sensitive_keywords = (
            "permset",
            "profile",
            "password",
            "token",
            "connectedapp",
            "oauth",
            "certificate",
            "sharing",
            "loginaccess",
            "twofactor",
            "mfa",
            "cors",
            "remotesite",
            "namedcredential",
            "delete",
        )

        for r in records:
            rec_id = r.get("Id")
            if not rec_id:
                continue
            evt_id = f"sf-audit-{rec_id[-10:]}"
            ts = self._parse_sf_datetime(r.get("CreatedDate"))
            username = self._resolve_username(r.get("CreatedById"))
            action = r.get("Action") or "SetupChange"
            section = r.get("Section") or "Administration"
            display = r.get("Display") or action

            anomaly: Optional[AnomalyInfo] = None
            combined_lower = f"{action} {section} {display}".lower()
            if any(k in combined_lower for k in sensitive_keywords):
                sev = (
                    Severity.HIGH
                    if any(k in combined_lower for k in ("permset", "profile", "password", "oauth", "sharing"))
                    else Severity.MEDIUM
                )
                anomaly = AnomalyInfo(
                    is_anomaly=True,
                    severity=sev,
                    title=f"Salesforce Admin Change: {section}",
                    description=f"[{action}] {display} (by {username})",
                    rule="sf_setup_audit",
                    tags=["salesforce", "setup-audit", action],
                )

            evt = ConnectionEvent(
                id=evt_id,
                source_collector="salesforce_audit",
                direction=Direction.OUTBOUND,
                state=State.ACTIVE,
                protocol=Protocol.HTTPS,
                transport="tcp",
                local=LocalEndpoint(
                    pid=443,
                    process_name=f"SFDC Setup · {section}",
                    user=username,
                    host=self._tenant_hostname,
                    port=443,
                ),
                remote=RemoteEndpoint(
                    ip=self._tenant_ip,
                    hostname=self._tenant_hostname,
                    port=443,
                ),
                asn=AsnInfo(org="Salesforce Setup Audit Trail"),
                service=ServiceInfo(
                    name=f"Salesforce Admin ({section})",
                    category=ServiceCategory.CRM,
                ),
                metrics=Metrics(
                    bytes_in=1850,
                    bytes_out=4200,
                    packets=8,
                    first_seen=ts,
                    last_seen=ts,
                ),
                http=HttpMeta(
                    method="AUDIT",
                    url_path=f"/setup/{section}/{action}: {display[:90]}",
                    status_code=200,
                    content_type="SetupAuditTrail",
                ),
                anomaly=anomaly,
            )
            events.append(evt)

        return events

    async def _poll_event_monitoring(self, client: httpx.AsyncClient) -> list[ConnectionEvent]:
        """
        Adaptively poll Salesforce Event Monitoring (`ReportEvent`, `ApiEvent`, `EventLogFile`).
        Gracefully handles editions where real-time Shield objects are not licensed.
        """
        events: list[ConnectionEvent] = []

        # 1. Try ReportEvent (Real-Time Event Monitoring for DLP / Report Exports)
        try:
            rpt_records = await self._soql_query(
                client,
                "SELECT Id, EventDate, UserId, Username, SourceIp, Name, RowsProcessed, Operation "
                "FROM ReportEvent ORDER BY EventDate DESC LIMIT 40",
            )
            for r in rpt_records:
                rec_id = r.get("Id")
                if not rec_id:
                    continue
                evt_id = f"sf-rpt-{rec_id[-10:]}"
                ts = self._parse_sf_datetime(r.get("EventDate"))
                username = r.get("Username") or self._resolve_username(r.get("UserId"))
                rows = int(r.get("RowsProcessed") or 0)
                op = r.get("Operation") or "ReportRun"
                report_name = r.get("Name") or "CRM Report"
                source_ip = self._clean_source_ip(r.get("SourceIp"))

                anomaly: Optional[AnomalyInfo] = None
                if "Export" in op or rows >= 500:
                    anomaly = AnomalyInfo(
                        is_anomaly=True,
                        severity=Severity.CRITICAL if rows >= 2000 or "Export" in op else Severity.HIGH,
                        title=f"Salesforce Report DLP Alert ({op})",
                        description=f"User '{username}' executed {op} on '{report_name}' ({rows:,} rows) from {source_ip}.",
                        rule="sf_report_dlp",
                        tags=["salesforce", "dlp", "report-export"],
                    )

                events.append(
                    ConnectionEvent(
                        id=evt_id,
                        source_collector="salesforce_report",
                        direction=Direction.INBOUND,
                        state=State.ACTIVE,
                        protocol=Protocol.HTTPS,
                        transport="tcp",
                        local=LocalEndpoint(
                            pid=443,
                            process_name=f"SFDC Report · {op}",
                            user=username,
                            host=self._tenant_hostname,
                            port=443,
                        ),
                        remote=RemoteEndpoint(
                            ip=source_ip,
                            hostname=self._tenant_hostname,
                            port=443,
                        ),
                        service=ServiceInfo(
                            name=f"Salesforce DLP ({report_name[:40]})",
                            category=ServiceCategory.CRM,
                        ),
                        metrics=Metrics(
                            bytes_in=max(4096, rows * 512),
                            bytes_out=2048,
                            packets=max(10, rows // 10),
                            first_seen=ts,
                            last_seen=ts,
                        ),
                        http=HttpMeta(
                            method="EXPORT" if "Export" in op else "REPORT",
                            url_path=f"/analytics/reports/{report_name} ({rows} rows)",
                            status_code=200,
                            content_type="ReportEvent",
                        ),
                        anomaly=anomaly,
                    )
                )
        except Exception:
            pass

        # 2. Try ApiEvent (Real-Time API query telemetry)
        try:
            api_records = await self._soql_query(
                client,
                "SELECT Id, EventDate, UserId, Username, SourceIp, ApiType, Application, "
                "Operation, QueriedEntities, RowsProcessed "
                "FROM ApiEvent ORDER BY EventDate DESC LIMIT 40",
            )
            for r in api_records:
                rec_id = r.get("Id")
                if not rec_id:
                    continue
                evt_id = f"sf-api-{rec_id[-10:]}"
                ts = self._parse_sf_datetime(r.get("EventDate"))
                username = r.get("Username") or self._resolve_username(r.get("UserId"))
                rows = int(r.get("RowsProcessed") or 0)
                entities = r.get("QueriedEntities") or "SObject"
                op = r.get("Operation") or "Query"
                api_type = r.get("ApiType") or "REST"
                source_ip = self._clean_source_ip(r.get("SourceIp"))

                anomaly = None
                if rows >= 1000:
                    anomaly = AnomalyInfo(
                        is_anomaly=True,
                        severity=Severity.HIGH if rows >= 5000 else Severity.MEDIUM,
                        title=f"Bulk Salesforce API Extraction ({rows:,} rows)",
                        description=f"User '{username}' queried {rows:,} records from {entities} via {api_type} ({op}).",
                        rule="sf_bulk_api",
                        tags=["salesforce", "api-event", "bulk-query"],
                    )

                events.append(
                    ConnectionEvent(
                        id=evt_id,
                        source_collector="salesforce_api",
                        direction=Direction.INBOUND,
                        state=State.ACTIVE,
                        protocol=Protocol.HTTPS,
                        transport="tcp",
                        local=LocalEndpoint(
                            pid=443,
                            process_name=f"SFDC {api_type} API · {op}",
                            user=username,
                            host=self._tenant_hostname,
                            port=443,
                        ),
                        remote=RemoteEndpoint(
                            ip=source_ip,
                            hostname=self._tenant_hostname,
                            port=443,
                        ),
                        service=ServiceInfo(
                            name=f"Salesforce {api_type} ({entities})",
                            category=ServiceCategory.CRM,
                        ),
                        metrics=Metrics(
                            bytes_in=max(2048, rows * 380),
                            bytes_out=1500,
                            packets=max(6, rows // 15),
                            first_seen=ts,
                            last_seen=ts,
                        ),
                        http=HttpMeta(
                            method=op.upper(),
                            url_path=f"/services/data/{SF_API_VERSION}/query [{entities}] ({rows} rows)",
                            status_code=200,
                            content_type=api_type,
                        ),
                        anomaly=anomaly,
                    )
                )
        except Exception:
            pass

        # 3. Query EventLogFile (Available on Developer & Enterprise orgs for Event Monitoring logs)
        try:
            elf_records = await self._soql_query(
                client,
                "SELECT Id, EventType, LogDate, LogFileLength, CreatedDate "
                "FROM EventLogFile ORDER BY LogDate DESC LIMIT 25",
            )
            for r in elf_records:
                rec_id = r.get("Id")
                if not rec_id:
                    continue
                evt_id = f"sf-elf-{rec_id[-10:]}"
                ts = self._parse_sf_datetime(r.get("CreatedDate") or r.get("LogDate"))
                event_type = r.get("EventType") or "API"
                log_bytes = int(r.get("LogFileLength") or 4096)
                is_report = "Report" in event_type

                events.append(
                    ConnectionEvent(
                        id=evt_id,
                        source_collector="salesforce_report" if is_report else "salesforce_api",
                        direction=Direction.OUTBOUND,
                        state=State.ACTIVE,
                        protocol=Protocol.HTTPS,
                        transport="tcp",
                        local=LocalEndpoint(
                            pid=443,
                            process_name=f"SFDC EventLog · {event_type}",
                            user=self.authenticated_username or "salesforce-event-monitor",
                            host=self._tenant_hostname,
                            port=443,
                        ),
                        remote=RemoteEndpoint(
                            ip=self._tenant_ip,
                            hostname=self._tenant_hostname,
                            port=443,
                        ),
                        service=ServiceInfo(
                            name=f"Salesforce EventLogFile ({event_type})",
                            category=ServiceCategory.CRM,
                        ),
                        metrics=Metrics(
                            bytes_in=log_bytes,
                            bytes_out=1024,
                            packets=max(4, log_bytes // 1400),
                            first_seen=ts,
                            last_seen=ts,
                        ),
                        http=HttpMeta(
                            method="GET",
                            url_path=f"/services/data/{SF_API_VERSION}/sobjects/EventLogFile/{rec_id}/LogFile",
                            status_code=200,
                            resp_size=log_bytes,
                            content_type=f"EventLogFile/{event_type}",
                        ),
                    )
                )
        except Exception:
            pass

        return events

    # ── Sync Cycle ─────────────────────────────────────────────────────

    async def sync_once(self) -> dict[str, Any]:
        """Run one complete collection cycle across all enabled Salesforce telemetry streams."""
        if not self._connected:
            await self.authenticate()

        new_events: list[ConnectionEvent] = []
        stream_counts: dict[str, int] = {}

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            await self._refresh_user_map(client)

            # 1. LoginHistory
            if self.config.streams.login_history:
                try:
                    lh_events = await self._poll_login_history(client)
                    stream_counts["login_history"] = len(lh_events)
                    self.stream_health["login_history"] = StreamHealth(
                        enabled=True,
                        status="active",
                        events_ingested=len(lh_events),
                        last_message=f"Synced {len(lh_events)} LoginHistory records",
                    )
                    new_events.extend(lh_events)
                except Exception as exc:
                    self.stream_health["login_history"] = StreamHealth(
                        enabled=True,
                        status="error",
                        last_message=str(exc)[:160],
                    )

            # 2. AuthSession
            if self.config.streams.auth_session:
                try:
                    as_events = await self._poll_auth_sessions(client)
                    stream_counts["auth_session"] = len(as_events)
                    self.stream_health["auth_session"] = StreamHealth(
                        enabled=True,
                        status="active",
                        events_ingested=len(as_events),
                        last_message=f"Synced {len(as_events)} active AuthSession records",
                    )
                    new_events.extend(as_events)
                except Exception as exc:
                    self.stream_health["auth_session"] = StreamHealth(
                        enabled=True,
                        status="error",
                        last_message=str(exc)[:160],
                    )

            # 3. SetupAuditTrail
            if self.config.streams.setup_audit:
                try:
                    sa_events = await self._poll_setup_audit_trail(client)
                    stream_counts["setup_audit"] = len(sa_events)
                    self.stream_health["setup_audit"] = StreamHealth(
                        enabled=True,
                        status="active",
                        events_ingested=len(sa_events),
                        last_message=f"Synced {len(sa_events)} SetupAuditTrail entries",
                    )
                    new_events.extend(sa_events)
                except Exception as exc:
                    self.stream_health["setup_audit"] = StreamHealth(
                        enabled=True,
                        status="error",
                        last_message=str(exc)[:160],
                    )

            # 4. Event Monitoring (ReportEvent / ApiEvent / EventLogFile)
            if self.config.streams.event_monitoring:
                try:
                    em_events = await self._poll_event_monitoring(client)
                    stream_counts["event_monitoring"] = len(em_events)
                    self.stream_health["event_monitoring"] = StreamHealth(
                        enabled=True,
                        status="active" if em_events else "connected",
                        events_ingested=len(em_events),
                        last_message=(
                            f"Synced {len(em_events)} Event Monitoring logs"
                            if em_events
                            else "Connected (0 EventLogFile / Shield events in window)"
                        ),
                    )
                    new_events.extend(em_events)
                except Exception as exc:
                    self.stream_health["event_monitoring"] = StreamHealth(
                        enabled=True,
                        status="unsupported",
                        last_message=str(exc)[:160],
                    )

        # Dispatch events through SignalMap's enrichment + store + WebSocket pipeline
        dispatched_count = 0
        for evt in new_events:
            if evt.id not in self._seen_event_ids:
                self._seen_event_ids.add(evt.id)
                self.total_ingested += 1
                if evt.anomaly and evt.anomaly.is_anomaly:
                    self.threats_detected += 1
                dispatched_count += 1
                if self._on_event_callback:
                    await self._on_event_callback(evt)
                else:
                    await self._queue.put(evt)

        self.last_sync = datetime.now(timezone.utc).isoformat()
        return {
            "synced_at": self.last_sync,
            "fetched_count": len(new_events),
            "new_events_dispatched": dispatched_count,
            "total_ingested": self.total_ingested,
            "threats_detected": self.threats_detected,
            "stream_counts": stream_counts,
        }

    # ── Background Polling Loop (`BaseCollector` contract) ─────────────

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self.sync_once()
            except Exception as exc:
                self.last_error = str(exc)
                print(f"* [Salesforce Collector] Poll error: {exc}")
            await asyncio.sleep(max(10, self.config.poll_interval))

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def events(self) -> AsyncIterator[ConnectionEvent]:
        while self._running:
            evt = await self._queue.get()
            yield evt

    def get_status(self) -> dict[str, Any]:
        """Return safe status & masked configuration for the frontend UI."""
        has_creds = bool(
            self.config.access_token
            or (self.config.username and self.config.password)
            or (self.config.client_id and self.config.client_secret)
            or self.config.auth_mode == "sf_cli"
        )
        return {
            "configured": has_creds,
            "connected": self._connected,
            "polling": self._running,
            "auth_mode": self.config.auth_mode,
            "login_url": self.config.login_url,
            "instance_url": self._instance_url or self.config.instance_url,
            "tenant_hostname": self._tenant_hostname if self._connected else None,
            "tenant_ip": self._tenant_ip if self._connected else None,
            "org_id": self.org_id,
            "org_name": self.org_name,
            "org_edition": self.org_edition,
            "is_sandbox": self.is_sandbox,
            "username": self.authenticated_username or self.config.username or None,
            "cli_alias": self.config.cli_alias,
            "has_client_id": bool(self.config.client_id),
            "has_client_secret": bool(self.config.client_secret),
            "has_password": bool(self.config.password),
            "has_security_token": bool(self.config.security_token),
            "has_access_token": bool(self.config.access_token),
            "poll_interval": self.config.poll_interval,
            "lookback_days": self.config.lookback_days,
            "last_sync": self.last_sync,
            "last_error": self.last_error,
            "total_ingested": self.total_ingested,
            "threats_detected": self.threats_detected,
            "streams": {k: v.model_dump() for k, v in self.stream_health.items()},
        }


# Singleton collector instance
salesforce_collector = SalesforceCollector()

