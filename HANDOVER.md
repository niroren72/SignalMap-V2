# 🛰️ SignalMap — Developer Handover Guide

> **This document serves as the complete handover reference for continuing development in VS Code or any other IDE.**

---

## 📌 1. Project Overview & Architecture

SignalMap is a real-time network traffic visualization engine with 3D Globe and Force-Directed Topology views, automated local socket tracking, security threat detection, historical playback, and multi-format log importing.

### Monorepo Structure

```
signalmap/
├── agent/                       # Python Backend & Daemon
│   ├── api/                     # FastAPI REST routes, WebSocket feeds, and Upload handler
│   │   ├── rest.py              # Query, stats, timeline, and CSV/JSON export endpoints
│   │   ├── ws.py                # WebSocket broadcast server (ws://localhost:8765/api/ws)
│   │   └── upload.py            # Log file upload API (EVTX, Nginx, JSONL)
│   ├── collectors/              # Socket & Packet collectors
│   │   ├── base.py              # BaseCollector async interface
│   │   └── socket_collector.py  # psutil + netstat socket poller with I/O delta metrics
│   ├── parsers/                 # Offline log parsers
│   │   ├── windows_evtx.py      # Windows Security/Sysmon event log parser
│   │   ├── nginx.py             # Nginx combined access log parser
│   │   └── jsonl.py             # JSON Lines network event parser
│   ├── store/                   # Storage layer
│   │   ├── sqlite_store.py      # aiosqlite persistent store with WAL mode & indices
│   │   └── ring_buffer.py       # In-memory circular buffer
│   ├── anomaly.py               # Security anomaly detection rule engine
│   ├── enrichment.py            # GeoIP (MaxMind), rDNS, and YAML service classifier
│   ├── schema.py                # Canonical Pydantic models & TS code generator
│   ├── config.py                # Centralized AgentConfig
│   ├── mock_generator.py        # Simulated test event stream
│   └── main.py                  # FastAPI app entrypoint
├── web/                         # React 18 + Vite + TypeScript Frontend
│   ├── src/
│   │   ├── components/          # UI Components
│   │   │   ├── Sidebar.tsx      # Left navigation bar with 4 view tabs, upload trigger, and settings
│   │   │   ├── GlobeView.tsx    # 3D Earth visualization (globe.gl) with threat arcs
│   │   │   ├── GraphView.tsx    # 3D Topology force graph (react-force-graph-3d)
│   │   │   ├── LiveConnectionTable.tsx # Docked live connection table at bottom of 3D views
│   │   │   ├── TableView.tsx    # Dedicated Connections Grid full-screen data table
│   │   │   ├── ConnectionTable.tsx # Interactive multi-column telemetry grid with search & sort
│   │   │   ├── PlaybackView.tsx # Dedicated Historical Playback tab with time scrubber & histogram
│   │   │   ├── DetailPanel.tsx  # Security assessment & metadata inspection slide-over
│   │   │   ├── FilterBar.tsx    # Full-text search, protocol pills, threat filters, export
│   │   │   ├── Header.tsx       # Top bar with bandwidth counters, threats, and view buttons
│   │   │   ├── SettingsModal.tsx # System stream, anomaly, and display preferences modal
│   │   │   └── UploadModal.tsx  # Drag-and-drop log import modal
│   │   ├── stores/              # Zustand global state (connectionStore.ts)
│   │   ├── hooks/               # useConnections.ts, useWebSocket.ts
│   │   ├── App.tsx              # Main application layout
│   │   └── index.css            # Dark mode design tokens & glassmorphism utilities
├── rules/                       # Classification rules (services.yaml)
├── shared/                      # Shared TypeScript definitions (types.ts)
├── data/                        # SQLite databases (events.db) & MaxMind .mmdb files
├── architecture.md              # Technical specification & architecture documentation
├── .agents/                     # Agent rules & local model configuration
├── AGENTS.md                    # Operating rules for AI agents
├── progress_summary.md          # Chronological progress summary
└── start.py                     # Unified single-command launcher
```

---

## ⚡ 2. Local Ollama Model Protocol (For VS Code Extensions)

When developing with VS Code extensions (Cline, Continue, etc.), follow the **Mandatory Hybrid Orchestration Protocol** defined in [`AGENTS.md`](./AGENTS.md):

| Task Type | Recommended Model / Tool | Command / Dispatch Trigger |
| :--- | :--- | :--- |
| **Logic planning & bug triage** | `deepseek-r1:14b` | Algorithm planning, security rule reviews, complex logic debugging |
| **Code synthesis & new modules** | `qwen3:30b-a3b` | Large multi-file features and full service components |
| **Routine coding & refactoring** | `qwen2.5-coder:14b` | Default for functions, snippet refactoring, unit tests, bug fixes |
| **Boilerplate & schema transforms**| `qwen3:8b` | Rapid boilerplate, regexes, simple transforms |
| **Documentation synthesis** | `granite4.2:latest` | Reading logs, parsing specifications, long context analysis |

