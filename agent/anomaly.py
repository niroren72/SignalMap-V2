"""
SignalMap — Anomaly & Threat Detection Engine.

Analyzes ConnectionEvents against behavioral security rules,
suspicious process signatures, high-risk destination ports, and network patterns.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional
import yaml

from .schema import ConnectionEvent, AnomalyInfo, Severity, Direction


# Processes that should typically not initiate unsolicited outbound internet connections
SUSPICIOUS_OUTBOUND_PROCESSES = {
    "powershell.exe": (Severity.HIGH, "PowerShell Outbound Connection", "Command shell initiating network connection, often indicative of remote scripts or reverse shells"),
    "pwsh.exe": (Severity.HIGH, "PowerShell Core Outbound Connection", "PowerShell Core initiating network traffic"),
    "cmd.exe": (Severity.HIGH, "Command Prompt Network Connection", "CMD process communicating over network"),
    "rundll32.exe": (Severity.CRITICAL, "Rundll32 Network Connection", "Rundll32 executing code with external network activity (potential living-off-the-land attack)"),
    "regsvr32.exe": (Severity.CRITICAL, "Regsvr32 Network Activity", "Regsvr32 executing external connection (Squiblydoo attack vector)"),
    "certutil.exe": (Severity.HIGH, "CertUtil Download/Connection", "Certutil network communication, often abused for payload downloading"),
    "wscript.exe": (Severity.HIGH, "WScript Network Activity", "Windows Script Host communicating externally"),
    "cscript.exe": (Severity.HIGH, "CScript Network Activity", "Command-line Script Host communicating externally"),
    "mshta.exe": (Severity.CRITICAL, "MSHTA Outbound Connection", "Microsoft HTML Application executing outbound request"),
    "bitsadmin.exe": (Severity.HIGH, "BITSAdmin Network Transfer", "Background Intelligent Transfer Service abused for external download"),
    "vssadmin.exe": (Severity.CRITICAL, "VSSAdmin Network Activity", "Shadow copy administrator process with network activity"),
}

# High-risk / Trojan / Attack ports
SUSPICIOUS_PORTS = {
    4444: (Severity.CRITICAL, "Metasploit / C2 Default Port", "Connection to port 4444 (commonly used by Metasploit payload listeners)"),
    1337: (Severity.HIGH, "Elite / Hacker Port", "Connection to classic backdoor port 1337"),
    31337: (Severity.CRITICAL, "BackOrifice Trojan Port", "Connection to port 31337 (BackOrifice backdoor)"),
    6667: (Severity.MEDIUM, "IRC Botnet Communication Port", "Outbound connection to IRC port 6667 (frequent legacy C2 channel)"),
    5555: (Severity.MEDIUM, "Android ADB / Mining Port", "Connection to port 5555 (ADB open port or cryptominer communication)"),
    8888: (Severity.LOW, "Alternative HTTP / Proxy Port", "Connection on port 8888 (common alternate web proxy/C2)"),
    23: (Severity.HIGH, "Telnet Insecure Protocol", "Connection over unencrypted Telnet port 23"),
    21: (Severity.LOW, "FTP Insecure Protocol", "Unencrypted FTP control connection on port 21"),
}


class AnomalyEngine:
    """Rule evaluation engine for connection events with YAML signature support."""

    def __init__(self, rules_path: Optional[str | Path] = None):
        self.rules_path = Path(rules_path) if rules_path else Path(__file__).resolve().parent.parent / "rules" / "threat_signatures.yaml"
        self.suspicious_processes = dict(SUSPICIOUS_OUTBOUND_PROCESSES)
        self.suspicious_ports = dict(SUSPICIOUS_PORTS)
        self.process_mitre = {}
        self.port_mitre = {}
        self.process_tags = {}
        self.port_tags = {}
        self.load_rules()

    def load_rules(self):
        """Loads declarative threat signatures from YAML rules file if present."""
        if not self.rules_path or not self.rules_path.exists():
            return
        try:
            with open(self.rules_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            if not data or "threat_signatures" not in data:
                return
            sigs = data["threat_signatures"]

            # Load process rules
            for proc, meta in sigs.get("processes", {}).items():
                sev_str = str(meta.get("severity", "high")).upper()
                sev = getattr(Severity, sev_str, Severity.HIGH)
                title = meta.get("title", f"Suspicious Process: {proc}")
                desc = meta.get("description", "")
                proc_key = proc.lower()
                self.suspicious_processes[proc_key] = (sev, title, desc)
                if "mitre" in meta:
                    self.process_mitre[proc_key] = meta["mitre"]
                if "tags" in meta:
                    self.process_tags[proc_key] = meta["tags"]

            # Load port rules
            for port, meta in sigs.get("ports", {}).items():
                port_num = int(port)
                sev_str = str(meta.get("severity", "medium")).upper()
                sev = getattr(Severity, sev_str, Severity.MEDIUM)
                title = meta.get("title", f"High Risk Port {port_num}")
                desc = meta.get("description", "")
                self.suspicious_ports[port_num] = (sev, title, desc)
                if "mitre" in meta:
                    self.port_mitre[port_num] = meta["mitre"]
                if "tags" in meta:
                    self.port_tags[port_num] = meta["tags"]
        except Exception:
            pass

    def inspect(self, event: ConnectionEvent) -> Optional[AnomalyInfo]:
        """
        Evaluate an event against anomaly rules.
        Returns AnomalyInfo if an anomaly/threat is detected, else None.
        """
        proc_name = (event.local.process_name or "").lower()
        remote_ip = event.remote.ip or ""
        remote_port = event.remote.port or 0
        hostname = event.remote.hostname or ""

        # Skip private/loopback connections for process checks unless critical port
        is_private = (
            remote_ip.startswith("127.")
            or remote_ip.startswith("10.")
            or remote_ip.startswith("192.168.")
            or remote_ip.startswith("172.16.")
            or remote_ip == "::1"
            or remote_ip == "localhost"
        )

        # ── Rule 1: Suspicious Process Outbound ──────────────────────────────
        if proc_name in self.suspicious_processes and not is_private:
            sev, title, desc = self.suspicious_processes[proc_name]
            tags = list(self.process_tags.get(proc_name, ["mitre:execution", "process:shell", "lotl"]))
            if proc_name in self.process_mitre:
                mitre_tag = f"mitre:{self.process_mitre[proc_name]}"
                if mitre_tag not in tags:
                    tags.append(mitre_tag)
            return AnomalyInfo(
                is_anomaly=True,
                severity=sev,
                title=title,
                description=f"{proc_name} (PID: {event.local.pid}) connected to {remote_ip}:{remote_port}. {desc}",
                rule="SUSPICIOUS_PROCESS_OUTBOUND",
                tags=tags
            )

        # ── Rule 2: Suspicious / C2 Port ──────────────────────────────────
        if remote_port in self.suspicious_ports and not is_private:
            sev, title, desc = self.suspicious_ports[remote_port]
            tags = list(self.port_tags.get(remote_port, ["c2", "trojan", f"port:{remote_port}"]))
            if remote_port in self.port_mitre:
                mitre_tag = f"mitre:{self.port_mitre[remote_port]}"
                if mitre_tag not in tags:
                    tags.append(mitre_tag)
            return AnomalyInfo(
                is_anomaly=True,
                severity=sev,
                title=title,
                description=f"Outbound connection to known suspicious port {remote_port} on {remote_ip}. {desc}",
                rule="HIGH_RISK_PORT",
                tags=tags
            )

        # ── Rule 3: SMB Outbound over WAN ─────────────────────────────────
        if remote_port in (445, 139) and not is_private and event.direction == Direction.OUTBOUND:
            return AnomalyInfo(
                is_anomaly=True,
                severity=Severity.HIGH,
                title="SMB Outbound over Internet",
                description=f"Outbound SMB/CIFS connection to {remote_ip}:{remote_port}. SMB exposed over WAN poses credential-relay and ransomware risk.",
                rule="SMB_OVER_WAN",
                tags=["mitre:credential-access", "smb", "wan-leak"]
            )

        # ── Rule 4: High Bandwidth Spike (> 100MB) ────────────────────────
        total_bytes = (event.metrics.bytes_in or 0) + (event.metrics.bytes_out or 0)
        if total_bytes > 100 * 1024 * 1024:
            return AnomalyInfo(
                is_anomaly=True,
                severity=Severity.MEDIUM,
                title="High Bandwidth Volume Spike",
                description=f"Connection transferred {total_bytes / (1024*1024):.1f} MB with endpoint {remote_ip}:{remote_port}.",
                rule="HIGH_BANDWIDTH_SPIKE",
                tags=["data-volume", "anomaly:traffic"]
            )

        # ── Rule 5: Raw IP Outbound with No Hostname to Untrusted ASN ──────
        if (
            not is_private
            and not hostname
            and not (event.service and event.service.name)
            and remote_port not in (80, 443, 8080)
            and remote_port > 1024
        ):
            # Direct non-standard port IP connection with no domain resolution
            return AnomalyInfo(
                is_anomaly=True,
                severity=Severity.LOW,
                title="Direct IP Connection (Non-Standard Port)",
                description=f"Direct outbound connection to {remote_ip}:{remote_port} without DNS PTR or classified service.",
                rule="DIRECT_IP_NON_STANDARD",
                tags=["unresolved-ip", f"port:{remote_port}"]
            )

        return None


# Global anomaly engine instance
anomaly_engine = AnomalyEngine()
