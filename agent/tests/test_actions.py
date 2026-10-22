import asyncio
import unittest
from fastapi import HTTPException

from agent.api.actions import (
    kill_process,
    block_ip,
    unblock_ip,
    get_blocked_ips,
    is_ip_blocked,
    KillProcessRequest,
    BlockIpRequest,
    UnblockIpRequest,
    PROTECTED_PROCESS_NAMES,
    PROTECTED_PIDS,
)


class TestActionsAPI(unittest.IsolatedAsyncioTestCase):
    async def test_protected_pid_cannot_be_killed(self):
        for pid in PROTECTED_PIDS:
            with self.assertRaises(HTTPException) as ctx:
                await kill_process(KillProcessRequest(pid=pid, force=True))
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("critical", ctx.exception.detail.lower())

    async def test_non_existent_pid_returns_404(self):
        # PID 999999 is extraordinarily unlikely to exist
        with self.assertRaises(HTTPException) as ctx:
            await kill_process(KillProcessRequest(pid=999999, force=True))
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_block_ip_validation(self):
        # Empty IP
        with self.assertRaises(HTTPException) as ctx:
            await block_ip(BlockIpRequest(ip="   "))
        self.assertEqual(ctx.exception.status_code, 400)

        # Loopback IP
        with self.assertRaises(HTTPException) as ctx:
            await block_ip(BlockIpRequest(ip="127.0.0.1"))
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_block_and_unblock_lifecycle(self):
        test_ip = "198.51.100.99"
        self.assertFalse(is_ip_blocked(test_ip))

        # Block
        res = await block_ip(BlockIpRequest(ip=test_ip, reason="Test block"))
        self.assertTrue(res["success"])
        self.assertTrue(is_ip_blocked(test_ip))

        # Check list
        all_blocked = await get_blocked_ips()
        ips = [b["ip"] for b in all_blocked["blocked_ips"]]
        self.assertIn(test_ip, ips)

        # Unblock
        unblock_res = await unblock_ip(UnblockIpRequest(ip=test_ip))
        self.assertTrue(unblock_res["success"])
        self.assertFalse(is_ip_blocked(test_ip))


if __name__ == "__main__":
    unittest.main()
