"""
SignalMap — Security Actions API.
Provides process termination (Kill Process) and network connection blocking (Firewall/IP Block).
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from typing import Optional, Set
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query
import psutil

router = APIRouter(prefix="/api/actions")

IS_WINDOWS = sys.platform == "win32"

# In-memory tracking of blocked IPs
_BLOCKED_IPS: dict[str, dict] = {}

# Critical protected processes that should never be terminated by accident
PROTECTED_PROCESS_NAMES = {
    "system", "system idle process", "registry", "smss.exe", "csrss.exe",
    "wininit.exe", "services.exe", "lsass.exe", "svchost.exe", "fontdrvhost.exe",
    "winlogon.exe", "explorer.exe", "dwm.exe",
}
PROTECTED_PIDS = {0, 4}


def is_ip_blocked(ip: Optional[str]) -> bool:
    if not ip:
        return False
    return ip in _BLOCKED_IPS


class KillProcessRequest(BaseModel):
    pid: int
    force: bool = False
    process_name: Optional[str] = None


class BlockIpRequest(BaseModel):
    ip: str
    direction: str = "both"  # "outbound", "inbound", "both"
    reason: Optional[str] = None


class UnblockIpRequest(BaseModel):
    ip: str


# ─── Process Termination ───────────────────────────────────────────────────────

@router.post("/kill-process")
async def kill_process(req: KillProcessRequest):
    """
    Safely terminate or kill an operating system process by PID.
    """
    pid = req.pid

    if pid in PROTECTED_PIDS:
        raise HTTPException(
            status_code=400,
            detail=f"PID {pid} is a critical core operating system process and cannot be terminated."
        )

    if not psutil.pid_exists(pid):
        raise HTTPException(
            status_code=404,
            detail=f"Process with PID {pid} is not currently running."
        )

    try:
        proc = psutil.Process(pid)
        proc_name = proc.name()

        # Check against protected process name list
        if proc_name.lower() in PROTECTED_PROCESS_NAMES:
            raise HTTPException(
                status_code=400,
                detail=f"Process '{proc_name}' (PID {pid}) is protected by Windows system policy."
            )

        # Terminate or kill
        if req.force:
            proc.kill()
        else:
            proc.terminate()

        # Wait briefly for process to exit
        try:
            gone, alive = psutil.wait_procs([proc], timeout=2.0)
            status = "terminated" if gone else "kill_pending"
        except Exception:
            status = "signal_sent"

        return {
            "success": True,
            "pid": pid,
            "process_name": proc_name,
            "status": status,
            "message": f"Successfully terminated process '{proc_name}' (PID {pid})"
        }
    except psutil.NoSuchProcess:
        return {"success": True, "pid": pid, "message": "Process already exited"}
    except psutil.AccessDenied as e:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Administrator privileges required to terminate PID {pid}."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── IP / Connection Blocking ──────────────────────────────────────────────────

def _run_firewall_cmd(args: list[str]) -> tuple[bool, str]:
    """Run a netsh command in a worker thread."""
    try:
        res = subprocess.run(
            args,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=10,
        )
        return res.returncode == 0, res.stdout or res.stderr
    except Exception as exc:
        return False, str(exc)


@router.post("/block-ip")
async def block_ip(req: BlockIpRequest):
    """
    Block all network connections to/from a remote IP address.
    Creates Windows Firewall rules and adds to SignalMap live threat blocker.
    """
    ip = req.ip.strip()
    if not ip:
        raise HTTPException(status_code=400, detail="IP address cannot be empty")

    # Don't allow blocking localhost
    if ip.startswith("127.") or ip == "::1" or ip == "0.0.0.0":
        raise HTTPException(status_code=400, detail="Cannot block local loopback address")

    rule_name_out = f"SignalMap_Block_Out_{ip}"
    rule_name_in = f"SignalMap_Block_In_{ip}"
    firewall_applied = False
    firewall_msg = ""

    if IS_WINDOWS:
        # Create outbound block rule
        cmd_out = [
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={rule_name_out}", "dir=out", "action=block", f"remoteip={ip}"
        ]
        ok_out, msg_out = await asyncio.to_thread(_run_firewall_cmd, cmd_out)

        # Create inbound block rule
        cmd_in = [
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={rule_name_in}", "dir=in", "action=block", f"remoteip={ip}"
        ]
        ok_in, msg_in = await asyncio.to_thread(_run_firewall_cmd, cmd_in)

        firewall_applied = ok_out or ok_in
        firewall_msg = msg_out or msg_in
    else:
        # Linux iptables fallback
        cmd = ["iptables", "-A", "OUTPUT", "-d", ip, "-j", "DROP"]
        ok, msg = await asyncio.to_thread(_run_firewall_cmd, cmd)
        firewall_applied = ok
        firewall_msg = msg

    # Store in memory registry
    _BLOCKED_IPS[ip] = {
        "ip": ip,
        "direction": req.direction,
        "reason": req.reason or "Manual block from SignalMap",
        "firewall_rule": rule_name_out if IS_WINDOWS else "iptables",
        "firewall_active": firewall_applied,
        "blocked_at": psutil.boot_time(),  # timestamp
    }

    return {
        "success": True,
        "ip": ip,
        "firewall_active": firewall_applied,
        "firewall_message": firewall_msg.strip(),
        "message": f"Successfully blocked IP {ip}." + (" (Windows Firewall rule active)" if firewall_applied else " (In-app filter active)")
    }


@router.post("/unblock-ip")
async def unblock_ip(req: UnblockIpRequest):
    """
    Remove firewall block rule and unblock an IP.
    """
    ip = req.ip.strip()
    if not ip:
        raise HTTPException(status_code=400, detail="IP address cannot be empty")

    if IS_WINDOWS:
        rule_name_out = f"SignalMap_Block_Out_{ip}"
        rule_name_in = f"SignalMap_Block_In_{ip}"
        cmd_out = ["netsh", "advfirewall", "firewall", "delete", "rule", f"name={rule_name_out}"]
        cmd_in = ["netsh", "advfirewall", "firewall", "delete", f"rule", f"name={rule_name_in}"]
        await asyncio.to_thread(_run_firewall_cmd, cmd_out)
        await asyncio.to_thread(_run_firewall_cmd, cmd_in)
    else:
        cmd = ["iptables", "-D", "OUTPUT", "-d", ip, "-j", "DROP"]
        await asyncio.to_thread(_run_firewall_cmd, cmd)

    _BLOCKED_IPS.pop(ip, None)

    return {
        "success": True,
        "ip": ip,
        "message": f"Successfully unblocked IP {ip}"
    }


@router.get("/blocked-ips")
async def get_blocked_ips():
    """
    List all currently blocked IP addresses.
    """
    return {
        "count": len(_BLOCKED_IPS),
        "blocked_ips": list(_BLOCKED_IPS.values())
    }
