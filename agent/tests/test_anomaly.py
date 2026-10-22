import unittest

from agent.anomaly import AnomalyEngine
from agent.schema import ConnectionEvent, LocalEndpoint, RemoteEndpoint, Severity, Direction, Protocol


class TestAnomalyEngine(unittest.TestCase):
    def setUp(self):
        self.engine = AnomalyEngine()

    def test_benign_traffic_not_flagged(self):
        event = ConnectionEvent(
            local=LocalEndpoint(host="192.168.1.10", port=54321, process_name="chrome.exe", pid=1234),
            remote=RemoteEndpoint(ip="142.250.190.46", port=443, hostname="google.com"),
            protocol=Protocol.HTTPS,
            direction=Direction.OUTBOUND,
            status="ESTABLISHED",
        )
        anomaly = self.engine.inspect(event)
        self.assertIsNone(anomaly)

    def test_suspicious_outbound_powershell(self):
        event = ConnectionEvent(
            local=LocalEndpoint(host="192.168.1.10", port=50000, process_name="powershell.exe", pid=4321),
            remote=RemoteEndpoint(ip="203.0.113.5", port=8080),
            protocol=Protocol.TCP,
            direction=Direction.OUTBOUND,
            status="ESTABLISHED",
        )
        anomaly = self.engine.inspect(event)
        self.assertIsNotNone(anomaly)
        self.assertTrue(anomaly.is_anomaly)
        self.assertIn(anomaly.severity, [Severity.HIGH, Severity.CRITICAL])
        self.assertIn("powershell", anomaly.title.lower())

    def test_c2_trojan_port_detected(self):
        event = ConnectionEvent(
            local=LocalEndpoint(host="192.168.1.10", port=50001, process_name="unknown.exe", pid=9999),
            remote=RemoteEndpoint(ip="198.51.100.10", port=4444),
            protocol=Protocol.TCP,
            direction=Direction.OUTBOUND,
            status="ESTABLISHED",
        )
        anomaly = self.engine.inspect(event)
        self.assertIsNotNone(anomaly)
        self.assertTrue(anomaly.is_anomaly)
        self.assertEqual(anomaly.severity, Severity.CRITICAL)
        self.assertIn("4444", anomaly.description)

    def test_smb_wan_leak_detected(self):
        event = ConnectionEvent(
            local=LocalEndpoint(host="192.168.1.10", port=50002, process_name="system", pid=4),
            remote=RemoteEndpoint(ip="198.51.100.20", port=445),
            protocol=Protocol.TCP,
            direction=Direction.OUTBOUND,
            status="ESTABLISHED",
        )
        anomaly = self.engine.inspect(event)
        self.assertIsNotNone(anomaly)
        self.assertTrue(anomaly.is_anomaly)
        self.assertIn("smb", anomaly.title.lower())

    def test_yaml_threat_signature_and_mitre_mapping(self):
        # mimikatz.exe loaded from rules/threat_signatures.yaml
        event = ConnectionEvent(
            local=LocalEndpoint(host="192.168.1.10", port=50003, process_name="mimikatz.exe", pid=666),
            remote=RemoteEndpoint(ip="198.51.100.30", port=8443),
            protocol=Protocol.TCP,
            direction=Direction.OUTBOUND,
            status="ESTABLISHED",
        )
        anomaly = self.engine.inspect(event)
        self.assertIsNotNone(anomaly)
        self.assertTrue(anomaly.is_anomaly)
        self.assertEqual(anomaly.severity, Severity.CRITICAL)
        self.assertIn("mitre:T1003", anomaly.tags)

    def test_powershell_mitre_technique_tag(self):
        event = ConnectionEvent(
            local=LocalEndpoint(host="192.168.1.10", port=50004, process_name="powershell.exe", pid=777),
            remote=RemoteEndpoint(ip="203.0.113.10", port=443),
            protocol=Protocol.TCP,
            direction=Direction.OUTBOUND,
            status="ESTABLISHED",
        )
        anomaly = self.engine.inspect(event)
        self.assertIsNotNone(anomaly)
        self.assertIn("mitre:T1059.001", anomaly.tags)

    def test_missing_yaml_resilient_fallback(self):
        fallback_engine = AnomalyEngine(rules_path="nonexistent_threat_rules.yaml")
        event = ConnectionEvent(
            local=LocalEndpoint(host="192.168.1.10", port=50005, process_name="powershell.exe", pid=888),
            remote=RemoteEndpoint(ip="203.0.113.20", port=8080),
            protocol=Protocol.TCP,
            direction=Direction.OUTBOUND,
            status="ESTABLISHED",
        )
        anomaly = fallback_engine.inspect(event)
        self.assertIsNotNone(anomaly)
        self.assertTrue(anomaly.is_anomaly)


if __name__ == "__main__":
    unittest.main()
