"""
SignalMap — Mock ConnectionEvent generator.

Produces realistic-looking events for Phase 0 development and testing.
Never touches real network traffic.
"""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone

from .schema import (
    AsnInfo,
    ConnectionEvent,
    Direction,
    GeoInfo,
    HttpMeta,
    LocalEndpoint,
    Metrics,
    Protocol,
    RemoteEndpoint,
    ServiceCategory,
    ServiceInfo,
    State,
)

# ── Fake endpoint pool ─────────────────────────────────────────────────

REMOTE_ENDPOINTS = [
    # (hostname, ip, lat, lon, country, city, asn_org, service_name, category, port)
    ("api.github.com", "140.82.121.6", 37.7749, -122.4194, "US", "San Francisco", "GitHub Inc.", "GitHub", ServiceCategory.DEV, 443),
    ("github.com", "140.82.121.3", 37.7749, -122.4194, "US", "San Francisco", "GitHub Inc.", "GitHub", ServiceCategory.DEV, 443),
    ("api.slack.com", "34.237.22.81", 39.0438, -77.4874, "US", "Ashburn", "Amazon.com Inc.", "Slack", ServiceCategory.COMMS, 443),
    ("slack.com", "34.237.22.82", 39.0438, -77.4874, "US", "Ashburn", "Amazon.com Inc.", "Slack", ServiceCategory.COMMS, 443),
    ("login.salesforce.com", "136.147.46.30", 37.3861, -122.0839, "US", "Sunnyvale", "Salesforce.com Inc.", "Salesforce", ServiceCategory.CRM, 443),
    ("na1.salesforce.com", "136.147.46.31", 37.3861, -122.0839, "US", "Sunnyvale", "Salesforce.com Inc.", "Salesforce", ServiceCategory.CRM, 443),
    ("app.blackline.com", "52.25.100.10", 45.5051, -122.6750, "US", "Portland", "Amazon.com Inc.", "BlackLine", ServiceCategory.FINANCE, 443),
    ("s3.amazonaws.com", "52.216.162.45", 39.0438, -77.4874, "US", "Ashburn", "Amazon.com Inc.", "AWS S3", ServiceCategory.CLOUD, 443),
    ("ec2.us-east-1.amazonaws.com", "52.46.139.0", 39.0438, -77.4874, "US", "Ashburn", "Amazon.com Inc.", "AWS EC2", ServiceCategory.CLOUD, 443),
    ("cloudflare.com", "104.16.132.229", 37.7749, -122.4194, "US", "San Francisco", "Cloudflare Inc.", "Cloudflare", ServiceCategory.CDN, 443),
    ("cdn.jsdelivr.net", "104.16.88.20", 51.5074, -0.1278, "GB", "London", "Cloudflare Inc.", "jsDelivr", ServiceCategory.CDN, 443),
    ("registry.npmjs.org", "104.16.24.35", 37.7749, -122.4194, "US", "San Francisco", "Cloudflare Inc.", "npm", ServiceCategory.DEV, 443),
    ("api.stripe.com", "64.233.177.108", 37.7749, -122.4194, "US", "San Francisco", "Stripe Inc.", "Stripe", ServiceCategory.FINANCE, 443),
    ("outlook.office365.com", "52.97.137.2", 52.3676, 4.9041, "NL", "Amsterdam", "Microsoft Corp.", "Microsoft 365", ServiceCategory.COMMS, 443),
    ("login.microsoftonline.com", "20.190.159.0", 52.3676, 4.9041, "NL", "Amsterdam", "Microsoft Corp.", "Azure AD", ServiceCategory.CLOUD, 443),
    ("www.googleapis.com", "142.250.185.234", 35.6762, 139.6503, "JP", "Tokyo", "Google LLC", "Google APIs", ServiceCategory.CLOUD, 443),
    ("fonts.googleapis.com", "142.250.185.234", 35.6762, 139.6503, "JP", "Tokyo", "Google LLC", "Google Fonts", ServiceCategory.CDN, 443),
    ("analytics.google.com", "142.250.74.14", 35.6762, 139.6503, "JP", "Tokyo", "Google LLC", "Google Analytics", ServiceCategory.CLOUD, 443),
    ("docker.io", "52.20.56.50", 39.0438, -77.4874, "US", "Ashburn", "Amazon.com Inc.", "Docker Hub", ServiceCategory.DEV, 443),
    ("pypi.org", "151.101.0.223", 51.5074, -0.1278, "GB", "London", "Fastly Inc.", "PyPI", ServiceCategory.DEV, 443),
    ("sentry.io", "34.120.195.249", 33.7490, -84.3880, "US", "Atlanta", "Google LLC", "Sentry", ServiceCategory.DEV, 443),
    ("api.datadoghq.com", "52.85.150.100", 48.8566, 2.3522, "FR", "Paris", "Amazon.com Inc.", "Datadog", ServiceCategory.DEV, 443),
    ("redis.io", "54.85.204.205", 39.0438, -77.4874, "US", "Ashburn", "Amazon.com Inc.", "Redis", ServiceCategory.CLOUD, 443),
    ("hooks.slack.com", "34.237.22.83", 39.0438, -77.4874, "US", "Ashburn", "Amazon.com Inc.", "Slack Webhooks", ServiceCategory.COMMS, 443),
    ("smtp.gmail.com", "142.250.27.108", -33.8688, 151.2093, "AU", "Sydney", "Google LLC", "Gmail SMTP", ServiceCategory.COMMS, 587),
    ("imap.gmail.com", "142.250.27.109", -33.8688, 151.2093, "AU", "Sydney", "Google LLC", "Gmail IMAP", ServiceCategory.COMMS, 993),
    ("api.twilio.com", "52.8.180.251", 37.3382, -121.8863, "US", "San Jose", "Amazon.com Inc.", "Twilio", ServiceCategory.COMMS, 443),
    ("eu-west-1.aws.amazon.com", "52.95.116.0", 53.3498, -6.2603, "IE", "Dublin", "Amazon.com Inc.", "AWS EU", ServiceCategory.CLOUD, 443),
    ("ap-southeast-1.aws.amazon.com", "52.76.0.0", 1.3521, 103.8198, "SG", "Singapore", "Amazon.com Inc.", "AWS APAC", ServiceCategory.CLOUD, 443),
    ("mumbai.server.example.com", "13.126.0.1", 19.0760, 72.8777, "IN", "Mumbai", "Amazon.com Inc.", "AWS Mumbai", ServiceCategory.CLOUD, 443),
]

