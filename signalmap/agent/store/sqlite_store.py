"""
SignalMap — SQLite Persistence & Query Store.
"""

from __future__ import annotations

import aiosqlite
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from ..schema import ConnectionEvent, AnomalyInfo, Severity


class SQLiteStore:
    def __init__(self, db_path: str = "data/events.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn: Optional[aiosqlite.Connection] = None

    async def init(self):
        self._conn = await aiosqlite.connect(self.db_path)
        # WAL mode for high concurrency
        await self._conn.execute('PRAGMA journal_mode=WAL;')
        await self._conn.execute('''
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                protocol TEXT,
                source_collector TEXT,
                direction TEXT,
                process_name TEXT,
                remote_ip TEXT,
                remote_hostname TEXT,
                is_anomaly INTEGER DEFAULT 0,
                severity TEXT,
                data TEXT
            )
        ''')

        # Check and migrate columns if table existed prior to schema update
        async with self._conn.execute('PRAGMA table_info(events);') as cursor:
            rows = await cursor.fetchall()
            existing_cols = {row[1] for row in rows}

        columns_to_add = [
            ("process_name", "TEXT"),
            ("remote_ip", "TEXT"),
            ("remote_hostname", "TEXT"),
            ("is_anomaly", "INTEGER DEFAULT 0"),
            ("severity", "TEXT"),
        ]
        for col_name, col_type in columns_to_add:
            if col_name not in existing_cols:
                await self._conn.execute(f"ALTER TABLE events ADD COLUMN {col_name} {col_type};")

        await self._conn.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp);')
        await self._conn.execute('CREATE INDEX IF NOT EXISTS idx_protocol ON events(protocol);')
        await self._conn.execute('CREATE INDEX IF NOT EXISTS idx_source ON events(source_collector);')
        await self._conn.execute('CREATE INDEX IF NOT EXISTS idx_direction ON events(direction);')
        await self._conn.execute('CREATE INDEX IF NOT EXISTS idx_anomaly ON events(is_anomaly);')
        await self._conn.execute('CREATE INDEX IF NOT EXISTS idx_process ON events(process_name);')
        # Purge stale loopback or null-endpoint socket rows from previous runs so fresh multi-protocol external sockets populate cleanly
        await self._conn.execute(
            "DELETE FROM events WHERE remote_ip IS NULL OR remote_ip IN ('127.0.0.1', '::1', '0.0.0.0', '::') OR source_collector IN ('psutil_sockets', 'windows_udp', 'windows_dns');"
        )
        await self._conn.commit()

    async def close(self):
        if self._conn:
            await self._conn.close()

    async def append(self, event: ConnectionEvent) -> None:
        if not self._conn:
            return

        is_anomaly = 1 if (event.anomaly and event.anomaly.is_anomaly) else 0
        severity = event.anomaly.severity.value if (event.anomaly and event.anomaly.severity) else None
        proc_name = event.local.process_name if event.local else None
        remote_ip = event.remote.ip if event.remote else None
        remote_host = event.remote.hostname if event.remote else None
        event_json = event.model_dump_json()

        await self._conn.execute(
            '''
            INSERT OR REPLACE INTO events (
                id, protocol, source_collector, direction,
                process_name, remote_ip, remote_hostname,
                is_anomaly, severity, data
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                event.id,
                event.protocol.value if hasattr(event.protocol, 'value') else str(event.protocol),
                event.source_collector,
                event.direction.value if hasattr(event.direction, 'value') else str(event.direction),
                proc_name,
                remote_ip,
                remote_host,
                is_anomaly,
                severity,
                event_json
            )
        )
        await self._conn.commit()

    async def get_all(self) -> List[ConnectionEvent]:
        # Cap to 5000 to prevent memory blowup
        return await self.get_recent(5000)

    async def get_recent(self, count: int = 100) -> List[ConnectionEvent]:
        if not self._conn:
            return []

        async with self._conn.execute(
            'SELECT data FROM events ORDER BY timestamp DESC LIMIT ?', (count,)
        ) as cursor:
            rows = await cursor.fetchall()
            events = [ConnectionEvent.model_validate_json(row[0]) for row in rows]
            return list(reversed(events))  # Return in chronological order

    async def query(
        self,
        protocol: Optional[str] = None,
        source: Optional[str] = None,
        direction: Optional[str] = None,
        search: Optional[str] = None,
        is_anomaly: Optional[bool] = None,
        severity: Optional[str] = None,
        from_time: Optional[str] = None,
        to_time: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ConnectionEvent]:
        if not self._conn:
            return []

        query = 'SELECT data FROM events WHERE 1=1'
        params: List[Any] = []

        if protocol:
            query += ' AND protocol = ?'
            params.append(protocol)
        if source:
            query += ' AND source_collector = ?'
            params.append(source)
        if direction:
            query += ' AND direction = ?'
            params.append(direction)
        if is_anomaly is not None:
            query += ' AND is_anomaly = ?'
            params.append(1 if is_anomaly else 0)
        if severity:
            query += ' AND severity = ?'
            params.append(severity)
        if from_time:
            query += ' AND timestamp >= ?'
            params.append(from_time)
        if to_time:
            query += ' AND timestamp <= ?'
            params.append(to_time)
        if search:
            query += ' AND (process_name LIKE ? OR remote_ip LIKE ? OR remote_hostname LIKE ? OR data LIKE ?)'
            wildcard = f"%{search}%"
            params.extend([wildcard, wildcard, wildcard, wildcard])

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
        params.extend([limit, offset])

        async with self._conn.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            events = [ConnectionEvent.model_validate_json(row[0]) for row in rows]
            return list(reversed(events))

    async def get_timeline(
        self,
        buckets: int = 40,
        from_time: Optional[str] = None,
        to_time: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Aggregate event counts and anomalies into time buckets for the UI sparkline/histogram.
        """
        if not self._conn:
            return []

        where_clauses = ["1=1"]
        params: List[Any] = []
        if from_time:
            where_clauses.append("timestamp >= ?")
            params.append(from_time)
        if to_time:
            where_clauses.append("timestamp <= ?")
            params.append(to_time)

        where_sql = " AND ".join(where_clauses)

        # Query recent events to bucket in python for cross-platform SQLite compatibility
        async with self._conn.execute(
            f'SELECT timestamp, is_anomaly, severity, data FROM events WHERE {where_sql} ORDER BY timestamp ASC',
            params
        ) as cursor:
            rows = await cursor.fetchall()

        if not rows:
            return []

        # If we have rows, divide into `buckets` even buckets
        total_rows = len(rows)
        chunk_size = max(1, total_rows // buckets)
        timeline = []

        for i in range(0, total_rows, chunk_size):
            chunk = rows[i:i + chunk_size]
            t_sample = chunk[-1][0]
            anomalies = sum(1 for r in chunk if r[1] == 1)
            timeline.append({
                "timestamp": str(t_sample),
                "count": len(chunk),
                "anomalies": anomalies,
            })

        return timeline

    async def get_stats(self) -> Dict[str, Any]:
        """Aggregate statistical summary."""
        if not self._conn:
            return {"total_events": 0, "anomalies": 0, "protocols": {}, "services": {}}

        all_events = await self.get_all()
        protocols: Dict[str, int] = {}
        services: Dict[str, int] = {}
        anomalies_count = 0

        for e in all_events:
            p = e.protocol.value if hasattr(e.protocol, 'value') else str(e.protocol)
            protocols[p] = protocols.get(p, 0) + 1
            if e.service and e.service.name:
                s = e.service.name
                services[s] = services.get(s, 0) + 1
            if e.anomaly and e.anomaly.is_anomaly:
                anomalies_count += 1

        return {
            "total_events": len(all_events),
            "anomalies": anomalies_count,
            "protocols": protocols,
            "services": services,
        }

    async def get_size(self) -> int:
        if not self._conn:
            return 0
        async with self._conn.execute('SELECT COUNT(*) FROM events') as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0

    async def clear(self) -> None:
        if not self._conn:
            return
        await self._conn.execute('DELETE FROM events')
        await self._conn.commit()
