"""
SignalMap — Network Utilities REST API.
Provides server-side network diagnostic tools: ping, traceroute, nslookup, whois, and path/PoP lookup.
"""

from __future__ import annotations

import asyncio
import json
import re
import socket
import subprocess
import sys
from typing import Optional

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/netutils")

# ─── Helpers ──────────────────────────────────────────────────────────────────

IS_WINDOWS = sys.platform == "win32"


def _strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


async def _run_proc(args: list[str], timeout: int = 30) -> tuple[int, str, str]:
    """Run a subprocess and return (returncode, stdout, stderr)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode or 0, stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace")
    except asyncio.TimeoutError:
        return 1, "", f"Command timed out after {timeout}s"
    except Exception as exc:
        return 1, "", str(exc)


# ─── Ping ─────────────────────────────────────────────────────────────────────

@router.get("/ping")
async def ping(
    target: str = Query(..., description="Hostname or IP to ping"),
    count: int = Query(4, ge=1, le=20),
):
    """Run an ICMP ping and return parsed results."""
    if IS_WINDOWS:
        args = ["ping", "-n", str(count), target]
    else:
        args = ["ping", "-c", str(count), target]

    rc, stdout, stderr = await _run_proc(args, timeout=30)
    output = stdout or stderr

    # Parse summary line
    stats: dict = {}
    if IS_WINDOWS:
        # "Minimum = Xms, Maximum = Xms, Average = Xms"
        m = re.search(r"Minimum = (\d+)ms.*Maximum = (\d+)ms.*Average = (\d+)ms", output, re.IGNORECASE)
        if m:
            stats = {"min_ms": int(m.group(1)), "max_ms": int(m.group(2)), "avg_ms": int(m.group(3))}
        # Packets: "Sent = X, Received = Y, Lost = Z"
        pm = re.search(r"Sent = (\d+), Received = (\d+), Lost = (\d+)", output, re.IGNORECASE)
        if pm:
            stats["sent"] = int(pm.group(1))
            stats["received"] = int(pm.group(2))
            stats["lost"] = int(pm.group(3))
    else:
        m = re.search(r"rtt min/avg/max/mdev = ([\d.]+)/([\d.]+)/([\d.]+)", output)
        if m:
            stats = {"min_ms": float(m.group(1)), "avg_ms": float(m.group(2)), "max_ms": float(m.group(3))}
        pm = re.search(r"(\d+) packets transmitted, (\d+) received", output)
        if pm:
            stats["sent"] = int(pm.group(1))
            stats["received"] = int(pm.group(2))
            stats["lost"] = int(pm.group(1)) - int(pm.group(2))

    # Parse individual echo lines
    echo_lines = []
    if IS_WINDOWS:
        for line in output.splitlines():
            lm = re.search(r"Reply from ([\d.]+).*?time[=<]([\d.]+)ms", line, re.IGNORECASE)
            if lm:
                echo_lines.append({"ip": lm.group(1), "time_ms": float(lm.group(2))})
            elif "Request timed out" in line or "unreachable" in line.lower():
                echo_lines.append({"ip": None, "time_ms": None, "timeout": True})
    else:
        for line in output.splitlines():
            lm = re.search(r"from ([\d.]+).*?time=([\d.]+) ms", line)
            if lm:
                echo_lines.append({"ip": lm.group(1), "time_ms": float(lm.group(2))})

    return {
        "target": target,
        "success": rc == 0,
        "output": output,
        "stats": stats,
        "echoes": echo_lines,
    }


# ─── Traceroute ───────────────────────────────────────────────────────────────

@router.get("/traceroute")
async def traceroute(
    target: str = Query(..., description="Hostname or IP to traceroute"),
    max_hops: int = Query(30, ge=5, le=64),
):
    """Run a traceroute and return each hop with geo-enrichment."""
    if IS_WINDOWS:
        args = ["tracert", "-h", str(max_hops), "-w", "500", target]
    else:
        args = ["traceroute", "-m", str(max_hops), "-w", "1", target]

    rc, stdout, stderr = await _run_proc(args, timeout=90)
    output = stdout or stderr
    hops = _parse_traceroute(output, is_windows=IS_WINDOWS)

    # Enrich hops with geo info
    enriched_hops = []
    async with httpx.AsyncClient(timeout=8.0) as client:
        for hop in hops:
            if hop.get("ip") and not _is_private(hop["ip"]):
                try:
                    resp = await client.get(f"http://ip-api.com/json/{hop['ip']}?fields=status,country,city,org,isp,lat,lon,as")
                    if resp.status_code == 200:
                        geo = resp.json()
                        if geo.get("status") == "success":
                            hop["geo"] = {
                                "country": geo.get("country"),
                                "city": geo.get("city"),
                                "org": geo.get("org") or geo.get("isp"),
                                "lat": geo.get("lat"),
                                "lon": geo.get("lon"),
                                "asn": geo.get("as"),
                            }
                except Exception:
                    pass
            enriched_hops.append(hop)

    return {
        "target": target,
        "success": rc == 0,
        "output": output,
        "hops": enriched_hops,
    }


def _parse_traceroute(output: str, is_windows: bool) -> list[dict]:
    hops = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        if is_windows:
            # "  1    <1 ms    <1 ms    <1 ms  192.168.68.1"
            m = re.match(
                r"^\s*(\d+)\s+"
                r"((?:<?\d+\s*ms|\*)\s+){3}"
                r"(.+)?$",
                line,
            )
            if m:
                hop_num = int(m.group(1))
                rest = line[m.start(3) or len(line):].strip() if m.group(3) else ""
                times_raw = re.findall(r"<?\s*(\d+)\s*ms", line)
                times = [int(t) for t in times_raw]
                ip_m = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", rest)
                hop_ip = ip_m.group(1) if ip_m else None
                hostname_m = re.match(r"^([^\s\[]+)", rest)
                hostname = hostname_m.group(1) if hostname_m and not re.match(r"^\d+\.\d+", rest) else None
                hops.append({
                    "hop": hop_num,
                    "ip": hop_ip,
                    "hostname": hostname,
                    "times_ms": times,
                    "avg_ms": round(sum(times) / len(times), 1) if times else None,
                    "timeout": "*" in line and not times,
                })
        else:
            m = re.match(r"^\s*(\d+)\s+(.+)$", line)
            if m:
                hop_num = int(m.group(1))
                rest = m.group(2)
                times_raw = re.findall(r"([\d.]+)\s*ms", rest)
                times = [float(t) for t in times_raw]
                ip_m = re.search(r"\(([\d.]+)\)", rest)
                hop_ip = ip_m.group(1) if ip_m else None
                hops.append({
                    "hop": hop_num,
                    "ip": hop_ip,
                    "times_ms": times,
                    "avg_ms": round(sum(times) / len(times), 1) if times else None,
                    "timeout": "*" in rest and not times,
                })
    return hops


# ─── DNS Lookup ───────────────────────────────────────────────────────────────

@router.get("/nslookup")
async def nslookup(
    target: str = Query(..., description="Hostname or IP to resolve"),
):
    """Run a DNS lookup for a hostname or reverse-lookup an IP."""
    results: dict = {"target": target, "forward": [], "reverse": None, "mx": [], "txt": []}

    try:
        # Forward: A records
        infos = socket.getaddrinfo(target, None)
        ips = list({info[4][0] for info in infos})
        results["forward"] = ips
    except socket.gaierror as e:
        results["error"] = str(e)

    # Reverse lookup if target looks like an IP
    if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", target):
        try:
            hostname, _, _ = socket.gethostbyaddr(target)
            results["reverse"] = hostname
        except Exception:
            results["reverse"] = None

    # Try to get MX + TXT via system nslookup
    if IS_WINDOWS:
        rc, mx_out, _ = await _run_proc(["nslookup", "-type=MX", target], timeout=10)
    else:
        rc, mx_out, _ = await _run_proc(["nslookup", "-type=MX", target], timeout=10)
    mx_records = re.findall(r"mail exchanger = (.+)", mx_out)
    results["mx"] = [m.strip() for m in mx_records]

    if IS_WINDOWS:
        rc2, txt_out, _ = await _run_proc(["nslookup", "-type=TXT", target], timeout=10)
    else:
        rc2, txt_out, _ = await _run_proc(["nslookup", "-type=TXT", target], timeout=10)
    txt_records = re.findall(r'"([^"]+)"', txt_out)
    results["txt"] = txt_records[:5]  # Limit

    return results


# ─── WHOIS ────────────────────────────────────────────────────────────────────

@router.get("/whois")
async def whois(
    target: str = Query(..., description="IP or domain for WHOIS lookup"),
):
    """Perform a WHOIS lookup via RDAP (preferred) or whois command."""
    # Try RDAP first (IP)
    if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", target):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"https://rdap.arin.net/registry/ip/{target}")
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "target": target,
                        "source": "rdap",
                        "name": data.get("name"),
                        "handle": data.get("handle"),
                        "country": data.get("country"),
                        "startAddress": data.get("startAddress"),
                        "endAddress": data.get("endAddress"),
                        "remarks": [
                            r.get("description", [""])[0]
                            for r in (data.get("remarks") or [])
                            if r.get("description")
                        ][:3],
                        "entities": [
                            e.get("handle")
                            for e in (data.get("entities") or [])
                        ][:5],
                        "raw": None,
                    }
        except Exception:
            pass

    # Fallback: system whois / ipinfo
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://ipinfo.io/{target}/json")
            if resp.status_code == 200:
                d = resp.json()
                return {
                    "target": target,
                    "source": "ipinfo",
                    "name": d.get("org"),
                    "country": d.get("country"),
                    "city": d.get("city"),
                    "region": d.get("region"),
                    "asn": d.get("org"),
                    "hostname": d.get("hostname"),
                    "raw": None,
                }
    except Exception:
        pass

    # Last resort: system whois binary
    if not IS_WINDOWS:
        rc, out, err = await _run_proc(["whois", target], timeout=15)
        return {"target": target, "source": "system", "raw": out or err}

    return {"target": target, "source": "none", "error": "WHOIS not available"}


# ─── Connection Path (PoP Trace) ──────────────────────────────────────────────

@router.get("/path")
async def connection_path(
    remote_ip: str = Query(..., description="Remote IP for path visualization"),
    remote_port: Optional[int] = Query(None),
    local_ip: str = Query("127.0.0.1"),
):
    """
    Build an end-to-end connection path from local machine → internet PoPs → remote server.
    Uses traceroute + geo-enrichment to construct a path with PoP labels.
    """
    # Geo-enrich remote IP
    remote_geo = None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"http://ip-api.com/json/{remote_ip}?fields=status,country,city,org,isp,lat,lon,as,query")
            if resp.status_code == 200:
                geo = resp.json()
                if geo.get("status") == "success":
                    remote_geo = {
                        "ip": remote_ip,
                        "country": geo.get("country"),
                        "city": geo.get("city"),
                        "org": geo.get("org") or geo.get("isp"),
                        "lat": geo.get("lat"),
                        "lon": geo.get("lon"),
                        "asn": geo.get("as"),
                    }
    except Exception:
        pass

    # Run traceroute for path hops
    if IS_WINDOWS:
        args = ["tracert", "-h", "20", "-w", "300", remote_ip]
    else:
        args = ["traceroute", "-m", "20", "-w", "1", remote_ip]

    rc, stdout, stderr = await _run_proc(args, timeout=60)
    hops = _parse_traceroute(stdout or stderr, is_windows=IS_WINDOWS)

    # Geo-enrich each public hop
    enriched_hops = []
    async with httpx.AsyncClient(timeout=6.0) as client:
        for hop in hops:
            if hop.get("ip") and not _is_private(hop["ip"]):
                try:
                    resp = await client.get(
                        f"http://ip-api.com/json/{hop['ip']}?fields=status,country,city,org,isp,lat,lon,as"
                    )
                    if resp.status_code == 200:
                        geo = resp.json()
                        if geo.get("status") == "success":
                            hop["geo"] = {
                                "country": geo.get("country"),
                                "city": geo.get("city"),
                                "org": geo.get("org") or geo.get("isp"),
                                "lat": geo.get("lat"),
                                "lon": geo.get("lon"),
                                "asn": geo.get("as"),
                                "is_pop": _classify_pop(geo.get("org") or ""),
                            }
                except Exception:
                    pass
            elif hop.get("ip") and _is_private(hop["ip"]):
                hop["geo"] = {
                    "country": "Local",
                    "city": "LAN",
                    "org": "Local Network",
                    "lat": None,
                    "lon": None,
                    "is_pop": False,
                }
            enriched_hops.append(hop)

    # Get origin geo (our external IP)
    origin_geo = None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get("http://ip-api.com/json/?fields=status,country,city,org,lat,lon,query")
            if resp.status_code == 200:
                g = resp.json()
                if g.get("status") == "success":
                    origin_geo = {
                        "ip": g.get("query"),
                        "country": g.get("country"),
                        "city": g.get("city"),
                        "org": g.get("org"),
                        "lat": g.get("lat"),
                        "lon": g.get("lon"),
                    }
    except Exception:
        pass

    return {
        "local_ip": local_ip,
        "remote_ip": remote_ip,
        "remote_port": remote_port,
        "origin_geo": origin_geo,
        "remote_geo": remote_geo,
        "hops": enriched_hops,
        "hop_count": len([h for h in enriched_hops if not h.get("timeout")]),
        "total_hops": len(enriched_hops),
    }


# ─── Ifconfig / IPConfig (Network Adapters) ──────────────────────────────────

@router.get("/ifconfig")
async def ifconfig_view():
    """
    List all local network interfaces, addresses, MACs, link speeds, and I/O metrics.
    """
    import psutil
    import time

    # Raw system output
    raw_cmd = ["ipconfig", "/all"] if IS_WINDOWS else ["ifconfig"]
    rc, stdout, stderr = await _run_proc(raw_cmd, timeout=10)
    raw_output = stdout or stderr

    # Structured adapter collection via psutil
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    io_counters = psutil.net_io_counters(pernic=True)

    interfaces = []
    for iface_name, addr_list in addrs.items():
        iface_stat = stats.get(iface_name)
        iface_io = io_counters.get(iface_name)

        ipv4_list = []
        ipv6_list = []
        mac_addr = None
        netmask = None

        for a in addr_list:
            # Address family check
            if hasattr(socket, "AF_INET") and a.family == socket.AF_INET:
                ipv4_list.append(a.address)
                if a.netmask:
                    netmask = a.netmask
            elif hasattr(socket, "AF_INET6") and a.family == socket.AF_INET6:
                ipv6_list.append(a.address)
            elif hasattr(psutil, "AF_LINK") and a.family == psutil.AF_LINK:
                mac_addr = a.address
            elif a.family == -1 or "link" in str(a.family).lower():
                mac_addr = a.address

        # Determine connection type
        is_loopback = any(ip.startswith("127.") for ip in ipv4_list) or "loopback" in iface_name.lower()
        is_wireless = "wi-fi" in iface_name.lower() or "wlan" in iface_name.lower() or "wireless" in iface_name.lower()

        interfaces.append({
            "name": iface_name,
            "is_up": iface_stat.isup if iface_stat else False,
            "speed_mbps": iface_stat.speed if iface_stat else 0,
            "mtu": iface_stat.mtu if iface_stat else 1500,
            "type": "loopback" if is_loopback else ("wireless" if is_wireless else "ethernet"),
            "ipv4": ipv4_list,
            "ipv6": [ip for ip in ipv6_list if not ip.startswith("fe80:")][:2],
            "netmask": netmask,
            "mac": mac_addr,
            "bytes_sent": iface_io.bytes_sent if iface_io else 0,
            "bytes_recv": iface_io.bytes_recv if iface_io else 0,
            "packets_sent": iface_io.packets_sent if iface_io else 0,
            "packets_recv": iface_io.packets_recv if iface_io else 0,
        })

    # Sort so active/connected interfaces come first
    interfaces.sort(key=lambda x: (not x["is_up"], len(x["ipv4"]) == 0, x["type"] == "loopback"))

    return {
        "success": True,
        "interfaces": interfaces,
        "total_interfaces": len(interfaces),
        "raw": raw_output,
    }


# ─── Netstat (Active Sockets & Ports) ─────────────────────────────────────────

@router.get("/netstat")
async def netstat_view(
    state: Optional[str] = Query("all", description="Filter by state: all, listening, established"),
    proto: Optional[str] = Query("all", description="Filter by protocol: all, tcp, udp"),
    limit: int = Query(250, ge=10, le=1000),
):
    """
    List active listening ports and established network connections with process info.
    """
    import psutil

    state_filter = (state if isinstance(state, str) else "all").lower()
    proto_filter = (proto if isinstance(proto, str) else "all").lower()
    max_limit = limit if isinstance(limit, int) else 250

    connections = []
    listening_count = 0
    established_count = 0
    close_wait_count = 0

    try:
        raw_conns = psutil.net_connections(kind="inet")
    except Exception as exc:
        raw_conns = []

    # Cache PID -> name
    proc_cache: dict[int, str] = {}
    for c in raw_conns:
        c_status = (c.status or "").lower()
        if c_status == "listen":
            listening_count += 1
        elif c_status == "established":
            established_count += 1
        elif "close" in c_status:
            close_wait_count += 1

        # Filtering
        if state_filter != "all":
            if state_filter == "listening" and c_status != "listen":
                continue
            if state_filter == "established" and c_status != "established":
                continue

        c_proto = "udp" if c.type == socket.SOCK_DGRAM else "tcp"
        if proto_filter != "all" and c_proto != proto_filter:
            continue

        p_name = "System"
        if c.pid:
            if c.pid not in proc_cache:
                try:
                    proc_cache[c.pid] = psutil.Process(c.pid).name()
                except Exception:
                    proc_cache[c.pid] = "unknown"
            p_name = proc_cache[c.pid]

        l_addr = f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else ""
        r_addr = f"{c.raddr.ip}:{c.raddr.port}" if c.raddr else ""

        connections.append({
            "proto": c_proto.upper(),
            "local_addr": l_addr,
            "remote_addr": r_addr or "*:*",
            "state": c.status or ("LISTEN" if c_proto == "udp" else "UNKNOWN"),
            "pid": c.pid,
            "process_name": p_name,
        })

    # Raw CLI output fallback
    raw_cmd = ["netstat", "-ano"] if IS_WINDOWS else ["netstat", "-tulpen"]
    rc, stdout, stderr = await _run_proc(raw_cmd, timeout=10)

    return {
        "success": True,
        "stats": {
            "total": len(raw_conns),
            "listening": listening_count,
            "established": established_count,
            "close_wait": close_wait_count,
        },
        "connections": connections[:max_limit],
        "raw": stdout or stderr,
    }


# ─── DIG (Advanced DNS Record Query) ──────────────────────────────────────────

@router.get("/dig")
async def dig_view(
    target: str = Query(..., description="Domain name to query"),
    record_type: str = Query("A", description="DNS record type: A, AAAA, CNAME, MX, TXT, NS, SOA, ANY"),
):
    """
    Perform deep DNS query via DNS-over-HTTPS (DoH) and system resolver, returning full records, TTL, and authority.
    """
    import time
    clean_target = re.sub(r"^https?://", "", target).split("/")[0].strip()
    r_type = (record_type if isinstance(record_type, str) else "A").upper().strip()

    # DNS Type code mapping for RFC DoH
    type_map = {
        "A": 1, "NS": 2, "CNAME": 5, "SOA": 6, "PTR": 12, "MX": 15, "TXT": 16, "AAAA": 28, "ANY": 255
    }
    type_code = type_map.get(r_type, 1)

    records = []
    authority = []
    response_code = "NOERROR"
    query_time_ms = 0.0

    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://cloudflare-dns.com/dns-query",
                params={"name": clean_target, "type": r_type},
                headers={"accept": "application/dns-json"},
            )
            query_time_ms = round((time.perf_counter() - t0) * 1000, 1)

            if resp.status_code == 200:
                data = resp.json()
                status_code = data.get("Status", 0)
                status_names = {0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 5: "REFUSED"}
                response_code = status_names.get(status_code, f"RCODE_{status_code}")

                # Answer section
                code_to_name = {v: k for k, v in type_map.items()}
                for ans in data.get("Answer", []):
                    rec_type_str = code_to_name.get(ans.get("type"), str(ans.get("type")))
                    records.append({
                        "name": ans.get("name"),
                        "type": rec_type_str,
                        "ttl": ans.get("TTL"),
                        "data": ans.get("data", "").strip('"'),
                    })

                # Authority section
                for auth in data.get("Authority", []):
                    authority.append({
                        "name": auth.get("name"),
                        "type": code_to_name.get(auth.get("type"), str(auth.get("type"))),
                        "ttl": auth.get("TTL"),
                        "data": auth.get("data", "").strip('"'),
                    })
    except Exception as exc:
        query_time_ms = round((time.perf_counter() - t0) * 1000, 1)
        response_code = f"ERROR: {exc}"

    # Generate dig-style formatted text output
    raw_lines = [
        f"; <<>> DiG (SignalMap Cyber Engine) <<>> {clean_target} {r_type}",
        ";; Got answer:",
        f";; ->>HEADER<<- opcode: QUERY, status: {response_code}",
        f";; flags: qr rd ra; QUERY: 1, ANSWER: {len(records)}, AUTHORITY: {len(authority)}",
        "",
        ";; QUESTION SECTION:",
        f";{clean_target}.\t\t\tIN\t{r_type}",
        "",
        ";; ANSWER SECTION:",
    ]
    for r in records:
        raw_lines.append(f"{r['name']}\t{r['ttl']}\tIN\t{r['type']}\t{r['data']}")
    if authority:
        raw_lines.extend(["", ";; AUTHORITY SECTION:"])
        for a in authority:
            raw_lines.append(f"{a['name']}\t{a['ttl']}\tIN\t{a['type']}\t{a['data']}")
    raw_lines.extend([
        "",
        f";; Query time: {query_time_ms} msec",
        f";; SERVER: 1.1.1.1#53 (Cloudflare DoH)",
        f";; WHEN: {time.strftime('%a %b %d %H:%M:%S %Y')}",
    ])

    return {
        "success": response_code == "NOERROR" and len(records) > 0,
        "target": clean_target,
        "record_type": r_type,
        "status": response_code,
        "query_time_ms": query_time_ms,
        "records": records,
        "authority": authority,
        "raw": "\n".join(raw_lines),
    }


# ─── Utilities ────────────────────────────────────────────────────────────────

def _is_private(ip: str) -> bool:
    """Check if IP is in a private/loopback range."""
    private_prefixes = (
        "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.",
        "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
        "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
        "127.", "169.254.", "::1", "fc00:", "fe80:",
    )
    return any(ip.startswith(p) for p in private_prefixes)


def _classify_pop(org: str) -> bool:
    """Heuristically classify an org as an ISP/CDN PoP."""
    pop_keywords = [
        "cloudflare", "akamai", "fastly", "aws", "amazon", "google", "microsoft",
        "azure", "cdn", "telecom", "internet", "isp", "bandwidth", "cogent",
        "level 3", "lumen", "centurylink", "hurricane electric", "comcast",
        "verizon", "at&t", "telia", "ntt", "zayo", "tata", "orange", "deutsche",
        "routing", "backbone", "transit",
    ]
    org_lower = org.lower()
    return any(kw in org_lower for kw in pop_keywords)
