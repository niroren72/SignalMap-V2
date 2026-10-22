"""SignalMap — Application configuration."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8765
    dev_mode: bool = True
    frontend_url: str = "http://localhost:5173"


class CollectorConfig(BaseModel):
    socket_enabled: bool = True   # Phase 1
    pcap_enabled: bool = False    # Phase 3
    proxy_enabled: bool = False   # Phase 4
    mock_enabled: bool = False    # Phase 0: mock generator
    mock_rate: float = 2.0        # events/sec


class EnrichmentConfig(BaseModel):
    rdns_enabled: bool = True
    geoip_enabled: bool = False   # needs .mmdb
    asn_enabled: bool = False     # needs .mmdb
    service_classifier_enabled: bool = True
    geoip_db_path: str = "agent/data/GeoLite2-City.mmdb"
    asn_db_path: str = "agent/data/GeoLite2-ASN.mmdb"


class StoreConfig(BaseModel):
    sqlite_path: str = "signalmap.db"
    ring_buffer_size: int = 5000


class AppConfig(BaseModel):
    server: ServerConfig = Field(default_factory=ServerConfig)
    collectors: CollectorConfig = Field(default_factory=CollectorConfig)
    enrichment: EnrichmentConfig = Field(default_factory=EnrichmentConfig)
    store: StoreConfig = Field(default_factory=StoreConfig)


# Singleton
config = AppConfig()
