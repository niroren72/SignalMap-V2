import datetime
import hashlib
import ipaddress
import socket
import threading
import time
import urllib.request
from pathlib import Path
from typing import Dict, Optional, Tuple
import yaml
import fnmatch

import geoip2.database
from geoip2.errors import AddressNotFoundError

from .schema import ConnectionEvent, GeoInfo, AsnInfo, Protocol, ServiceCategory
from .anomaly import anomaly_engine


def _detect_timezone_origin() -> GeoInfo:
    """
    Instant, zero-network fallback that resolves the machine's geographical origin
    from its OS timezone / UTC offset so local hosts (e.g., in Israel) never fall back to USA.
    """
    tz_names = " ".join(str(x) for x in time.tzname if x).lower()
    try:
        local_tz = str(datetime.datetime.now().astimezone().tzinfo or "").lower()
        tz_names = f"{tz_names} {local_tz}"
    except Exception:
        pass

    # Explicit timezone name matches
    if any(k in tz_names for k in ("israel", "jerusalem", "tel aviv", "idt", "ist")):
        return GeoInfo(lat=32.0853, lon=34.7818, country="IL", city="Tel Aviv")
    if any(k in tz_names for k in ("gmt", "bst", "london", "utc")):
        return GeoInfo(lat=51.5074, lon=-0.1278, country="GB", city="London")
    if any(k in tz_names for k in ("cet", "cest", "berlin", "paris", "amsterdam", "frankfurt", "w. europe", "central europe")):
        return GeoInfo(lat=50.1109, lon=8.6821, country="DE", city="Frankfurt")
    if any(k in tz_names for k in ("eet", "eest", "athens", "bucharest", "helsinki", "fle")):
        return GeoInfo(lat=32.0853, lon=34.7818, country="IL", city="Tel Aviv")
    if any(k in tz_names for k in ("jst", "tokyo")):
        return GeoInfo(lat=35.6762, lon=139.6503, country="JP", city="Tokyo")

    # Check UTC offset in hours
    try:
        offset_sec = datetime.datetime.now().astimezone().utcoffset().total_seconds()  # type: ignore[union-attr]
        offset_hrs = round(offset_sec / 3600.0, 1)
        if offset_hrs in (2.0, 3.0):
            return GeoInfo(lat=32.0853, lon=34.7818, country="IL", city="Tel Aviv")
        if offset_hrs == 1.0:
            return GeoInfo(lat=50.1109, lon=8.6821, country="DE", city="Frankfurt")
        if offset_hrs == 0.0:
            return GeoInfo(lat=51.5074, lon=-0.1278, country="GB", city="London")
    except Exception:
        pass

    return GeoInfo(lat=32.0853, lon=34.7818, country="IL", city="Tel Aviv")


def normalize_ip(ip: Optional[str]) -> str:
    """Normalize IPv4-mapped IPv6 addresses and strip brackets/zone IDs."""
    if not ip:
        return ""
    cleaned = ip.strip().strip("[]")
    if "%" in cleaned:
        cleaned = cleaned.split("%", 1)[0]
    if cleaned.lower().startswith("::ffff:"):
        cleaned = cleaned[7:]
    return cleaned


def is_loopback_or_unspecified(ip: Optional[str]) -> bool:
    """Return True if the IP is loopback (127.0.0.1, ::1) or unspecified (0.0.0.0, ::, *)."""
    cleaned = normalize_ip(ip)
    if not cleaned or cleaned in ("*", "0.0.0.0", "::", "127.0.0.1", "::1", "localhost"):
        return True
    if cleaned.startswith("127."):
        return True
    return False


def is_lan_or_multicast(ip: Optional[str]) -> bool:
    """Return True if IP is RFC1918 private LAN, link-local, or multicast."""
    cleaned = normalize_ip(ip)
    if not cleaned:
        return False
    try:
        addr = ipaddress.ip_address(cleaned)
        return addr.is_private or addr.is_multicast or addr.is_link_local
    except ValueError:
        return (
            cleaned.startswith("10.")
            or cleaned.startswith("192.168.")
            or cleaned.startswith("169.254.")
            or cleaned.startswith("224.")
            or cleaned.startswith("239.")
            or cleaned.lower().startswith("fe80:")
            or cleaned.lower().startswith("ff0")
        )


