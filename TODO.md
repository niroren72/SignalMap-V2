# 📋 SignalMap — Project Todo & Backlog

> **Workspace**: `c:\Users\User\Documents\MyProject\Antigravity DevEX`  
> **Project**: SignalMap (`signalmap/`) — Real-Time Network Telemetry & 3D Threat Observability  
> **Last Updated**: 2026-10-30

---

## ✅ Recently Completed
- [x] **Antigravity WebGL Particle Loading Screen**: Replaced floating cards with GPGPU WebGL particle shader & 2D Poisson-disk dot field (`LoadingScreen.tsx`, `HolographicCardLogo.tsx`).
- [x] **Minimalist Logo Card Polish**: Removed outer rings, glowing circles, frame text (`AERO-01`, `V4.8`, `LEVEL 5`), `v4.8-aero` badges, and `"READY // CLICK..."` prompts (`LoadingScreen.tsx`, `Header.tsx`).
- [x] **Telemetry Grid Data Source Column**: Added sortable, searchable **DATA SOURCE** badge column (`🪟 Windows Socket`, `📡 Windows UDP Table`, `🌐 Windows DNS Cache`, `📄 Windows EVTX`, `☁️ Salesforce API`, `👤 HRIS Identity Mesh`, etc.) to `ConnectionTable.tsx` and `LiveConnectionTable.tsx`.
- [x] **Windows External Multi-Protocol Monitoring**:
  - Upgraded `PsutilSocketCollector` (`socket_collector.py`) to capture all non-loopback TCP states (`ESTABLISHED`, `SYN_SENT`, `SYN_RECV`, `CLOSE_WAIT`, `FIN_WAIT1`, `FIN_WAIT2`, `TIME_WAIT`, `CLOSING`, `LAST_ACK`), active Windows UDP sockets (`windows_udp`), and live Windows DNS Resolver Cache entries (`ipconfig /displaydns` -> `windows_dns`).
  - Added full protocol classification & FilterBar pills with live counts across `HTTPS`, `HTTP`, `TCP`, `UDP`, `QUIC`, `DNS`, `WS`, `WSS`, `NTP`, `SSH`, `RDP`, and `SMB`.
  - Eliminated synchronous reverse-DNS (`socket.gethostbyaddr`) event-loop blocking in `enrichment.py` and fixed `_clients` `UnboundLocalError` in `ws.py`.

---

## 🔥 Priority 1 — Core Windows Telemetry & Deep Visibility (`P1`)
- [x] **Deep Data Inspection & Data Visibility Suite**:
  - [x] **Multi-Tab Event Inspector (`DetailPanel.tsx` & Telemetry Grid)**: Added structured inspection tabs for *Formatted Overview*, *AI Forensics*, *Payload Stream (Hex & ASCII)*, *Protocol / TLS / HTTP / DNS Headers*, and *Raw JSON & Forensics*.
  - [x] **AI Forensics & Incident Briefing Engine (`aiForensics.ts`)**: Built instant, zero-latency hybrid heuristic AI intelligence engine analyzing process reputation, port/protocol, GeoIP/ASN, wire throughput, and sensitive PII findings. Features Hero AI Briefing Card on Overview tab, 5th tab `🧠 AI Forensics`, MITRE ATT&CK Matrix mapping (`T1041`, `T1059`, `T1021`, `T1071`), 4-pillar forensic breakdown (Process, Network, Data/PII, Defensive Protocol), direct remediation triggers (`Terminate PID`, `Block IP`), and 1-click Markdown incident export.
  - [x] **Bidirectional Hex Dump & ASCII Packet Viewer**: Interactive 3-column Wireshark/xxd hex viewer (`00000000`, Hex bytes, ASCII) with stream direction filtering (`↗ Outbound`, `↙ Inbound`), format toggles (`Hex Dump`, `Formatted Text`, `Raw Stream`), in-payload search, cURL export, and JSON download.
  - [x] **Built-in PII Detection & Redaction Engine**: Automated inspection for sensitive personal and authentication data (Emails, Credit Card / PAN, SSN, API Keys / Bearer Tokens / JWTs, Passwords, Phone numbers) with real-time severity scoring, PII breakdown drawer, and interactive `Mask PII: ON / OFF` toggle.
  - [x] **Docking & Canvas Geometry Expansion**: One-click toggle between **Side Drawer** (480px ⇄ 840px wide) and **Bottom DevTools Shelf** (420px ⇄ 640px tall).
  - [x] **Field-Level Click-to-Filter Inspection**: Click any process name, PID, user, ASN, port, or protocol to immediately pivot/filter across SignalMap.