---

## 🚀 3. How to Run & Develop in VS Code

### Quick Start
Open a terminal in VS Code and run:

```powershell
# Start both Backend and Vite Frontend in Development Mode
python start.py

# Or start in Production Mode (builds web/ and serves via FastAPI on :8765)
python start.py --prod

# Or run backend only
python start.py --backend-only
```

### URLs & Ports
- **Frontend Dev Server**: [http://localhost:5173](http://localhost:5173)
- **Backend API & Swagger Docs**: [http://localhost:8765/docs](http://localhost:8765/docs)
- **WebSocket Feed**: `ws://localhost:8765/api/ws`

### Key CLI Commands
```powershell
# 1. Regenerate TypeScript interfaces from Python schema
python -m agent.schema --emit-ts

# 2. Build Frontend
cd web
npm run build
cd ..

# 3. Test Backend Python imports
python -c "from agent.main import app; print('Backend OK')"
```

---

## 📋 4. Tasks Done vs Remaining Roadmap

### ✅ Completed Tasks
- [x] Python/FastAPI backend architecture with asynchronous WebSocket streaming.
- [x] Pydantic canonical schema (`ConnectionEvent`) with automatic TypeScript code generation.
- [x] Live socket collection (`PsutilSocketCollector`) with Windows `netstat` fallback and real-time bandwidth delta counters.
- [x] Data enrichment pipeline: MaxMind GeoIP/ASN `.mmdb` integration + fallback coordinates, reverse DNS, and YAML rules engine.
- [x] Security Anomaly Engine (`agent/anomaly.py`) detecting suspicious processes (`powershell.exe`, `rundll32.exe`), C2/backdoor ports (`4444`, `1337`, `31337`), and SMB WAN leaks.
- [x] Multi-format log parsers for Windows EVTX, Nginx access logs, and JSON Lines with web upload modal.
- [x] SQLite persistence layer (`SQLiteStore`) with WAL mode, indexing, timeline aggregation, and CSV/JSON export endpoints.
- [x] React 18 + Vite + TailwindCSS v4 frontend with glassmorphism dark theme.
- [x] 3D Globe visualization (`globe.gl`) with glowing threat arcs and interactive HTML tooltips.
- [x] 3D Force-directed Topology Graph (`react-force-graph-3d`) clustering processes to remote services.
- [x] Interactive bottom Timeline Scrubber with Play/Pause, speed multipliers (`1x`, `2x`, `5x`, `10x`), range presets, and traffic density histogram.
- [x] Multi-criteria Search and Filter Bar with protocol pills, category selector, threat toggle, and export menu.
- [x] Security Detail Slide-over Panel with MITRE `#tags`, severity badges, throughput graphs, and process info.
- [x] Network Utilities & Diagnostic Suite (`agent/api/netutils.py` & `web/src/components/NetworkUtils.tsx`) supporting Ping, Traceroute, NSLookup, DiG (DNS-over-HTTPS), WHOIS, Path & PoP View, Local Interfaces (`ifconfig`/`ipconfig`), Netstat (Active Sockets), and Firewall rule inspector.
- [x] Visual End-to-End Connection Path & PoP Inspector (`web/src/components/ConnectionPathView.tsx`) with hop node cards, latency color coding, and mini geographic arc map.
- [x] Live Security Remediation Actions (`agent/api/actions.py` & `DetailPanel.tsx`) providing 1-click Process Termination (safe system process guard) and Windows Firewall (`netsh advfirewall`) IP blocking/unblocking.
- [x] Automated Backend Unit Test Suite (`agent/tests/`) covering Actions, Anomaly Rules, Log Parsers, SQLite persistence, and Network Utilities (18/18 passing).

### ⏳ Remaining Backlog / Next Steps
1. **Raw Packet Sniffing / Deep Packet Inspection (DPI)**:
   - Implement optional raw packet capture using `scapy` or `pydivert` on Windows to inspect packet payloads and extract TLS SNI domain names for non-socket connections.
2. **Alert Notifications & Webhooks**:
   - Add webhook dispatch (Slack / Discord / Teams) or Windows toast notifications when `critical` security anomalies are detected.
3. **Frontend Vitest Suite**:
   - Add `vitest` unit tests in `web/` for Zustand store actions and timeline calculations.
4. **GeoIP Periodic Updater**:
   - Add background cron/task to refresh `GeoLite2-City.mmdb` and `GeoLite2-ASN.mmdb` periodically.

---

## 💾 5. Git Status
All features and test suites are verified:
- Frontend Vite production build succeeds.
- Backend unittests pass cleanly (`python -m unittest discover -s agent/tests`).
