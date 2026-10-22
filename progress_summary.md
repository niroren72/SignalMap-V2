# SignalMap — Progress Summary

## 📌 Current Status: Phase 0, Phase 1 & Phase 2 Complete

SignalMap has evolved from initial mock prototyping into a fully operational, real-time network traffic visualization engine with local socket tracking, security threat detection, historical playback, and multi-format log importing.

---

## 🚀 Accomplishments & Features Built

### 1. Live Socket Collection & Bandwidth Metrics (`agent/collectors/`)
- **`PsutilSocketCollector`**: Polls active TCP/UDP connections across the OS, mapping sockets to parent process IDs and binary names (`chrome.exe`, `python.exe`, etc.).
- **Netstat Fallback**: Includes automated Windows `netstat -ano` fallback if low-privilege execution restricts full process handles.
- **Real-Time Bandwidth I/O Deltas**: Tracks system network I/O counters via `psutil.net_io_counters()` to measure delta throughput (`bytes_in`, `bytes_out`, `packets`).

### 2. Intelligent Data Enrichment (`agent/enrichment.py`)
- **GeoIP & ASN Mapping**: Offline MaxMind GeoLite2 (`.mmdb`) resolution with auto-download fallback and deterministic coordinates for unmapped public IP blocks.
- **Reverse DNS**: Automatic PTR hostname resolution with in-memory caching.
- **Service Classification**: Configurable YAML rules engine ([`rules/services.yaml`](./rules/services.yaml)) mapping domains and endpoints to human-friendly categories (`dev`, `cloud`, `cdn`, `comms`, `finance`, `crm`).

### 3. Threat Detection & Anomaly Engine (`agent/anomaly.py`)
- **Suspicious Process Outbound**: Identifies living-off-the-land binaries making external connections (`powershell.exe`, `cmd.exe`, `rundll32.exe`, `regsvr32.exe`, `certutil.exe`, `mshta.exe`, `vssadmin.exe`).
- **High-Risk & C2 Ports**: Detects traffic to known backdoor/trojan ports (`4444`, `1337`, `31337`, `6667`, `5555`, `23`).
- **SMB WAN Leaks**: Alerts on outbound SMB/CIFS traffic over public internet (ports `445`, `139`).
- **High Bandwidth Spikes**: Flags single-connection transfers exceeding 100MB.
- **Direct Non-Standard IP Connections**: Flags direct outbound traffic to unclassified external raw IPs.

### 4. Log Parsing & Offline Ingestion (`agent/parsers/`)
- **Windows EVTX Parser** (`windows_evtx.py`): Parses Windows Security & Sysmon event logs (Events 4624, 4625, 5156, etc.).
- **Nginx Access Log Parser** (`nginx.py`): Ingests combined access logs with geo and status code mappings.
- **JSON Lines Parser** (`jsonl.py`): Universal schema-compliant network event ingestion.
- **Upload API & Modal**: Drag-and-drop log import modal in frontend with instant visualization.

### 5. Persistence & Query Layer (`agent/store/sqlite_store.py`)
- **SQLite Database with WAL Mode**: High-concurrency storage in `data/events.db`.
- **Indices & Filtering**: Indexed by `timestamp`, `protocol`, `is_anomaly`, `severity`, and `process_name`.
- **Time-Bucketed Aggregation**: Aggregates histogram/density buckets for timeline visualization.
- **CSV & JSON Exporter**: Export endpoints on `/api/events/export`.

### 6. Interactive Visualizer Frontend (`web/`)
- **Left Navigation Sidebar (`Sidebar.tsx`)**: Unified navigation with tabs for 3D Globe, 3D Topology, and Connections Grid, plus action buttons for log ingestion and settings modal.
- **3D Globe (`GlobeView.tsx`)**: Clean Earth rendering with illuminated atmosphere (`globe.gl`), animated connection arcs, dynamic threat color coding (crimson/rose/amber), and HTML tooltips.
- **3D Topology Graph (`GraphView.tsx`)**: Process-to-service clustering force graph (`react-force-graph-3d`) with pulsating threat highlights.
- **Dedicated Connections Grid (`TableView.tsx` & `ConnectionTable.tsx`)**: Full-screen telemetry data grid with top KPI metrics (Total Sockets, Active Threats, Distinct Processes, Countries Reached), multi-column sorting, inline search, copy IP, and CSV/JSON export.
- **System Settings Modal (`SettingsModal.tsx`)**: Configuration modal for WebSocket stream rate, anomaly thresholds, 3D display glow/rotation preferences, and buffer flushing.
- **Historical Timeline Scrubber (`TimelineBar.tsx`)**: Dedicated 3D playback scrubber with Play/Pause controls (`1x`, `2x`, `5x`, `10x`), presets (`5m`, `15m`, `1h`, `24h`, `All`), and traffic density histogram.
- **Advanced Filter Bar (`FilterBar.tsx`)**: Full-text search, protocol pills, category selector, threat toggle, and export menu.
- **Security Detail Panel (`DetailPanel.tsx`)**: Slide-over panel with Security Assessment cards, MITRE tags, throughput graphs, and ASN info.

### 7. Hybrid Orchestration Protocol (`AGENTS.md`)
- **Ollama MCP Dispatch Integration**: Configured rules in [`AGENTS.md`](./AGENTS.md) and [`.agents/rules/local-models.md`](./.agents/rules/local-models.md) delegating heavy code generation, refactoring, and reasoning to local models (`qwen2.5-coder:14b`, `deepseek-r1:14b`, `qwen3:30b-a3b`).

### 8. Network Diagnostic & Remediation Suite (`agent/api/netutils.py` & `web/src/components/NetworkUtils.tsx`)
- **Diagnostic Tools**: Comprehensive suite featuring ICMP Ping with latency jitter metrics, geo-enriched Traceroute with PoP classification, NSLookup (A, MX, TXT, PTR), Cloudflare DoH DiG with RFC TTL and authority records, RDAP WHOIS, and interactive end-to-end visual Connection Path map.
- **Local Host Inspection**: Added `/api/netutils/ifconfig` (all network adapters, IP assignments, MACs, MTU, link speeds, and live RX/TX throughput) and `/api/netutils/netstat` (active TCP/UDP sockets with process ownership and state filtering).
- **Remediation**: Live 1-click process termination and Windows Firewall (`netsh advfirewall`) inbound/outbound IP rule blocking/unblocking.

### 9. Automated Backend Unit Test Suite (`agent/tests/`)
- Comprehensive test coverage with 18/18 passing tests across `test_actions.py`, `test_anomaly.py`, `test_parsers.py`, `test_sqlite_store.py`, and `test_netutils.py`.

---

## 📋 Remaining Roadmap / Future Tasks

1. **Packet Sniffing / Deep Packet Inspection (DPI)**:
   - Optional raw packet capture collector (using `scapy` or `pydivert` on Windows) for payload inspection and TLS handshake SNI extraction.
2. **Alert Notifications & Webhooks**:
   - Webhook triggers (Slack/Discord/Teams) or desktop toast notifications when `critical` severity anomalies occur.
3. **Automated Unit & Integration Test Suite**:
   - Write pytest suites for parsers, anomaly rules, and SQLite query endpoints.
   - Vitest component tests for frontend stores and timeline scrubbing.
4. **GeoIP Database Auto-Updater**:
   - Background cron task to refresh MaxMind MMDB lookup files periodically.