- [ ] **Visual Data Coverage & Distribution Strip**: Add interactive visual breakdowns above the Telemetry Grid (protocol distribution bar, data source ingestion share, top processes/ASNs/countries, and enrichment completeness indicators for GeoIP/DNS/ASN/User attribution).
- [ ] **Help & Documentation Tab (`DocsView.tsx`)**:
  - [ ] Add a dedicated **Documentation / Help** navigation tab in `Header.tsx` and `Sidebar.tsx`.
  - [ ] **Connector & Module Requirements Matrix**: Document every connector (`Windows Endpoint`, `Windows EVTX / Sysmon`, `Salesforce Event Monitoring`, `HRIS / Workday / BambooHR / Okta`, `AWS VPC Flow Logs`, `macOS / Linux Daemon`) with:
    - **Required Permissions & Privileges** (e.g., Windows Administrator elevation, `SeSecurityPrivilege` for Security Event Log `5156`/`5157`, OAuth 2.0 `API` + `View Event Log Files` scopes for Salesforce, SCIM/Directory read scopes for HRIS, IAM roles for CloudWatch/S3).
    - **Required OS Features & Installed Dependencies** (e.g., Windows Filtering Platform audit policy `auditpol /set /subcategory:"Filtering Platform Connection"`, Sysmon installation & Event ID `3` XML schema, `Npcap` driver for raw packet/SNI inspection, `python-evtx` for binary `.evtx` parsing).
    - **Interactive Host Readiness Check & Copyable Setup Commands**: Live status checks indicating which permissions, Windows audit policies, and optional drivers/packages are active on the local machine, with one-click copyable PowerShell/CLI commands to enable missing features.
- [ ] **Live Windows Event Log (EVTX / WFP) Streamer**:
  - [ ] Add real-time subscription to Windows Security Event `5156` / `5157` (Windows Filtering Platform permit/block) and `Microsoft-Windows-Sysmon/Operational` Event `3` (Network Connect) without requiring manual `.evtx` file uploads.
  - [ ] Correlate WFP blocked connection events (`5157`) directly into the Telemetry Grid with a `BLOCKED` status badge.
- [ ] **ETW (Event Tracing for Windows) Network & DNS Provider**:
  - [ ] Subscribe to `Microsoft-Windows-DNS-Client` ETW provider to capture exact originating PID for every DNS query in real time.
  - [ ] Subscribe to `Microsoft-Windows-TCPIP` ETW provider for exact per-connection byte/packet counters instead of per-process IO estimation.
- [ ] **TLS SNI & HTTP Host Header Inspection**:
  - [ ] Extract TLS ClientHello `Server Name Indication (SNI)` when raw packet capture (`scapy` / `npcap`) is enabled so encrypted HTTPS/QUIC flows always show the exact target domain.
- [ ] **Active Host Remediation & Firewall Rule Manager**:
  - [ ] Expand `signalmap/agent/api/actions.py` with a dedicated UI drawer to view, toggle, and roll back `netsh advfirewall` block rules created from SignalMap.
  - [ ] Add process tree inspection (parent PID, command-line arguments, binary SHA-256 hash, and Authenticode signature verification) inside `DetailPanel.tsx`.

---

