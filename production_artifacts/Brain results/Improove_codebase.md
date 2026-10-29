# SignalMap — Architecture, Performance & Design Review

A comprehensive, non-destructive technical evaluation of the **SignalMap** codebase (`C:\Users\User\Documents\MyProject\My Idea\Antigravity project\signalmap`), spanning the daemon telemetry backend (`FastAPI + psutil + GeoIP2`) and real-time visualization dashboard (`React + Vite + TailwindCSS + Three-Globe + Zustand`).

---

## 1. Executive Summary

SignalMap possesses a clean, focused architectural vision: a dark cyber-telemetry aesthetic, modular collectors, lightweight WebSocket communication, and an interactive 3D globe. 

However, under realistic SOC workloads (bursty packet streams, 1,000+ active sockets), the current implementation encounters critical bottlenecks:
- **Zustand GC Thrashing**: Spreading 3,000-item arrays 50–100 times per second causes high garbage collection pauses and React re-render cascades.
- **Airgap & Privacy Leaks**: Direct browser calls to third-party endpoints (`ipapi.co`) and external CDN textures (`unpkg.com`) compromise SOC privacy and fail entirely in offline environments.
- **Heuristic Bandwidth Distortion**: Distributing system network IO evenly across open sockets incorrectly blames idle connections for heavy background transfers.
- **Interface Physics**: Transitions currently rely on linear/standard CSS easing rather than fluid, interruptible spring curves and tabular typography.

```mermaid
graph TD
    subgraph Current Architecture Issues
        A[Incoming Packets 50-100Hz] -->|1:1 Dispatches| B[useWebSocket.ts]
        B -->|Array Spread on Every Packet| C[Zustand connectionStore 3000 items]
        C -->|50Hz Re-render Churn| D[GlobeView & ConnectionTable]
        E[Browser Mount] -->|Plaintext External Leak| F[ipapi.co Third-Party API]
        E -->|Unpkg CDN Dependency| G[Remote Earth Textures]
    end

    subgraph Recommended Upgrades
        A2[Incoming Packets 50-100Hz] -->|Buffer Accumulator| B2[100ms Micro-Batch Queue]
        B2 -->|Batch Flush addEvents| C2[Chunked / Ring Buffer Store]
        C2 -->|Selector-Scoped Updates| D2[GlobeView & Virtualized Table]
        H2[Backend Daemon] -->|Local MaxMind Resolution| E2[/api/system/origin]
        E2 -->|Zero External Leak| I2[Internal Dashboard]
        J2[Local Assets /public/assets/earth/] -->|Offline First| I2
    end
```

---

## 2. Deep-Dive Findings & Architectural Upgrades

### Pillar A: Real-Time State & React Performance

#### 1. Zustand Event Thrash & Garbage Collection Spikes
- **File Reference**: `web/src/hooks/useWebSocket.ts` & `web/src/stores/connectionStore.ts:173-178`
- **Current Pattern**:
  ```typescript
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 3000),
    })),
  ```
  Every incoming WebSocket frame instantly triggers an array spread of up to 3,000 items. At 50 packets/sec, this allocates ~150,000 object references per second, forcing the V8 garbage collector into stop-the-world sweeps and stuttering 60fps animations.
- **Recommended Solution**:
  - Implement a micro-batching buffer in `useWebSocket.ts` that flushes new events at a capped rate (e.g., every 100ms or synchronized with `requestAnimationFrame`).
  - Introduce an `addEvents(newEvents: ConnectionEvent[])` store action that prepends batches in a single operation.
  - Implement fine-grained selector subscriptions (e.g., `useConnectionStore(s => s.activeCount)`) so high-frequency table updates do not force 3D globe re-renders.

#### 2. Table DOM Virtualization
- **File Reference**: `web/src/components/TableView.tsx` & `ConnectionTable.tsx`
- **Current Pattern**: Direct `.map()` over hundreds of event records directly creates hundreds of active DOM nodes.
- **Recommended Solution**:
  - Integrate `@tanstack/react-virtual` with a fixed-height row container.
  - Keeps the active DOM node count below ~30 rows regardless of whether 100 or 10,000 events are held in memory, maintaining smooth scrolling.

---

