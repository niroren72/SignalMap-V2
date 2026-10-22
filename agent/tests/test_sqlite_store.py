import os
import tempfile
import unittest

from agent.schema import ConnectionEvent, LocalEndpoint, RemoteEndpoint, Protocol, Direction
from agent.store.sqlite_store import SQLiteStore


class TestSQLiteStore(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_events.db")
        self.store = SQLiteStore(db_path=self.db_path)
        await self.store.init()

    async def asyncTearDown(self):
        await self.store.close()
        self.temp_dir.cleanup()

    async def test_append_and_retrieve(self):
        event = ConnectionEvent(
            local=LocalEndpoint(host="127.0.0.1", port=8000, process_name="python.exe", pid=5000),
            remote=RemoteEndpoint(ip="1.1.1.1", port=443),
            protocol=Protocol.HTTPS,
            direction=Direction.OUTBOUND,
            status="ESTABLISHED",
        )
        await self.store.append(event)

        recent = await self.store.get_recent(10)
        self.assertEqual(len(recent), 1)
        self.assertEqual(recent[0].id, event.id)
        self.assertEqual(recent[0].remote.ip, "1.1.1.1")

    async def test_timeline_buckets(self):
        event = ConnectionEvent(
            local=LocalEndpoint(host="127.0.0.1", port=8000),
            remote=RemoteEndpoint(ip="8.8.8.8", port=53),
            protocol=Protocol.UDP,
            direction=Direction.OUTBOUND,
        )
        await self.store.append(event)

        timeline = await self.store.get_timeline(buckets=20)
        self.assertIsInstance(timeline, list)
        self.assertGreaterEqual(len(timeline), 1)


if __name__ == "__main__":
    unittest.main()