## 🔌 Priority 2 — Multi-Source Module Connectors (`P2`)
- [x] **Salesforce Cloud Security Connector (`salesforce`)**:
  - [x] Build live OAuth 2.0 / SOAP Partner `login()` / Access Token / `sf` CLI + REST SOQL connector for Salesforce `LoginHistory` (`LoginGeo`), `AuthSession`, `SetupAuditTrail`, `ReportEvent`, `ApiEvent`, and `EventLogFile` streams (`signalmap/agent/collectors/salesforce_collector.py` & `signalmap/agent/api/connectors.py`).
  - [x] Add interactive UI configuration modal (`SalesforceConfigModal.tsx`) in `ModulesView.tsx` for Salesforce instance URL, multi-mode authentication, live stream toggles, and on-demand sync.
- [ ] **HRIS & Identity Mesh Connector (`hris` / `okta`)**:
  - [ ] Integrate Workday / BambooHR / Okta System Log webhook & polling collector to correlate network sockets with employee status (e.g., terminated/on-leave user alerts, impossible travel geo-logins).
- [ ] **Cloud VPC Flow Logs Connector (`cloud` / `aws`)**:
  - [ ] Add parser & S3/CloudWatch streamer for AWS VPC Flow Logs, AWS GuardDuty findings, and GCP/Azure NSG flow logs.
- [ ] **macOS & Linux Endpoint Daemon (`macos`)**:
  - [ ] Implement cross-platform collector support using `lsof` / `netstat` / `ss`, `pfctl` state tables on macOS, and `eBPF` / `auditd` socket tracing on Linux.

---

## 🛡️ Priority 3 — Threat Intelligence & Detection Engine (`P3`)
- [ ] **External Threat Intelligence Feeds**:
  - [ ] Integrate optional API key enrichment for **AbuseIPDB**, **VirusTotal**, **GreyNoise**, and **AlienVault OTX** in `enrichment.py` with local SQLite caching.
  - [ ] Bundle an offline IP reputation blocklist (e.g., Feodo Tracker, Emerging Threats, Tor exit nodes, known C2 IPs) for zero-config threat scoring.
- [ ] **Interactive Detection Rules Editor**:
  - [ ] Add a UI tab or modal to view, edit, test, and hot-reload `signalmap/rules/services.yaml` and `signalmap/rules/threat_signatures.yaml`.
  - [ ] Add MITRE ATT&CK tactic/technique badges and filter chips in the Telemetry Grid and `DetailPanel.tsx`.
- [ ] **Alerting & Outbound Webhooks**:
  - [ ] Trigger desktop notifications, audio cues, and outbound Slack / Discord / PagerDuty / generic SIEM webhooks when `critical` or `high` severity anomalies occur.

---

## 🌍 Priority 4 — 3D Visualization, UX & Performance (`P4`)
- [ ] **Frontend Bundle Code-Splitting**:
  - [ ] Configure `manualChunks` / dynamic `import()` in `signalmap/web/vite.config.ts` for `three`, `globe.gl`, and `react-force-graph-3d` to eliminate the `> 500 kB` Vite build chunk warning.
- [ ] **3D Globe & Topology Enhancements**:
  - [ ] Add destination arc clustering and country heatmap layer toggles on `GlobeView.tsx` for high-density traffic (>500 concurrent connections).
  - [ ] Add protocol-colored animated particle speed scaling based on real-time connection throughput (`bytes_in + bytes_out`).
- [ ] **Historical Playback & Forensics**:
  - [ ] Connect `PlaybackView.tsx` time-range presets (`5m`, `15m`, `1h`, `24h`, custom date picker) directly to `/api/events?from_time=...&to_time=...` SQLite queries for deep historical scrubbing.
  - [ ] Add filtered export (export only currently filtered/searched rows in `ConnectionTable.tsx` to CSV/JSON/Markdown report).
- [ ] **Automated Test Suite**:
  - [ ] Add `pytest` unit tests for `socket_collector.py`, `enrichment.py`, `anomaly.py`, and log parsers (`nginx.py`, `jsonl.py`, `windows_evtx.py`).
  - [ ] Add Vitest / Playwright component tests for `ConnectionTable`, `FilterBar`, and `ModulesView`.

