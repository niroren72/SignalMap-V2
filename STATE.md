# 📍 Project State & Session Context

> **Last Updated**: 2026-10-29  
> **Workspace**: `c:\Users\User\Documents\MyProject\Antigravity DevEX`  
> **Primary Project**: `signalmap` (Real-time network traffic visualization & socket monitoring)

---

## 🎯 Current Focus & Objectives

- **Active Project**: SignalMap (`signalmap/`)
- **Key Modules**:
  - `agent/`: Python daemon (FastAPI, WebSockets, `psutil`, GeoIP2, `aiosqlite`, enrichment pipeline)
  - `web/`: React 18 + Vite frontend (3D Globe via `globe.gl`, 3D Topology via `react-force-graph-3d`, Connections Grid, Telemetry detail panel)
- **Recent Focus Area**: Socket collection, connection tables, and module views.

---

## 🛠️ Active & Recently Touched Files

- `signalmap/agent/collectors/salesforce_collector.py` & `signalmap/agent/api/connectors.py` & `signalmap/agent/main.py` (Implemented live Salesforce Cloud Security Connector supporting 1-Click Browser OAuth 2.0 PKCE via `PlatformCLI` on port 1717, multi-endpoint SOAP & OAuth 2.0 Username/Password login with URL path normalization, Client Credentials, Access Token, and `sf` CLI auto-import across `LoginHistory` + `LoginGeo`, `AuthSession`, `SetupAuditTrail`, `ReportEvent`, `ApiEvent`, and `EventLogFile`)
- `signalmap/web/src/components/SalesforceConfigModal.tsx`, `ModulesView.tsx`, `ConnectionTable.tsx`, `LiveConnectionTable.tsx`, & `hooks/useConnections.ts` (Added interactive Salesforce Tenant Config Modal with synchronous `window.open` popup handling, resilient `sfApiFetch` direct-to-`:8765` fallback, live org status & sync controls, and granular `salesforce_login`, `salesforce_session`, `salesforce_audit`, `salesforce_api`, and `salesforce_report` Data Source badges)
- `signalmap/web/src/components/LoadingScreen.tsx`, `signalmap/web/src/App.tsx`, `signalmap/web/src/suppressThreeWarnings.ts`, `signalmap/web/src/main.tsx`, & `signalmap/web/vite.config.ts` (Added `try/catch` WebGL context creation guard, `renderer.forceContextLoss()` cleanup, and `SafeErrorBoundary` in `App.tsx` to prevent `THREE.WebGLRenderer: Error creating WebGL context`; fixed `onComplete` timer reset and reduced initial load duration)
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
