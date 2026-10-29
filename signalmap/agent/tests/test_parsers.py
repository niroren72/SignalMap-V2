import unittest
from agent.parsers.nginx import NginxParser
from agent.parsers.jsonl import JsonlParser


async def to_async_stream(data: bytes):
    yield data


class TestParsers(unittest.IsolatedAsyncioTestCase):
    async def test_nginx_parser_combined_log(self):
        log_line = b'203.0.113.42 - frank [10/Oct/2000:13:55:36 -0700] "GET /api/v1/status HTTP/1.1" 200 2326 "http://example.com" "Mozilla/5.0"\n'
        parser = NginxParser()
        self.assertTrue(NginxParser.can_parse("access.log", log_line))

        events = []
        async for event in parser.parse(to_async_stream(log_line)):
            events.append(event)

        self.assertEqual(len(events), 1)
        ev = events[0]
        self.assertEqual(ev.remote.ip, "203.0.113.42")
        self.assertIsNotNone(ev.http)
        self.assertEqual(ev.http.method, "GET")
        self.assertEqual(ev.http.url_path, "/api/v1/status")
        self.assertEqual(ev.http.status_code, 200)

    async def test_jsonl_parser(self):
        line = b'{"remote_ip": "198.51.100.15", "remote_port": 443, "process_name": "curl.exe", "protocol": "https"}\n'
        parser = JsonlParser()
        self.assertTrue(JsonlParser.can_parse("events.jsonl", line))

        events = []
        async for event in parser.parse(to_async_stream(line)):
            events.append(event)

        self.assertEqual(len(events), 1)
        ev = events[0]
        self.assertEqual(ev.remote.ip, "198.51.100.15")
        self.assertEqual(ev.remote.port, 443)
        self.assertEqual(ev.local.process_name, "curl.exe")


if __name__ == "__main__":
    unittest.main()
