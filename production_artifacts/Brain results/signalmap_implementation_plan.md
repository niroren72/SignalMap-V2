# SignalMap Codebase Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the imported SignalMap project with high-performance real-time event batching, airgap-ready offline 3D rendering, Apple-inspired fluid motion and typography, virtualized table rendering, and an extensible YAML-based threat detection engine with MITRE ATT&CK mapping.

**Architecture:** 
- Frontend: decouple high-frequency WebSocket frames from React render cycles using a 100ms micro-batching buffer; optimize Zustand store updates; virtualize the telemetry table using `@tanstack/react-virtual`; serve 3D globe textures locally with orbital zoom clamps; apply Apple spring physics and tabular numerics.
- Backend: replace third-party `ipapi.co` lookups with a local `/api/system/origin` endpoint; transition `AnomalyEngine` from hardcoded Python sets to declarative `rules/threat_signatures.yaml` with MITRE metadata; upgrade socket bandwidth estimation to per-PID process IO counters.

**Tech Stack:** React 18, Vite, TypeScript, TailwindCSS, Three-Globe, Zustand, @tanstack/react-virtual, FastAPI, Python 3.11+, PyYAML, psutil.

**Spec:** [production_artifacts/Brain results/Improove_codebase.md](file:///c:/Users/User/Documents/MyProject/Antigravity%20DevEX/production_artifacts/Brain%20results/Improove_codebase.md)

## Global Constraints
- **Original Project Isolation**: Under NO circumstances should `C:\Users\User\Documents\MyProject\My Idea\Antigravity project\signalmap` be touched. All work is strictly in `signalmap/` inside this workspace.
- **Zero Breaking Changes**: Preserve all existing REST endpoints, WebSocket JSON packet contracts, and schema definitions.
- **Type Safety**: Full TypeScript compilation (`tsc -b`) and Python test suites (`python -m unittest`) must pass with zero errors.

## Review Focus
1. **Zustand Batching Latency**: Ensure micro-batching does not delay critical security anomaly events (anomalies should flush immediately or within <=100ms).
2. **Offline Resilience**: GlobeView must render cleanly and without console errors even with zero internet connectivity.
3. **Table Virtualization Row Heights**: Ensure sticky table headers, sorting, and row selection continue to work seamlessly within the virtualized scroll container.
4. **Backward Compatibility in AnomalyEngine**: If `rules/threat_signatures.yaml` is missing or invalid, fallback gracefully to default built-in heuristics without raising unhandled exceptions.
5. **Process IO Attribution Edge Cases**: Handle permission errors (`psutil.AccessDenied`) when reading system PID counters on Windows cleanly.

---

### Task 1: Zustand Event Micro-Batching & Store Optimization

**Files:**
- Modify: `signalmap/web/src/stores/connectionStore.ts`
- Modify: `signalmap/web/src/hooks/useWebSocket.ts`

**Interfaces:**
- Consumes: Raw WebSocket message events from `ws://localhost:8765/ws/events`.
- Produces: `addEvents: (events: ConnectionEvent[]) => void` in `connectionStore`.

- [x] **Step 1: Update `connectionStore.ts` to add `addEvents` batch action**
  Add `addEvents: (newEvents: ConnectionEvent[]) => void` that prepends multiple events at once in a single Zustand `set()` call:
  `events: [...newEvents, ...state.events].slice(0, 3000)`. Preserve existing `addEvent` for backward compatibility.

- [x] **Step 2: Implement micro-batching buffer in `useWebSocket.ts`**
  Maintain a buffer ref: `const eventBuffer = useRef<ConnectionEvent[]>([])`.
  When WebSocket messages arrive:
  - If event is critical/anomaly (`event.threat_level === 'CRITICAL'`), flush immediately.
  - Otherwise, push into `eventBuffer`.
  Flush buffer every 100ms using `setInterval` or `requestAnimationFrame`.

- [x] **Step 3: Verify frontend compiles cleanly**
  Run: `npm --prefix signalmap/web run build`
  Expected: Exit code 0, successful Vite build.

---

### Task 2: Airgap Robustness & Offline 3D Globe Assets

**Files:**
- Modify: `signalmap/agent/main.py`
- Modify: `signalmap/web/src/components/GlobeView.tsx`
- Create/Asset: `signalmap/web/public/assets/earth/` textures and procedural offline fallback

**Interfaces:**
- Backend Endpoint: `GET /api/system/origin -> { latitude: float, longitude: float, country: str, city: str, ip: str, is_local: bool }`
- GlobeView: Consumes `/api/system/origin` and local `/assets/earth/` textures.

- [x] **Step 1: Implement `/api/system/origin` in `agent/main.py`**
  Add endpoint that queries local MaxMind database or detects host IP to return origin coordinates. Provide safe fallback `{ "latitude": 37.7749, "longitude": -122.4194, "country": "US", "city": "Local SOC", "ip": "127.0.0.1", "is_local": True }`.

- [x] **Step 2: Download or generate local Earth textures in `web/public/assets/earth/`**
  Ensure local high-performance texture maps exist at `web/public/assets/earth/earth-blue-marble.jpg` and `earth-topology.png` (or high-speed procedural canvas fallback) with zero dependency on `unpkg.com`.

- [x] **Step 3: Update `GlobeView.tsx` to use local origin & textures**
  Replace `fetch('https://ipapi.co/json/')` with `fetch('/api/system/origin')`.
  Update `globeImageUrl` and `bumpImageUrl` to point to `/assets/earth/...`.
  Add camera distance limits (`controls.minDistance = 120`, `controls.maxDistance = 480`).

- [x] **Step 4: Verify build and unit test pass**
  Run: `python -m unittest discover -s signalmap/agent/tests` and `npm --prefix signalmap/web run build`
  Expected: PASS

---

### Task 3: Table Virtualization & Tabular Numerics

**Files:**
- Modify: `signalmap/web/src/components/TableView.tsx`
- Modify: `signalmap/web/src/components/ConnectionTable.tsx`
- Modify: `signalmap/web/src/index.css`

**Interfaces:**
- Consumes: `events: ConnectionEvent[]` from `useConnectionStore`.
- Produces: Virtualized DOM row list with sticky headers and pinned row heights.

- [x] **Step 1: Add typography tokens to `index.css`**
  Add `.tabular-nums` and font feature settings `font-feature-settings: "tnum" 1, "cv05" 1;` for all numeric counters, IP columns, ports, and latency badges.

- [x] **Step 2: Virtualize rows in `TableView.tsx` / `ConnectionTable.tsx`**
  Use `useVirtualizer` from `@tanstack/react-virtual` targeting the scroll container:
  ```typescript
  const rowVirtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });
  ```
  Render only the active slice of virtual items with absolute transforms.

- [x] **Step 3: Verify build and scrolling performance**
  Run: `npm --prefix signalmap/web run build`
  Expected: Successful compilation without type errors.

---

### Task 4: Apple Design Engineering Micro-Interactions & Fluid Physics

**Files:**
- Modify: `signalmap/web/src/index.css`
- Modify: `signalmap/web/src/components/DetailPanel.tsx`
- Modify: `signalmap/web/src/components/UploadModal.tsx`
- Modify: `signalmap/web/src/components/SettingsModal.tsx`

**Interfaces:**
- CSS Variables: `--ease-out-spring: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`.
- Components: Animated panels with spring physics and tactile feedback.

- [x] **Step 1: Add Apple fluid motion tokens in `index.css`**
  Define motion variables and interactive press physics (`:active { transform: scale(0.97); }`).

- [x] **Step 2: Polish `DetailPanel.tsx` slide-over drawer**
  Apply fluid slide transitions with custom bezier curves and subtle glassmorphic backdrop.

- [x] **Step 3: Enhance modal dialogs (`UploadModal`, `SettingsModal`)**
  Add smooth backdrop blur, entry scale physics (`scale(0.96) -> scale(1)`), and tactile click targets.

- [x] **Step 4: Verify build**
  Run: `npm --prefix signalmap/web run build`
  Expected: PASS

---

### Task 5: Declarative YAML Threat Engine & PID Bandwidth Telemetry

**Files:**
- Create: `signalmap/rules/threat_signatures.yaml`
- Modify: `signalmap/agent/anomaly.py`
- Modify: `signalmap/agent/collectors/socket_collector.py`
- Modify: `signalmap/agent/tests/test_anomaly.py`

**Interfaces:**
- `rules/threat_signatures.yaml`: Defines `suspicious_processes`, `c2_ports`, `geo_fencing`, and `mitre_mappings`.
- `AnomalyEngine`: Parses YAML on init, exposes `check(conn: ConnectionEvent) -> AnomalyResult`.

- [x] **Step 1: Write unit tests in `test_anomaly.py` for YAML threat rules**
  Add tests asserting that YAML-defined rules match suspicious processes, attach MITRE technique IDs, and handle missing YAML files safely.

- [x] **Step 2: Create `rules/threat_signatures.yaml`**
  Populate with categorized signatures (Cryptominers, Remote Access Tools, Network Scanners) and MITRE ATT&CK technique IDs.

- [x] **Step 3: Implement YAML loader in `agent/anomaly.py`**
  Update `AnomalyEngine` to load `rules/threat_signatures.yaml` if present, falling back to built-in rules if missing.

- [x] **Step 4: Upgrade bandwidth attribution in `agent/collectors/socket_collector.py`**
  Check `proc.io_counters()` per PID to attribute byte deltas to the actual active processes, falling back safely if access is restricted.

- [x] **Step 5: Run full test suite and verify**
  Run: `python -m unittest discover -s signalmap/agent/tests`
  Expected: All tests pass.
