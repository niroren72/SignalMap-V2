import os
import socket
import urllib.request
from pathlib import Path
from typing import Optional
import yaml
import fnmatch

import geoip2.database
from geoip2.errors import AddressNotFoundError

from .schema import ConnectionEvent, GeoInfo, AsnInfo, RemoteEndpoint
from .anomaly import anomaly_engine


class DataEnricher:
    """Enriches ConnectionEvents with GeoIP, ASN, and Reverse DNS data."""

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

        # Simple caches
        self._dns_cache = {}
        self._geo_cache = {}
        self._asn_cache = {}

    def ensure_databases(self):
        """Downloads the MaxMind GeoLite databases from public mirrors if missing."""
        # Simple heuristic: if file is under 1MB, it's likely a corrupted HTML page
        if self.city_db_path.exists() and self.city_db_path.stat().st_size < 1024 * 1024:
            self.city_db_path.unlink()
        if self.asn_db_path.exists() and self.asn_db_path.stat().st_size < 100 * 1024:
            self.asn_db_path.unlink()

        if not self.city_db_path.exists():
            print(f"* Downloading GeoLite2-City database (might take a minute)...")
            urllib.request.urlretrieve(self.CITY_URL, self.city_db_path)
            print("* GeoLite2-City download complete.")
            
        if not self.asn_db_path.exists():
            print(f"* Downloading GeoLite2-ASN database...")
            urllib.request.urlretrieve(self.ASN_URL, self.asn_db_path)
            print("* GeoLite2-ASN download complete.")

    def load(self):
        """Loads the MaxMind readers and service rules."""
        self.ensure_databases()
        try:
            self.city_reader = geoip2.database.Reader(str(self.city_db_path))
        except Exception as e:
            print(f"Warning: Failed to load GeoIP City database: {e}")
            if self.city_db_path.exists(): self.city_db_path.unlink()
            
        try:
            self.asn_reader = geoip2.database.Reader(str(self.asn_db_path))
        except Exception as e:
            print(f"Warning: Failed to load GeoIP ASN database: {e}")
            if self.asn_db_path.exists(): self.asn_db_path.unlink()
            
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

    def _resolve_dns(self, ip: str) -> Optional[str]:
        if ip in self._dns_cache:
            return self._dns_cache[ip]
        try:
            hostname, _, _ = socket.gethostbyaddr(ip)
            self._dns_cache[ip] = hostname
            return hostname
        except Exception:
            self._dns_cache[ip] = None
            return None

    def _resolve_geo(self, ip: str) -> GeoInfo:
        if ip in self._geo_cache:
            return self._geo_cache[ip]
        geo = GeoInfo(lat=None, lon=None, country=None, city=None)
        if self.city_reader:
            try:
                resp = self.city_reader.city(ip)
                geo.lat = resp.location.latitude
                geo.lon = resp.location.longitude
                geo.country = resp.country.iso_code
                geo.city = resp.city.name
            except AddressNotFoundError:
                pass
            except Exception as e:
                pass
        self._geo_cache[ip] = geo
        return geo

    def _resolve_asn(self, ip: str) -> AsnInfo:
        if ip in self._asn_cache:
            return self._asn_cache[ip]
        asn = AsnInfo(number=None, org=None)
        if self.asn_reader:
            try:
                resp = self.asn_reader.asn(ip)
                asn.number = resp.autonomous_system_number
                asn.org = resp.autonomous_system_organization
            except AddressNotFoundError:
                pass
            except Exception as e:
                pass
        self._asn_cache[ip] = asn
        return asn

    def enrich(self, event: ConnectionEvent) -> ConnectionEvent:
        """Enriches the provided event (mutable) directly."""
        if not event.remote or not event.remote.ip:
            return event

        ip = event.remote.ip
        
        # Skip enrichment for private/local IPs
        if ip.startswith("127.") or ip.startswith("10.") or \
           ip.startswith("192.168.") or ip.startswith("::1"):
            event.remote.hostname = "localhost" if ip in ("127.0.0.1", "::1") else "local_network"
            return event

        # Enhance hostname if missing
        if not event.remote.hostname:
            hostname = self._resolve_dns(ip)
            if hostname:
                event.remote.hostname = hostname

        # Add geo info
        geo = self._resolve_geo(ip)
        if geo.lat is not None:
            event.geo = geo

        # Add ASN info
        asn = self._resolve_asn(ip)
        if asn.number is not None:
            event.asn = asn

        # Add service classification based on rules
        if event.remote.hostname and self.rules:
            for rule in self.rules:
                if fnmatch.fnmatch(event.remote.hostname, rule.get("pattern", "")):
                    event.service.name = rule.get("name")
                    # Map to the strict enum type gracefully (or default to OTHER)
                    cat_str = rule.get("category", "other")
                    try:
                        from .schema import ServiceCategory
                        event.service.category = ServiceCategory(cat_str)
                    except ValueError:
                        from .schema import ServiceCategory
                        event.service.category = ServiceCategory.OTHER
                    break

        # Fallback approximate coordinate if public IP has no geocoding yet
        if event.geo.lat is None and not ip.startswith("127.") and not ip.startswith("192.168.") and not ip.startswith("10."):
            # Deterministic hash to generate stable pseudo-coords for unmapped public IPs
            import hashlib
            h = int(hashlib.md5(ip.encode()).hexdigest(), 16)
            # Latitude between -45 and 60, Longitude between -130 and 140
            lat = ((h % 10500) / 100.0) - 45.0
            lon = (((h >> 16) % 27000) / 100.0) - 130.0
            event.geo = GeoInfo(lat=round(lat, 4), lon=round(lon, 4), country="Global", city="Internet Transit")

        # Run Anomaly & Threat Detection
        event.anomaly = anomaly_engine.inspect(event)

        return event

# Global enricher
enricher = DataEnricher()
