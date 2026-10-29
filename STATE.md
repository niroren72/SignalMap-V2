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
- `signalmap/web/src/components/LoadingScreen.tsx` (Exact antigravity.google WebGL GPGPU particle shader, Poisson-disk dots, size, color & ring displacement)
- `signalmap/agent/collectors/socket_collector.py` (Socket polling & process mapping)
- `signalmap/web/src/components/DetailPanel.tsx` (Slide-over detail inspector)
- `signalmap/web/src/components/LiveConnectionTable.tsx` / `ConnectionTable.tsx` (Telemetry grid)
- `signalmap/web/src/components/ModulesView.tsx` & `DashboardView.tsx` (App view components)
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