class DataEnricher:
    """Enriches ConnectionEvents with GeoIP, ASN, Forward DNS Cache, and Non-Blocking Reverse DNS."""

    CITY_URL = "https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb"
    ASN_URL = "https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-ASN.mmdb"

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.city_db_path = self.data_dir / "GeoLite2-City.mmdb"
        self.asn_db_path = self.data_dir / "GeoLite2-ASN.mmdb"
        self.rules_path = Path(__file__).resolve().parent.parent / "rules" / "services.yaml"

        self.city_reader: Optional[geoip2.database.Reader] = None
        self.asn_reader: Optional[geoip2.database.Reader] = None
        self.rules = []

        # Fast caches
        self._dns_cache: Dict[str, Optional[str]] = {}
        self._forward_dns_cache: Dict[str, str] = {}
        self._pending_dns: set[str] = set()
        self._geo_cache: Dict[str, GeoInfo] = {}
        self._asn_cache: Dict[str, AsnInfo] = {}
        self._origin_geo: GeoInfo = _detect_timezone_origin()
        self._public_ip: Optional[str] = None
        self._wan_probe_started: bool = False

    def _probe_wan_origin_bg(self) -> None:
        """Non-blocking background probe to refine local host origin using public WAN IP + MaxMind."""
        if self._wan_probe_started:
            return
        self._wan_probe_started = True

        def _worker():
            for url in ("https://api.ipify.org", "https://icanhazip.com", "https://ifconfig.me/ip"):
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "SignalMap/1.0"})
                    with urllib.request.urlopen(req, timeout=2.5) as resp:
                        wan_ip = resp.read().decode("utf-8", errors="ignore").strip()
                        if wan_ip and not is_lan_or_multicast(wan_ip):
                            self._public_ip = wan_ip
                            if self.city_reader:
                                geo = self._resolve_geo(wan_ip)
                                if geo.lat is not None and geo.lon is not None:
                                    self._origin_geo = GeoInfo(
                                        lat=geo.lat,
                                        lon=geo.lon,
                                        country=geo.country or self._origin_geo.country,
                                        city=geo.city or self._origin_geo.city,
                                    )
                            break
                except Exception:
                    continue

        threading.Thread(target=_worker, daemon=True).start()

    def get_local_origin_geo(self) -> GeoInfo:
        """Return the host's geographical origin (WAN GeoIP or OS Timezone fallback)."""
        if not self._wan_probe_started and self.city_reader is not None:
            self._probe_wan_origin_bg()
        return self._origin_geo

    def get_local_origin_info(self) -> Tuple[GeoInfo, str, Optional[str]]:
        """Return (origin_geo, local_lan_ip, public_wan_ip)."""
        local_ip = "127.0.0.1"
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            pass
        return self.get_local_origin_geo(), local_ip, self._public_ip

    def update_forward_dns_cache(self, mapping: Dict[str, str]) -> None:
        """Update the IP -> Domain mapping harvested from the OS DNS Resolver cache."""
        for ip, domain in mapping.items():
            norm = normalize_ip(ip)
            if norm and domain:
                self._forward_dns_cache[norm] = domain
                self._dns_cache[norm] = domain

    def get_cached_hostname(self, ip: str) -> Optional[str]:
        norm = normalize_ip(ip)
        return self._forward_dns_cache.get(norm) or self._dns_cache.get(norm)

    def ensure_databases(self):
        """Downloads the MaxMind GeoLite databases from public mirrors if missing."""
        if self.city_db_path.exists() and self.city_db_path.stat().st_size < 1024 * 1024:
            self.city_db_path.unlink()
        if self.asn_db_path.exists() and self.asn_db_path.stat().st_size < 100 * 1024:
            self.asn_db_path.unlink()

        if not self.city_db_path.exists():
            print("* Downloading GeoLite2-City database (might take a minute)...")
            urllib.request.urlretrieve(self.CITY_URL, self.city_db_path)
            print("* GeoLite2-City download complete.")

        if not self.asn_db_path.exists():
            print("* Downloading GeoLite2-ASN database...")
            urllib.request.urlretrieve(self.ASN_URL, self.asn_db_path)
            print("* GeoLite2-ASN download complete.")

    def load(self):
        """Loads the MaxMind readers and service rules."""
        self.ensure_databases()
        try:
            self.city_reader = geoip2.database.Reader(str(self.city_db_path))
            self._probe_wan_origin_bg()
        except Exception as e:
            print(f"Warning: Failed to load GeoIP City database: {e}")
            if self.city_db_path.exists():
                self.city_db_path.unlink()

        try:
            self.asn_reader = geoip2.database.Reader(str(self.asn_db_path))
        except Exception as e:
            print(f"Warning: Failed to load GeoIP ASN database: {e}")
            if self.asn_db_path.exists():
                self.asn_db_path.unlink()

        try:
            if self.rules_path.exists():
                with open(self.rules_path, "r", encoding="utf-8") as f:
                    docs = yaml.safe_load(f)
                    if docs and "services" in docs:
                        self.rules = docs["services"]
            else:
                print(f"Warning: Rules file not found at {self.rules_path}")
        except Exception as e:
            print(f"Warning: Failed to load service rules: {e}")

    def close(self):
        if self.city_reader:
            self.city_reader.close()
        if self.asn_reader:
            self.asn_reader.close()

    def _resolve_dns_nonblocking(self, ip: str) -> Optional[str]:
        """
        Return immediately from forward DNS cache or reverse DNS cache.
        If not yet cached, spawn a daemon background lookup so the main collector loop never blocks.
        """
        if ip in self._forward_dns_cache:
            return self._forward_dns_cache[ip]
        if ip in self._dns_cache:
            return self._dns_cache[ip]

        if ip not in self._pending_dns and len(self._pending_dns) < 64:
            self._pending_dns.add(ip)

            def _bg_lookup(target_ip: str):
                try:
                    hostname, _, _ = socket.gethostbyaddr(target_ip)
                    self._dns_cache[target_ip] = hostname
                except Exception:
                    self._dns_cache[target_ip] = None
                finally:
                    self._pending_dns.discard(target_ip)

            threading.Thread(target=_bg_lookup, args=(ip,), daemon=True).start()

        return None

    def _resolve_geo(self, ip: str) -> GeoInfo:
        norm = normalize_ip(ip)
        if norm in self._geo_cache:
            return self._geo_cache[norm]
        geo = GeoInfo(lat=None, lon=None, country=None, city=None)
        if self.city_reader and norm and not is_loopback_or_unspecified(norm) and not is_lan_or_multicast(norm):
            try:
                resp = self.city_reader.city(norm)
                geo.lat = resp.location.latitude
                geo.lon = resp.location.longitude
                geo.country = resp.country.iso_code
                geo.city = resp.city.name
            except AddressNotFoundError:
                pass
            except Exception:
                pass
        self._geo_cache[norm] = geo
        return geo

    def _resolve_asn(self, ip: str) -> AsnInfo:
        norm = normalize_ip(ip)
        if norm in self._asn_cache:
            return self._asn_cache[norm]
        asn = AsnInfo(number=None, org=None)
        if self.asn_reader and norm and not is_loopback_or_unspecified(norm) and not is_lan_or_multicast(norm):
            try:
                resp = self.asn_reader.asn(norm)
                asn.number = resp.autonomous_system_number
                asn.org = resp.autonomous_system_organization
            except AddressNotFoundError:
                pass
            except Exception:
                pass
        self._asn_cache[norm] = asn
        return asn

    def enrich(self, event: ConnectionEvent) -> ConnectionEvent:
        """Enriches the provided event (mutable) directly without blocking the event loop."""
        if not event.remote or not event.remote.ip:
            return event

        ip = normalize_ip(event.remote.ip)
        event.remote.ip = ip

        if is_loopback_or_unspecified(ip):
            event.remote.hostname = "localhost"
            return event

        # Handle LAN / Multicast / Gateway endpoints cleanly using the host's real geographical origin
        if is_lan_or_multicast(ip):
            origin_geo = self.get_local_origin_geo()
            base_city = origin_geo.city or "Tel Aviv"
            base_country = origin_geo.country or "IL"
            base_lat = origin_geo.lat if origin_geo.lat is not None else 32.0853
            base_lon = origin_geo.lon if origin_geo.lon is not None else 34.7818
            if ip.startswith("224.") or ip.startswith("239.") or ip.lower().startswith("ff0"):
                event.remote.hostname = event.remote.hostname or "multicast.local"
                event.geo = GeoInfo(
                    lat=base_lat,
                    lon=base_lon,
                    country=base_country,
                    city=f"{base_city} (Multicast)",
                )
                event.asn = AsnInfo(number=0, org="Local Multicast Bus")
            else:
                event.remote.hostname = event.remote.hostname or "gateway.lan"
                event.geo = GeoInfo(
                    lat=base_lat,
                    lon=base_lon,
                    country=base_country,
                    city=f"{base_city} (Local LAN)",
                )
                event.asn = AsnInfo(number=0, org="Private LAN Segment")
            if not event.service.category:
                event.service.name = event.service.name or "LAN Discovery / UPnP"
                event.service.category = ServiceCategory.OTHER
            event.anomaly = anomaly_engine.inspect(event)
            return event

        # 1. Enhance hostname from OS DNS Cache or non-blocking reverse DNS
        if not event.remote.hostname:
            hostname = self._resolve_dns_nonblocking(ip)
            if hostname:
                event.remote.hostname = hostname

        # 2. Add GeoIP info (preserve connector-provided GeoInfo if already populated)
        if event.geo.lat is None:
            geo = self._resolve_geo(ip)
            if geo.lat is not None:
                if not geo.country and event.geo.country:
                    geo.country = event.geo.country
                if not geo.city and event.geo.city:
                    geo.city = event.geo.city
                event.geo = geo

        # 3. Add ASN info
        asn = self._resolve_asn(ip)
        if asn.number is not None:
            event.asn = asn

        # 4. Upgrade TCP -> WSS/WS if hostname reveals a realtime/push/websocket stream
        if event.remote.hostname and event.protocol in (Protocol.HTTPS, Protocol.TCP, Protocol.HTTP):
            h_lower = event.remote.hostname.lower()
            if any(
                kw in h_lower
                for kw in (
                    "ws.",
                    "wss.",
                    "websocket",
                    "realtime",
                    "push.",
                    "stream.",
                    "gateway.discord",
                    "slack-msgs",
                    "live.",
                    "signalr",
                    "stitch.googleapis.com",
                )
            ):
                event.protocol = Protocol.WSS if event.remote.port in (443, 8443, 5228) else Protocol.WS
                event.transport = event.transport or "tcp"

        # 5. Add service classification based on hostname rules (if not already set by a module connector)
        if not event.service.name and event.remote.hostname and self.rules:
            for rule in self.rules:
                if fnmatch.fnmatch(event.remote.hostname, rule.get("pattern", "")):
                    event.service.name = rule.get("name")
                    cat_str = rule.get("category", "other")
                    try:
                        event.service.category = ServiceCategory(cat_str)
                    except ValueError:
                        event.service.category = ServiceCategory.OTHER
                    break

        # 6. Fallback service classification based on ASN Org or Protocol
        if not event.service.category:
            org_lower = (event.asn.org or "").lower()
            if any(k in org_lower for k in ("cloudflare", "akamai", "fastly", "cloudfront", "edgecast")):
                event.service.name = event.service.name or (event.asn.org or "CDN Edge")
                event.service.category = ServiceCategory.CDN
            elif any(k in org_lower for k in ("google", "amazon", "microsoft", "azure", "digitalocean", "hetzner", "linode", "oracle")):
                event.service.name = event.service.name or (event.asn.org or "Cloud Provider")
                event.service.category = ServiceCategory.CLOUD
            elif any(k in org_lower for k in ("github", "gitlab", "npmjs", "docker", " anthropic", "openai")):
                event.service.name = event.service.name or (event.asn.org or "Developer Service")
                event.service.category = ServiceCategory.DEV
            elif any(k in org_lower for k in ("salesforce", "hubspot", "zendesk")):
                event.service.name = event.service.name or (event.asn.org or "CRM Cloud")
                event.service.category = ServiceCategory.CRM
            elif event.protocol == Protocol.DNS:
                event.service.name = event.service.name or "DNS Resolution"
                event.service.category = ServiceCategory.CLOUD
            elif event.protocol == Protocol.QUIC:
                event.service.name = event.service.name or "HTTP/3 QUIC Stream"
                event.service.category = ServiceCategory.CDN
            elif event.protocol in (Protocol.WS, Protocol.WSS):
                event.service.name = event.service.name or "WebSocket Stream"
                event.service.category = ServiceCategory.COMMS
            else:
                event.service.name = event.service.name or (event.asn.org or "External Endpoint")
                event.service.category = ServiceCategory.OTHER

        # 7. Fallback approximate coordinate if public IP has no geocoding yet
        if event.geo.lat is None:
            h = int(hashlib.md5(ip.encode()).hexdigest(), 16)
            lat = ((h % 10500) / 100.0) - 45.0
            lon = (((h >> 16) % 27000) / 100.0) - 130.0
            event.geo = GeoInfo(
                lat=round(lat, 4),
                lon=round(lon, 4),
                country=event.geo.country or "Global",
                city=event.geo.city or "Internet Transit",
            )

        # 8. Run Anomaly & Threat Detection (preserve connector-level anomalies if already flagged)
        if not (event.anomaly and event.anomaly.is_anomaly):
            event.anomaly = anomaly_engine.inspect(event)

        return event


# Global enricher
enricher = DataEnricher()
