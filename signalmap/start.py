"""
SignalMap — Single-command Windows launcher.

Usage:
    python start.py          # Dev mode: backend here + Vite in a new window
    python start.py --prod   # Production mode: build frontend then serve from backend
    python start.py --backend-only   # Start backend only (no frontend window)
"""

import subprocess
import sys
import os
import signal
import time
from pathlib import Path

# Safe encoding configuration on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
VENV_PYTHON = ROOT.parent / ".venv" / "Scripts" / "python.exe"

# Use the venv python if it exists, otherwise fall back to the running interpreter
PYTHON = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable


def _open_new_powershell(title: str, command: str, cwd: Path) -> subprocess.Popen:
    """Open a command in a new PowerShell window (Windows only)."""
    return subprocess.Popen(
        [
            "powershell.exe",
            "-NoExit",
            "-Command",
            f"$host.UI.RawUI.WindowTitle = '{title}'; {command}",
        ],
        cwd=str(cwd),
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )


def run_dev():
    """Start backend + Vite frontend side by side."""
    os.environ["SIGNALMAP_DEV"] = "1"

    print("=" * 55)
    print("  *  SignalMap - Development Mode")
    print("=" * 55)
    print(f"  Backend  ->  http://localhost:8765")
    print(f"  Frontend ->  http://localhost:5173")
    print(f"  Press Ctrl+C to stop both servers.")
    print("=" * 55)

    # Launch Vite in a new PowerShell window so it stays visible
    vite_proc = _open_new_powershell(
        title="SignalMap - Frontend (Vite)",
        command="npm run dev",
        cwd=WEB_DIR,
    )

    # Run the backend in this terminal (blocking)
    try:
        subprocess.run(
            [PYTHON, "-m", "agent.main"],
            cwd=str(ROOT),
        )
    except KeyboardInterrupt:
        print("\n* Stopping SignalMap...")
    finally:
        # Terminate the Vite window when backend exits
        try:
            vite_proc.terminate()
        except Exception:
            pass


def run_prod():
    """Build the frontend then serve everything from the backend."""
    os.environ["SIGNALMAP_DEV"] = "0"

    print("=" * 55)
    print("  *  SignalMap - Production Mode")
    print("=" * 55)

    # Build frontend
    print("\n[1/2] Building frontend...")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(WEB_DIR),
        shell=True,
    )
    if result.returncode != 0:
        print("[X] Frontend build failed. Aborting.")
        sys.exit(1)
    print("[OK] Frontend built successfully.\n")

    # Serve
    print("[2/2] Starting backend (serves built frontend)...")
    print("      Open -> http://localhost:8765")
    subprocess.run(
        [PYTHON, "-m", "agent.main"],
        cwd=str(ROOT),
    )


def run_backend_only():
    """Start only the backend (useful when frontend is already running)."""
    os.environ["SIGNALMAP_DEV"] = "1"
    print("* Starting backend only -> http://localhost:8765")
    subprocess.run(
        [PYTHON, "-m", "agent.main"],
        cwd=str(ROOT),
    )


def main():
    if "--prod" in sys.argv:
        run_prod()
    elif "--backend-only" in sys.argv:
        run_backend_only()
    else:
        run_dev()


if __name__ == "__main__":
    main()
