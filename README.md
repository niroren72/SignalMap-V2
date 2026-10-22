# 🛰️ SignalMap

> **Real-time network traffic visualization and socket monitoring engine with 3D Globe and Topology views.**

SignalMap provides real-time visibility into your local machine's active network connections, mapping outbound socket activity to geographic locations, cloud services, and autonomous systems with high-performance 3D visualizers.

---

## ✨ Features

- **🌍 Interactive 3D Globe**: Render live network connection arcs across the globe with geographic coordinates and bandwidth pulse animations.
- **🕸️ 3D Force-Directed Topology Graph**: Explore process-to-service relationships and cluster connections by process name and destination endpoint.
- **📋 Dedicated Connections Grid**: Full-viewport telemetry data table with top metric summary cards, multi-column sorting, inline search, and CSV/JSON export.
- **🧭 Left Navigation Sidebar**: Quick view switcher between 3D Globe, 3D Topology, and Connections Grid with status health indicators and collapsible bar.
- **⚙️ System Settings Modal**: Configurable WebSocket stream rate, threat/anomaly thresholds, 3D rendering preferences, and buffer management.
- **⚡ Real-Time Socket Collection**: Capture live active TCP/UDP connections mapped directly to parent process IDs and names with Windows `netstat` fallback.
- **🛡️ Anomaly & Threat Engine**: Detection of living-off-the-land binaries, known C2/backdoor ports, SMB WAN exposure, and high bandwidth spikes.
- **🔍 Intelligent Enrichment Pipeline**:
  - **Reverse DNS**: Automatic PTR lookup for remote hosts.
  - **GeoIP & ASN**: IP-to-location mapping with city/country coordinates and ISP/Autonomous System names.
  - **Service Classification**: Configurable YAML rules engine (`rules/services.yaml`) identifying cloud providers, CDNs, and developer tools.
- **📊 Slide-Over Detail Panel**: Deep inspection of connection latency, data volume, process paths, ASN, MITRE ATT&CK tags, and geo-metadata.
- **🚀 Single-Command Startup**: Unified runner for development (`Vite` + `FastAPI`) and production serving.

---

## 🛠️ Architecture & Tech Stack

```
signalmap/
├── agent/                  # Python backend & collector daemon
│   ├── api/                # FastAPI routes & WebSocket broadcast server
│   ├── collectors/         # Socket pollers (psutil) & Mock generator
│   ├── parsers/            # Packet & connection parsers
│   ├── store/              # Event ring buffer & aiosqlite persistence
│   ├── enrichment.py       # GeoIP, rDNS & service classification
│   ├── schema.py           # Canonical Pydantic models
│   └── main.py             # Server entrypoint
├── web/                    # Modern React frontend
│   ├── src/
│   │   ├── components/     # GlobeView (globe.gl), GraphView (react-force-graph-3d), DetailPanel
│   │   ├── stores/         # Zustand global connection state
│   │   └── hooks/          # WebSocket and REST stream hooks
├── rules/                  # Service classification rules (YAML)
├── shared/                 # Shared TypeScript contracts
├── data/                   # MaxMind MMDB lookup files & SQLite stores
└── start.py                # Unified process launcher
```

- **Backend**: Python 3.10+, FastAPI, Uvicorn, WebSockets, `psutil`, `aiosqlite`, `geoip2`, `pydantic`
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, `globe.gl`, `react-force-graph-3d`, Three.js, Zustand

---

## 🚀 Getting Started

### 1. Prerequisites

- **Python 3.10+**
- **Node.js 18+** & npm

### 2. Installation

Clone the repository and install dependencies:

```bash
# Clone the repository
git clone https://github.com/niroren72/SignalMap.git
cd SignalMap

# Install Python backend dependencies
pip install -r agent/requirements.txt

# Install Frontend dependencies
cd web
npm install
cd ..
```

### 3. Optional: Setup GeoIP Databases

For offline GeoIP resolution:
1. Download `GeoLite2-City.mmdb` and `GeoLite2-ASN.mmdb` from [MaxMind](https://www.maxmind.com).
2. Place both files into the `data/` directory.

### 4. Running SignalMap

Run the single-command launcher:

```bash
# Start in Development Mode (FastAPI + Vite dev server)
python start.py

# Or start in Production Mode (Builds frontend and serves via FastAPI on :8765)
python start.py --prod

# Or run backend only
python start.py --backend-only
```

Once running:
- **Web UI**: [http://localhost:5173](http://localhost:5173) (Dev) or [http://localhost:8765](http://localhost:8765) (Prod)
- **API Docs**: [http://localhost:8765/docs](http://localhost:8765/docs)
- **WebSocket Feed**: `ws://localhost:8765/ws/events`

---

## 📄 License

MIT License. See `LICENSE` for details.