FAKE_PROCESSES = [
    (1234, "chrome.exe"),
    (2345, "node.exe"),
    (3456, "python.exe"),
    (4567, "code.exe"),
    (5678, "outlook.exe"),
    (6789, "docker.exe"),
    (7890, "git.exe"),
    (8901, "curl.exe"),
    (9012, "svchost.exe"),
    (1357, "Teams.exe"),
]

PROTOCOLS_WEIGHTED = [
    (Protocol.HTTPS, 50),
    (Protocol.HTTP, 10),
    (Protocol.TCP, 20),
    (Protocol.WS, 10),
    (Protocol.WSS, 5),
    (Protocol.UDP, 5),
]


def _weighted_protocol() -> Protocol:
    choices, weights = zip(*PROTOCOLS_WEIGHTED)
    return random.choices(choices, weights=weights, k=1)[0]


def _generate_mock_event() -> ConnectionEvent:
    """Generate a single mock ConnectionEvent."""
    ep = random.choice(REMOTE_ENDPOINTS)
    hostname, ip, lat, lon, country, city, asn_org, svc_name, svc_cat, port = ep
    proc = random.choice(FAKE_PROCESSES)
    protocol = _weighted_protocol()
    now = datetime.now(timezone.utc)

    bytes_out = random.randint(200, 50_000)
    bytes_in = random.randint(500, 200_000)

    event = ConnectionEvent(
        source_collector="mock",
        direction=random.choice([Direction.OUTBOUND, Direction.OUTBOUND, Direction.OUTBOUND, Direction.INBOUND]),
        state=random.choice([State.ACTIVE, State.ACTIVE, State.ACTIVE, State.CLOSED]),
        protocol=protocol,
        transport="tcp" if protocol not in (Protocol.UDP,) else "udp",
        local=LocalEndpoint(
            pid=proc[0],
            process_name=proc[1],
            host="127.0.0.1",
            port=random.randint(49152, 65535),
        ),
        remote=RemoteEndpoint(ip=ip, hostname=hostname, port=port),
        geo=GeoInfo(lat=lat, lon=lon, country=country, city=city),
        asn=AsnInfo(number=random.randint(1000, 99999), org=asn_org),
        service=ServiceInfo(name=svc_name, category=svc_cat),
        metrics=Metrics(
            bytes_in=bytes_in,
            bytes_out=bytes_out,
            packets=random.randint(5, 500),
            first_seen=now,
            last_seen=now,
        ),
    )

    # Add HTTP metadata for HTTP/HTTPS protocols
    if protocol in (Protocol.HTTP, Protocol.HTTPS):
        event.http = HttpMeta(
            method=random.choice(["GET", "POST", "PUT", "DELETE", "PATCH"]),
            url_path=random.choice(["/api/v1/users", "/api/v2/data", "/graphql", "/health", "/webhook", "/oauth/token"]),
            status_code=random.choice([200, 200, 200, 201, 204, 301, 400, 401, 403, 404, 500]),
            req_size=bytes_out,
            resp_size=bytes_in,
            content_type=random.choice(["application/json", "text/html", "application/octet-stream"]),
        )

    # 5% chance of simulated suspicious activity for demo
    if random.random() < 0.05:
        anomaly_type = random.choice(["powershell", "c2_port", "rundll32", "smb"])
        if anomaly_type == "powershell":
            event.local.process_name = "powershell.exe"
        elif anomaly_type == "c2_port":
            event.remote.port = 4444
        elif anomaly_type == "rundll32":
            event.local.process_name = "rundll32.exe"
        elif anomaly_type == "smb":
            event.remote.port = 445

    from .anomaly import anomaly_engine
    event.anomaly = anomaly_engine.inspect(event)

    return event


async def mock_event_stream(rate: float = 2.0):
    """Async generator yielding mock ConnectionEvents at the given rate (events/sec)."""
    while True:
        yield _generate_mock_event()
        # Add jitter: ±50%
        delay = (1.0 / rate) * random.uniform(0.5, 1.5)
        await asyncio.sleep(delay)


def generate_batch(count: int = 50) -> list[ConnectionEvent]:
    """Generate a batch of mock events for initial state."""
    return [_generate_mock_event() for _ in range(count)]
