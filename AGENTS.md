# 🤖 Workspace Automation & Behavior Protocol

> **Scope**: Entire Workspace (`c:\Users\User\Documents\MyProject\Antigravity DevEX`)  
> **Precedence**: High. Injected into every prompt cycle.

---

## 1. 📍 Persistent State Protocol (`STATE.md`)
- **Cold-Start Resumption**:
  - On every fresh prompt, new session, or after an IDE restart, read [STATE.md](file:///c:/Users/User/Documents/MyProject/Antigravity%20DevEX/STATE.md) first to instantly align with current project focus, touched files, and open tasks.
- **Continuous State Maintenance**:
  - Keep [STATE.md](file:///c:/Users/User/Documents/MyProject/Antigravity%20DevEX/STATE.md) updated at the end of every significant edit or task completion.

---

## 2. ⚡ Mandatory Skill Routing on Every Prompt
On **every incoming prompt**, review available skills and trigger them automatically whenever relevant:

1. **`grill-me` (Automatic Sharpening)**:
   - When the user asks for a new feature, architecture plan, refactor, or idea with ambiguous requirements:
   - **Do not write code immediately.**
   - Group unsettled choices into questions and format using the official `grill-me` round template:
     ```markdown
     ❓ **Q1** - **<Title>**: <Details & choices>
     ➡️ <Recommended answer>
     ```
   - Wait for user confirmation before building.

2. **Frontend & UI Polish (`impeccable`, `apple-design-engineering`)**:
   - For any UI, component, or layout work: apply modern dark mode, fluid motion, glassmorphism, and strict micro-animations.

3. **Debugging (`code-showcase-systematic-debugging`)**:
   - For bug investigation: find root cause first before suggesting or applying fixes.

4. **Completion (`verification-before-completion`)**:
   - **Never** treat `npm run build` alone as sufficient verification.
   - Always run the full 4-Stage Verification Gate (`python signalmap/verify.py`) and inspect live runtime logs before claiming a task is done.

---

## 3. 🛡️ SignalMap 4-Stage Pre-Completion Verification Gate (`signalmap/verify.py`)
Before claiming **any** code change, bugfix, or feature is complete, you **MUST** execute `python signalmap/verify.py` and confirm all 4 stages pass with `0` errors:
1. **Stage 1 — Frontend Static, Lint & Bundle Check**: `oxlint` (`npm run lint`) + `tsc -b` + `vite build`.
2. **Stage 2 — Schema & Type Contract Check**: Verify `agent/schema.py` and `shared/types.ts` are in sync and all Pydantic models validate.
3. **Stage 3 — Backend FastAPI & Collector Smoke Tests**: Automated `TestClient` suite testing `/api/events`, `/api/events/stats`, `/api/events/timeline`, `/api/system/origin`, `/api/actions/blocked-ips`, `/api/connectors/salesforce/*`, and `DataEnricher` / `PsutilSocketCollector` / `SalesforceCollector` invariants.
4. **Stage 4 — Live Runtime & Log Health Audit**: Confirm zero `[Unhandled error]`, `Error creating WebGL context`, `ECONNABORTED`, or Python `Traceback` entries in active dev server logs.

---

## 4. 🚫 Mandatory Anti-Bug Guardrails (Codebase Invariants)
Enforce these architectural invariants on every edit in `signalmap/`:
- **WebGL & Three.js Lifecycle**:
  - Every `new THREE.WebGLRenderer(...)` call MUST be wrapped in a `try / catch` block and rendered inside an `<ErrorBoundary>`.
  - Every WebGL unmount cleanup MUST call `renderer.forceContextLoss()` before `renderer.dispose()`.
  - Use `new THREE.Timer()` instead of deprecated `new THREE.Clock()`.
- **React 19 Hooks, Timers & StrictMode**:
  - Never include un-memoized parent callbacks (e.g., `onComplete={() => ...}`) in `useEffect` dependency arrays that manage timers, intervals, or WebSockets; sync them into a `useRef` inside an effect instead.
  - Never mutate `.current` of a ref directly in the render body (`react(refs)` lint rule) or call `setState` synchronously inside an effect body (`react(set-state-in-effect)`).
  - Guard WebSocket cleanup when `ws.readyState === WebSocket.CONNECTING` so React StrictMode double-mounting never triggers `ECONNABORTED`.
- **Browser Security & Popups**:
  - Never call `window.open(...)` *after* an `await fetch(...)` boundary (which triggers browser popup blockers). Always open `window.open('about:blank', ...)` **synchronously** inside the click handler and redirect `popup.location.href` after the async response arrives.
- **FastAPI & Uvicorn Stability**:
  - Never enable Uvicorn `WatchFiles` auto-reload on directories containing `.db`, `.db-wal`, `.json`, or `web/dist` files so database/config writes never kill the server mid-request.
  - Always use `sfApiFetch` / direct `:8765` fallback in dev mode so frontend API calls succeed even if the Vite proxy restarts.