### Pillar B: 3D Globe & Offline-First Robustness

#### 1. Airgap & Privacy Leak via Third-Party IP Geolocation
- **File Reference**: `web/src/components/GlobeView.tsx:18-30`
- **Current Pattern**:
  ```typescript
  fetch('https://ipapi.co/json/')
    .then(res => res.json())
    .then(data => setOrigin({ lat: data.latitude, lng: data.longitude }))
  ```
- **Why This Must Be Changed**:
  - **SOC Privacy Risk**: Broadcasting your client IP address to a commercial third-party lookup leaks network identity.
  - **Rate Limiting & Airgap Failure**: In closed security operations centers (SOC) or disconnected developer machines, `ipapi.co` fails, leaving origin telemetry broken.
  - **Redundancy**: The backend daemon already loads a local MaxMind database (`GeoLite2-City.mmdb`).
- **Recommended Solution**:
  - Expose a `/api/system/origin` endpoint on the local FastAPI backend.
  - Resolve the default gateway's public or WAN interface through the local MaxMind database, falling back to a configured default coordinate if disconnected.

#### 2. External CDN Dependencies for 3D Textures
- **File Reference**: `web/src/components/GlobeView.tsx:240-241`
- **Current Pattern**:
  ```typescript
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  ```
- **Recommended Solution**:
  - Download and optimize these textures into `web/public/assets/earth/` as compressed WebP or progressive JPEGs.
  - Guarantees instantaneous, zero-latency canvas loading with no dependency on `unpkg.com`.

#### 3. 3D Camera Controls & Visual Polish
- Constrain orbital zoom bounds: `controls.minDistance = 120` and `controls.maxDistance = 480` to prevent users from clipping into the sphere interior.
- Add an atmospheric glow shader with additive blending matching the cyber aesthetic (`rgba(0, 240, 255, 0.15)`).

---

### Pillar C: UI/UX Craft & Apple Design Engineering

#### 1. Fluid Motion Physics & Interruptible Drawers
- **File Reference**: `web/src/components/DetailPanel.tsx` & `web/src/index.css`
- **Current Pattern**: Modals and slide-over drawers snap abruptly or use basic linear CSS transitions.
- **Recommended Solution**:
  - Apply custom Apple-standard easing curves:
    ```css
    :root {
      --ease-out-spring: cubic-bezier(0.16, 1, 0.3, 1);
      --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
    }

    .detail-panel {
      transition: transform 0.38s var(--ease-drawer), opacity 0.25s ease-out;
      @starting-style {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    ```
  - Eliminates jarring layout pops and enables smooth gesture dismissal.

#### 2. Tabular Numerics for Metrics & Badges
- **Current Pattern**: Packet-per-second (PPS), bytes-per-second (BPS), and port badges experience horizontal jitter when numbers shift between narrow glyphs (e.g., `1`) and wide glyphs (e.g., `8`).
- **Recommended Solution**:
  - Apply `font-feature-settings: "tnum" 1, "cv05" 1;` or Tailwind's `tabular-nums` across all numeric badges, coordinates, latency counters, and port numbers.

#### 3. Tactile Micro-Interactions
- Add physical press feedback to all dashboard buttons:
  ```css
  .btn-tactile {
    transition: transform 0.12s cubic-bezier(0.2, 0, 0, 1), background-color 0.15s ease;
  }
  .btn-tactile:active {
    transform: scale(0.97);
  }
  ```

---

### Pillar D: Backend Telemetry & Threat Engine

#### 1. Proportional Bandwidth Telemetry Heuristic
- **File Reference**: `agent/collectors/socket_collector.py:147-152`
- **Current Pattern**:
  ```python
  # Distribute delta evenly across active sockets
  delta_bytes = (current_bytes - prev_bytes) // len(conns)
  ```
  Total system network delta (`psutil.net_io_counters()`) is divided equally among all open connections.
- **Why This Must Be Changed**:
  If a single process (e.g., a multi-gigabyte Steam or Docker download) consumes 200 MB/s, idle loopback sockets and DNS queries are erroneously tagged with megabytes of traffic.
