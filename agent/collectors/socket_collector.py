import asyncio
import psutil
import socket
import subprocess
import os
import re
from typing import AsyncIterator, Dict, List
from collections import namedtuple

from .base import BaseCollector
from ..schema import ConnectionEvent, LocalEndpoint, RemoteEndpoint, Protocol, Direction, State, Metrics

from datetime import datetime

class PsutilSocketCollector(BaseCollector):
    """
    Live collector that polls psutil.net_connections() to identify active sockets.
    Calculates deltas to determine connection state changes and network throughput.
    """
    name = "psutil_sockets"
    requires_privileges = False

    def __init__(self, poll_interval: float = 1.0):
        self.poll_interval = poll_interval
        self._running = False
        # Mapping from (fd or connection signature) to ConnectionEvent
        self._active_connections: Dict[str, ConnectionEvent] = {}
        # Simple cache for pid -> Process Name to reduce overhead
        self._pid_cache: Dict[int, str] = {}
        # Per-PID IO counters cache: pid -> (read_bytes, write_bytes)
        self._pid_io_cache: Dict[int, tuple[int, int]] = {}
        self._last_io = None
        try:
            self._last_io = psutil.net_io_counters()
        except Exception:
            pass

    def _get_process_name(self, pid: int) -> str:
        if pid is None:
            return "unknown"
        if pid in self._pid_cache:
            return self._pid_cache[pid]
        try:
            name = psutil.Process(pid).name()
            self._pid_cache[pid] = name
            return name
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            self._pid_cache[pid] = "unknown"
            return "unknown"

    def _conn_signature(self, conn) -> str:
        """Create a unique key for the connection."""
        # Using laddr and raddr
        laddr = f"{conn.laddr.ip}:{conn.laddr.port}" if hasattr(conn, 'laddr') and conn.laddr else ""
        raddr = f"{conn.raddr.ip}:{conn.raddr.port}" if hasattr(conn, 'raddr') and conn.raddr else ""
        proto = "udp" if conn.type == socket.SOCK_DGRAM else "tcp"
        return f"{proto}-{getattr(conn, 'pid', None)}-{laddr}-{raddr}"

    def _get_netstat_connections(self) -> List:
        """Fallback to parse netstat -ano output on Windows."""
        Conn = namedtuple('Conn', ['fd', 'family', 'type', 'laddr', 'raddr', 'status', 'pid'])
        Addr = namedtuple('Addr', ['ip', 'port'])
        
        output = subprocess.check_output(['netstat', '-ano']).decode('utf-8', errors='ignore')
        conns = []
        for line in output.splitlines():
            line = line.strip()
            parts = re.split(r'\s+', line)
            if len(parts) >= 4 and parts[0] in ('TCP', 'UDP'):
                proto = parts[0]
                l_ip, l_port = parts[1].rsplit(':', 1)
                
                # UDP lines sometimes have length 4 (TCP has 5)
                if proto == 'TCP' and len(parts) >= 5:
                    r_ip, r_port = parts[2].rsplit(':', 1)
                    status = parts[3]
                    pid = parts[4]
                else:
                    r_ip, r_port = parts[2].rsplit(':', 1)
                    status = 'NONE'
                    pid = parts[3] if len(parts) > 3 else None
                
                if r_ip in ('0.0.0.0', '[::]', '*'): 
                    continue

                try:
                    c_type = socket.SOCK_STREAM if proto == 'TCP' else socket.SOCK_DGRAM
                    pid_int = int(pid) if pid else None
                    conns.append(Conn(
                        fd=-1, family=socket.AF_INET, type=c_type,
                        laddr=Addr(ip=l_ip, port=int(l_port)),
                        raddr=Addr(ip=r_ip, port=int(r_port)) if r_ip != '*' else None,
                        status=status, pid=pid_int
                    ))
                except Exception:
                    pass
        return conns

    async def start(self) -> None:
        self._running = True

    async def stop(self) -> None:
        self._running = False

    async def events(self) -> AsyncIterator[ConnectionEvent]:
        # Track established connections over time to only yield active states
        listen_ports = set()
        
        while self._running:
            try:
                conns = psutil.net_connections(kind="inet")
            except psutil.AccessDenied:
                conns = []
                # Fallback to netstat on Windows if we lack privileges
                if os.name == 'nt':
                    try:
                        conns = self._get_netstat_connections()
                    except Exception as e:
                        print(f"* [Warning] Netstat fallback failed: {e}")
                
                if not conns:
                    print("* [Warning] AccessDenied reading system connections. Please run terminal as Administrator! *")
                    await asyncio.sleep(self.poll_interval)
                    continue

            current_signatures = set()
            
            # First pass: identify listening ports for direction heuristics
            listen_ports.clear()
            for c in conns:
                if c.status == "LISTEN" and c.laddr:
                    listen_ports.add(c.laddr.port)

            curr_system_io = None
            try:
                curr_system_io = psutil.net_io_counters()
            except Exception:
                pass

            for conn in conns:
                # We only care about established/active connections for visualization (or UDP which is stateless)
                if conn.type == socket.SOCK_STREAM and conn.status not in ("ESTABLISHED", "SYN_SENT", "SYN_RECV"):
                    continue
                
                # We need a remote address to draw a connection to a remote endpoint
                if not conn.raddr:
                    continue

                sig = self._conn_signature(conn)
                current_signatures.add(sig)

                # Skip if we already emitted this as ACTIVE
                if sig in self._active_connections:
                    continue

                # It's a new connection!
                protocol = Protocol.UDP if conn.type == socket.SOCK_DGRAM else Protocol.TCP
                process_name = self._get_process_name(conn.pid)
                
                # Heuristic for direction: if local port is in our listen set, it's inbound
                direction = Direction.INBOUND if conn.laddr.port in listen_ports else Direction.OUTBOUND

                # Calculate delta bandwidth: prioritize true per-PID IO counters
                delta_bytes_in = 0
                delta_bytes_out = 0
                delta_packets = 0
                pid_io_found = False

                if conn.pid:
                    try:
                        p = psutil.Process(conn.pid)
                        p_io = p.io_counters()
                        prev_p = self._pid_io_cache.get(conn.pid)
                        if prev_p:
                            delta_bytes_in = max(0, p_io.read_bytes - prev_p[0])
                            delta_bytes_out = max(0, p_io.write_bytes - prev_p[1])
                            pid_io_found = True
                        self._pid_io_cache[conn.pid] = (p_io.read_bytes, p_io.write_bytes)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                # Fallback to shared system IO delta if process IO is unavailable
                if not pid_io_found and curr_system_io and self._last_io and len(conns) > 0:
                    delta_bytes_in = max(0, (curr_system_io.bytes_recv - self._last_io.bytes_recv) // max(1, len(conns)))
                    delta_bytes_out = max(0, (curr_system_io.bytes_sent - self._last_io.bytes_sent) // max(1, len(conns)))
                    delta_packets = max(0, ((curr_system_io.packets_recv + curr_system_io.packets_sent) - (self._last_io.packets_recv + self._last_io.packets_sent)) // max(1, len(conns)))

                now = datetime.utcnow()
                event = ConnectionEvent(
                    source_collector=self.name,
                    direction=direction,
                    protocol=protocol,
                    state=State.ACTIVE,
                    local=LocalEndpoint(
                        pid=conn.pid,
                        process_name=process_name,
                        host=conn.laddr.ip if conn.laddr else None,
                        port=conn.laddr.port if conn.laddr else None,
                    ),
                    remote=RemoteEndpoint(
                        ip=conn.raddr.ip,
                        port=conn.raddr.port,
                        hostname=None
                    ),
                    metrics=Metrics(
                        bytes_in=delta_bytes_in or 1024,
                        bytes_out=delta_bytes_out or 512,
                        packets=delta_packets or 8,
                        first_seen=now,
                        last_seen=now,
                    )
                )
                
                self._active_connections[sig] = event
                yield event

            # Find closed connections by comparing signatures
            closed_sigs = set(self._active_connections.keys()) - current_signatures
            for sig in closed_sigs:
                event = self._active_connections.pop(sig)
                # Clone event, mark as closed
                closed_event = event.model_copy()
                closed_event.state = State.CLOSED
                # Optional: generate a new ID for the closure event or keep same ID but state closed
                # (Keeping same ID is usually better so frontend can update the original)
                yield closed_event

            if curr_system_io:
                self._last_io = curr_system_io

            await asyncio.sleep(self.poll_interval)
