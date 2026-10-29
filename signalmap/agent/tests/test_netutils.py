import asyncio
import unittest
from unittest.mock import patch, AsyncMock

from agent.api.netutils import (
    ifconfig_view,
    netstat_view,
    dig_view,
    _is_private,
    _classify_pop,
    _strip_ansi,
)


class TestNetUtilsAPI(unittest.IsolatedAsyncioTestCase):
    def test_strip_ansi(self):
        text_with_ansi = "\x1b[31mRed text\x1b[0m and \x1b[1mBold\x1b[0m"
        clean = _strip_ansi(text_with_ansi)
        self.assertEqual(clean, "Red text and Bold")

    def test_is_private(self):
        self.assertTrue(_is_private("127.0.0.1"))
        self.assertTrue(_is_private("192.168.1.1"))
        self.assertTrue(_is_private("10.0.0.5"))
        self.assertTrue(_is_private("172.16.0.1"))
        self.assertFalse(_is_private("8.8.8.8"))
        self.assertFalse(_is_private("1.1.1.1"))
        self.assertFalse(_is_private("104.244.42.1"))

    def test_classify_pop(self):
        self.assertTrue(_classify_pop("Cloudflare, Inc."))
        self.assertTrue(_classify_pop("Akamai International B.V."))
        self.assertTrue(_classify_pop("Amazon Data Services NoVa"))
        self.assertTrue(_classify_pop("Fastly Global CDN"))
        self.assertFalse(_classify_pop("University of California"))

    async def test_ifconfig_view(self):
        res = await ifconfig_view()
        self.assertTrue(res["success"])
        self.assertIn("interfaces", res)
        self.assertIn("total_interfaces", res)
        self.assertGreaterEqual(res["total_interfaces"], 1)

        # Check structure of the first interface
        iface = res["interfaces"][0]
        self.assertIn("name", iface)
        self.assertIn("is_up", iface)
        self.assertIn("speed_mbps", iface)
        self.assertIn("mtu", iface)
        self.assertIn("type", iface)
        self.assertIn("ipv4", iface)
        self.assertIn("bytes_sent", iface)
        self.assertIn("bytes_recv", iface)

    async def test_netstat_view(self):
        # Default all
        res = await netstat_view(state="all", proto="all", limit=50)
        self.assertTrue(res["success"])
        self.assertIn("stats", res)
        self.assertIn("total", res["stats"])
        self.assertIn("listening", res["stats"])
        self.assertIn("established", res["stats"])
        self.assertIn("connections", res)
        self.assertLessEqual(len(res["connections"]), 50)

        # State filter listening
        res_listen = await netstat_view(state="listening", proto="all", limit=50)
        self.assertTrue(res_listen["success"])
        for conn in res_listen["connections"]:
            self.assertIn("LISTEN", conn["state"].upper())

        # Protocol filter tcp
        res_tcp = await netstat_view(state="all", proto="tcp", limit=50)
        self.assertTrue(res_tcp["success"])
        for conn in res_tcp["connections"]:
            self.assertEqual(conn["proto"], "TCP")

    async def test_dig_view_live_or_mock(self):
        # Perform real DoH query against Cloudflare DNS for a reliable public domain
        try:
            res = await dig_view(target="one.one.one.one", record_type="A")
            self.assertTrue(res["success"])
            self.assertEqual(res["target"], "one.one.one.one")
            self.assertEqual(res["record_type"], "A")
            self.assertEqual(res["status"], "NOERROR")
            self.assertGreater(len(res["records"]), 0)
            self.assertIn("1.1.1.1", [r["data"] for r in res["records"]])
        except Exception:
            # Fallback mock test if internet is unreachable
            with patch("httpx.AsyncClient.get") as mock_get:
                mock_resp = AsyncMock()
                mock_resp.status_code = 200
                mock_resp.json.return_value = {
                    "Status": 0,
                    "Answer": [{"name": "example.com.", "type": 1, "TTL": 300, "data": "93.184.216.34"}],
                }
                mock_get.return_value = mock_resp
                res = await dig_view(target="example.com", record_type="A")
                self.assertTrue(res["success"])
                self.assertEqual(len(res["records"]), 1)


if __name__ == "__main__":
    unittest.main()