- **Recommended Solution**:
  - Inspect per-process IO counters via `psutil.Process(pid).io_counters()`.
  - Attribute network deltas specifically to the process ID owning the socket.
  - On Windows, consider hooking the native Event Tracing for Windows (ETW) Network provider for true per-socket byte counters.

#### 2. Declarative Threat Signature Engine
- **File Reference**: `agent/anomaly.py`
- **Current Pattern**: Suspicious process names (`mimikatz`, `nc`, `nmap`) and known malicious ports are hardcoded in static Python sets.
- **Recommended Solution**:
  - Mirror the existing `rules/services.yaml` pattern by creating `rules/threat_signatures.yaml`.
  - Include MITRE ATT&CK technique IDs (e.g., `T1041 Exfiltration Over C2`, `T1059 Command and Scripting Interpreter`), port definitions, and custom country geo-fencing rules.
  - Allows analysts to update detection logic without recompiling or modifying Python source code.

#### 3. Passive TLS SNI Sniffing
- When remote IP addresses do not have reverse DNS (rDNS) PTR records, domains show as `Unknown`.
- Parsing the unencrypted TLS `ClientHello` Server Name Indication (SNI) on initial socket handshake immediately resolves domain names (`api.github.com`, `raw.githubusercontent.com`) before DNS cache expiry.

---

## 3. Before / After / Why Engineering Review Table

| File / Component | Current Implementation (Before) | Recommended Enhancement (After) | Why (Mechanical & UX Rationale) |
| :--- | :--- | :--- | :--- |
| **`useWebSocket.ts`** | Every incoming message calls `addEvent` individually | 100ms micro-batch buffer flushing via `addEvents(chunk)` | Eliminates 50Hz GC churn; prevents browser stutter under high socket throughput. |
| **`connectionStore.ts`** | `events: [event, ...state.events].slice(0, 3000)` | Ring buffer or capped push mutation without re-allocating 3,000 array elements | Prevents high memory allocation and CPU frame drops during active threat streams. |
| **`GlobeView.tsx`** | Fetches `ipapi.co/json` on client mount | Reads `/api/system/origin` served locally by the agent | Preserves privacy, eliminates third-party rate limits, and supports offline/airgapped SOC setups. |
| **`GlobeView.tsx`** | Textures loaded from `unpkg.com` CDN | Self-hosted WebP textures in `web/public/assets/earth/` | Ensures zero external runtime dependencies; instantaneous canvas initialization. |
| **`DetailPanel.tsx`** | Abrupt transition with linear or basic CSS transform | `@starting-style` with Apple spring curve `cubic-bezier(0.32, 0.72, 0, 1)` | Elevates tactile feel; drawers feel lightweight, interruptible, and responsive. |
| **`TableView.tsx`** | Unvirtualized table mapping all socket entries | Virtualized row list via `@tanstack/react-virtual` | Caps DOM tree size to ~30 nodes; locks 60fps scrolling across 10,000 events. |
| **`socket_collector.py`** | `total_system_delta // len(conns)` equal division | Per-process `proc.io_counters()` bandwidth attribution | Resolves false bandwidth reporting where idle sockets show heavy transfer. |
| **`anomaly.py`** | Hardcoded process and port sets in Python | Declarative `rules/threat_rules.yaml` with MITRE tags | Enables user-configurable rules, custom SOC threat lists, and live rule reloading. |

---

## 4. Phased Implementation Roadmap

1. **Phase 1: Performance & Privacy (Immediate Impact)**
   - Add micro-batching buffer in `web/src/hooks/useWebSocket.ts`.
   - Remove `ipapi.co` from `GlobeView.tsx`; load origin and textures locally from `web/public/assets/`.
2. **Phase 2: UI Polish & Virtualization (Visual & Responsiveness Upgrade)**
   - Implement `@tanstack/react-virtual` for `ConnectionTable.tsx`.
   - Polish `DetailPanel.tsx` slide-over with `@starting-style` and custom spring beziers.
   - Enforce `tabular-nums` on all metrics and IP addresses.
3. **Phase 3: Telemetry Precision (Threat Engine Depth)**
   - Upgrade `socket_collector.py` to PID-based IO metrics.
   - Externalize anomaly detection to `rules/threat_signatures.yaml` with MITRE ATT&CK mapping.
