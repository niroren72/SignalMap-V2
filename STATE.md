# 📍 Project State & Session Context

> **Last Updated**: 2026-10-30  
> **Workspace**: `c:\Users\User\Documents\MyProject\Antigravity DevEX`  
> **Primary Project**: `signalmap` (Real-time network traffic visualization & socket monitoring)

---

## 🎯 Current Focus & Objectives

- **Active Project**: SignalMap (`signalmap/`)
- **Key Modules**:
  - `agent/`: Python daemon (FastAPI, WebSockets, `psutil`, GeoIP2, `aiosqlite`, enrichment pipeline)
  - `web/`: React 18 + Vite frontend (3D Globe via `globe.gl`, 3D Topology via `react-force-graph-3d`, Connections Grid, Telemetry detail panel)
- **Recent Focus Area**: Deep Data Inspection & Data Visibility Suite in `DetailPanel.tsx` (bidirectional hex dumps, PII scanner, side/bottom docking, click-to-filter); added dedicated "Inspect Suite" button in Header toolbar, Action column "🔬 Inspect" buttons in DashboardView & ConnectionTable; ensured `cursor-pointer` (hand cursor) on all clickable elements; and resolved duplicate React key errors.

---

## 🛠️ Active & Recently Touched Files

- `signalmap/web/src/components/DetailPanel.tsx` & `signalmap/web/src/utils/payloadInspector.ts` (Integrated Deep Data Inspection & Data Visibility Suite: 4-tab forensic suite with *Overview*, *Payload Stream [Hex & ASCII]*, *Protocol & Headers*, and *Raw JSON & Forensics*; bidirectional Hex Dump with offset/hex/ascii columns, search, cURL export, and JSON download; built-in PII scanner detecting emails, credit cards, SSN, API keys, JWTs, and passwords with `Mask PII: ON/OFF` toggle; flexible Side Drawer [480px ⇄ 840px] vs Bottom DevTools Shelf [420px ⇄ 640px] docking; and interactive field-level click-to-filter pivoting)
- `signalmap/web/src/components/Header.tsx`, `DashboardView.tsx`, `ConnectionTable.tsx`, & `LiveConnectionTable.tsx` (Added prominent 1-click "🔬 Inspect Suite" button in Header toolbar and active cluster bar; added dedicated "Action" column with interactive "🔬 Inspect" buttons on every connection row; enforced `cursor-pointer` hand hover styling on all interactive cards, pills, rows, and buttons)
- `signalmap/web/src/stores/connectionStore.ts`, `signalmap/web/src/utils/nestedConnections.ts`, `signalmap/web/src/components/DashboardView.tsx`, `LiveConnectionTable.tsx`, & `PlaybackView.tsx` (Resolved duplicate React key warning `Encountered two children with the same key`: added in-place deduplication by `event.id` in `addEvent`, `addEvents`, `setEvents`, and `groupNestedEvents`; enforced globally unique compound keys across table rows, fragments, and live activity streams)
- `signalmap/agent/enrichment.py`, `signalmap/agent/api/rest.py`, `signalmap/web/src/hooks/useConnections.ts`, & `signalmap/web/src/components/GlobeView.tsx` (Resolved local host GeoIP bug where Windows in Israel defaulted to San Francisco `37.7749, -122.4194`; `GET /api/system/origin` and LAN enrichment now resolve to `Tel Aviv, IL (32.0804, 34.7807)` via MaxMind WAN GeoIP + timezone detection; synchronized 3D Globe & 2D FlatMap origin marker and directional `inbound` vs `outbound` arc orientation)
- `signalmap/web/src/components/Header.tsx`, `signalmap/web/src/components/DashboardView.tsx`, `signalmap/web/src/components/ModulesView.tsx`, `signalmap/web/src/stores/connectionStore.ts`, & `signalmap/web/src/utils/nestedConnections.ts` (Filtered Header cluster selector to show only connected/ingested modules, synchronized Dashboard KPIs/charts/tables/activity stream with `activeModule`, and added `Ingest Sample` + `Clear Sample` controls across all 6 system modules)
- `signalmap/web/src/components/ConnectionTable.tsx`, `signalmap/web/src/components/LiveConnectionTable.tsx`, & `signalmap/web/src/components/DashboardView.tsx` (Added sortable `Direction` column `↙ INBOUND` / `↗ OUTBOUND` and interactive `+N nested` expand/collapse child connection rows across all connection tables)
- `AGENTS.md`, `.agents/skills/verification-before-completion/SKILL.md`, & `signalmap/verify.py` (Implemented 4-Stage Automated Pre-Completion Verification Gate checking Schema/TS contract sync, Backend Collectors/Enrichment & FastAPI `TestClient` smoke tests, Frontend `oxlint` + `tsc -b` + `vite build`, and live `:8765` health checks; codified mandatory WebGL, React 19 Compiler, Popup, and FastAPI/Uvicorn anti-bug guardrails)
- `signalmap/agent/collectors/salesforce_collector.py` & `signalmap/agent/api/connectors.py` & `signalmap/agent/main.py` (Implemented live Salesforce Cloud Security Connector supporting 1-Click Browser OAuth 2.0 PKCE via `PlatformCLI` on port 1717, multi-endpoint SOAP & OAuth 2.0 Username/Password login with URL path normalization, Client Credentials, Access Token, and `sf` CLI auto-import across `LoginHistory` + `LoginGeo`, `AuthSession`, `SetupAuditTrail`, `ReportEvent`, `ApiEvent`, and `EventLogFile`)
- `signalmap/web/src/components/SalesforceConfigModal.tsx`, `ModulesView.tsx`, `ConnectionTable.tsx`, `LiveConnectionTable.tsx`, & `hooks/useConnections.ts` (Added interactive Salesforce Tenant Config Modal with synchronous `window.open` popup handling, resilient `sfApiFetch` direct-to-`:8765` fallback, live org status & sync controls, and granular `salesforce_login`, `salesforce_session`, `salesforce_audit`, `salesforce_api`, and `salesforce_report` Data Source badges)
- `signalmap/web/src/components/LoadingScreen.tsx`, `signalmap/web/src/App.tsx`, `signalmap/web/src/suppressThreeWarnings.ts`, `signalmap/web/src/main.tsx`, & `signalmap/web/vite.config.ts` (Added `try/catch` WebGL context creation guard, `renderer.forceContextLoss()` cleanup, and `SafeErrorBoundary` in `App.tsx` to prevent `THREE.WebGLRenderer: Error creating WebGL context`; fixed `onComplete` timer reset, reduced initial load duration, and eliminated `oxlint` `react(refs)` and `react(set-state-in-effect)` warnings)
- `.vscode/settings.json` & `signalmap/.vscode/settings.json` (Configured `git.scanRepositories: ["."]`, `git.ignoredRepositories: ["signalmap"]`, and `git.openRepositoryInParentFolders: "always"` to resolve IDE "no git repository" popup after moving `.git` to workspace root)
- `signalmap/web/src/hooks/useWebSocket.ts` & `signalmap/web/vite.config.ts` (Fixed `[vite] ws proxy socket error: Error: write ECONNABORTED` by connecting directly to `:8765/api/ws` in dev mode and guarding React 18 StrictMode `CONNECTING` socket cleanup)
- `TODO.md` (Project todo list and prioritized engineering backlog across P1–P4, including Deep Data Inspection & Data Visibility Suite and the Help & Documentation Tab for connectors, permissions, and installed features)
- `signalmap/agent/collectors/socket_collector.py`, `signalmap/agent/enrichment.py`, `signalmap/agent/schema.py`, & `signalmap/shared/types.ts` (Upgraded Windows collector to monitor all external TCP states, Windows UDP table sockets, and Windows DNS resolver cache across all protocols: HTTPS, HTTP, TCP, UDP, QUIC, DNS, WS, WSS, NTP, SSH, RDP, SMB; eliminated blocking reverse-DNS bottlenecks)
- `signalmap/web/src/components/FilterBar.tsx`, `ConnectionTable.tsx`, `LiveConnectionTable.tsx`, `ModulesView.tsx`, & `hooks/useConnections.ts` (Added all protocol filter options with live counts, added `DATA SOURCE` badges for `psutil_sockets`, `windows_udp`, `windows_dns`, and fixed Windows module filtering)
- `signalmap/web/src/components/LoadingScreen.tsx` & `HolographicCardLogo.tsx` & `Header.tsx` (Cleaned up logo card frame, removed glowing circles/rings, removed v4.8-aero & READY // CLICK... prompts)
- `signalmap/web/src/components/DetailPanel.tsx` (Slide-over detail inspector)
- `signalmap/web/src/types/modules.ts` (Data contracts & types)

---

## 🚦 System Status & Verification

- **Git Working Tree**: Root repository (`Antigravity DevEX/.git`) tracking `signalmap/`, `.agents/`, `AGENTS.md`, and `STATE.md` (remote: `origin/main` on `SignalMap-V2.git`)
- **Backend**: Ready (`python start.py --backend-only` or via unified launcher)
- **Frontend**: Vite dev server configured on `:5173`, production bundle served on `:8765`
- **Blockers / Open Issues**: None currently flagged.

---

## 📋 Immediate Next Steps

1. Wait for user instruction on current task (feature, bugfix, or refactor).
2. If new feature or architectural design is introduced, trigger `grill-me` interview rounds first.
3. Update this state file after every significant code edit or task completion.

---

## 💡 Quick Launch & Test Commands

```bash
# Unified dev launch (FastAPI + Vite)
python signalmap/start.py

# Backend only
python signalmap/start.py --backend-only

# Frontend dev only
cd signalmap/web && npm run dev
```
