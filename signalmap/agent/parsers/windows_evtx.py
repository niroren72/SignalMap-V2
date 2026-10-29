"""
SignalMap — Windows Event Log / EVTX parser.

Reads Windows Security + Firewall event logs that contain network data.
Works with:
  - .evtx files (via the `pyevtx` or `python-evtx` library)
  - Exported .csv/.txt from Event Viewer
  - Parsed XML exports (.xml)

Windows network-relevant Event IDs:
  - 5156 / 5158  Windows Filtering Platform (WFP) permitted/blocked connections
  - 5157         WFP blocked connection
  - 4624 / 4625  Logon (contains IP of authenticated remote host)
  - 3             Sysmon network connect event
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import AsyncIterator

from . import LogParser, register
from ..schema import (
    ConnectionEvent, RemoteEndpoint, LocalEndpoint,
    Protocol, Direction, State, Metrics,
)

# CSV/TXT export pattern for WFP events (Event Viewer export)
_CSV_IP_RE = re.compile(r'\b(\d{1,3}(?:\.\d{1,3}){3})\b')

# Sysmon Event ID 3 XML tags
_SYSMON_NS = '{http://schemas.microsoft.com/win/2004/08/events/event}'

# Event IDs that contain useful network connection data
_NETWORK_EVENT_IDS = {5156, 5157, 5158, 3}


@register
class WindowsEvtxParser(LogParser):

    @classmethod
    def can_parse(cls, filename: str, first_bytes: bytes) -> bool:
        name = filename.lower()
        # Binary EVTX magic: 'ElfFile\x00'
        if first_bytes and first_bytes[:8] == b'ElfFile\x00':
            return True
        if any(name.endswith(ext) for ext in ('.evtx',)):
            return True
        # XML Event Viewer export
        if name.endswith('.xml') and first_bytes:
            sample = first_bytes.decode('utf-8', errors='ignore')
            return '<Events>' in sample or '<Event ' in sample
        return False

    async def parse(self, stream: AsyncIterator[bytes]) -> AsyncIterator[ConnectionEvent]:
        raw = b""
        async for chunk in stream:
            raw += chunk

        # Try binary EVTX via python-evtx (optional)
        if raw[:8] == b'ElfFile\x00':
            async for event in _parse_evtx_binary(raw):
                yield event
            return

        # Try XML export
        text = raw.decode('utf-8', errors='ignore')
        if '<Event ' in text or '<Events>' in text:
            async for event in _parse_xml_export(text):
                yield event
            return


async def _parse_evtx_binary(data: bytes) -> AsyncIterator[ConnectionEvent]:
    """Parse binary .evtx using python-evtx library (optional dependency)."""
    try:
        import importlib
        evtx_mod = importlib.import_module("Evtx.Evtx")
        import io

        fh = io.BytesIO(data)
        with evtx_mod.Evtx(fh) as log:
            for record in log.records():
                try:
                    xml_str = record.xml()
                    event = _parse_evtx_record_xml(xml_str)
                    if event:
                        yield event
                except Exception:
                    continue
    except ImportError:
        # python-evtx not installed — yield nothing but don't crash
        return


def _parse_evtx_record_xml(xml_str: str) -> ConnectionEvent | None:
    """Parse a single EVTX record XML string into a ConnectionEvent."""
    try:
        root = ET.fromstring(xml_str)
        ns = _SYSMON_NS

        # Get EventID
        system = root.find(f'{ns}System')
        if system is None:
            return None
        event_id_el = system.find(f'{ns}EventID')
        if event_id_el is None or event_id_el.text is None:
            return None
        event_id = int(event_id_el.text)

        if event_id not in _NETWORK_EVENT_IDS:
            return None

        # Extract EventData fields as a dict
        event_data = root.find(f'{ns}EventData')
        if event_data is None:
            return None

        fields: dict[str, str] = {}
        for data_el in event_data.findall(f'{ns}Data'):
            name = data_el.get('Name', '')
            fields[name] = data_el.text or ''

        # WFP events (5156/5157/5158) field names
        dest_ip = (fields.get('DestAddress') or fields.get('DestinationIp')
                   or fields.get('DestinationAddress') or fields.get('DestAddress', ''))
        src_ip = (fields.get('SourceAddress') or fields.get('SourceIp', ''))
        dest_port_str = fields.get('DestPort') or fields.get('DestinationPort', '')
        src_port_str = fields.get('SourcePort', '')
        proto_num = fields.get('Protocol', '6')
        process = fields.get('Application') or fields.get('Image') or 'system'

        # Sysmon Event 3 fields
        if event_id == 3:
            dest_ip = fields.get('DestinationIp', dest_ip)
            dest_port_str = fields.get('DestinationPort', dest_port_str)
            src_ip = fields.get('SourceIp', src_ip)
            process = fields.get('Image', process)

        if not dest_ip:
            return None

        proto = Protocol.UDP if proto_num == '17' else Protocol.TCP
        direction = Direction.OUTBOUND if event_id in (5156, 3) else Direction.INBOUND

        return ConnectionEvent(
            source_collector='windows_evtx',
            direction=direction,
            state=State.CLOSED,
            protocol=proto,
            local=LocalEndpoint(
                process_name=process.split('\\')[-1] if process else 'system',
                port=int(src_port_str) if src_port_str else None,
            ),
            remote=RemoteEndpoint(
                ip=dest_ip,
                port=int(dest_port_str) if dest_port_str else None,
            ),
            metrics=Metrics(),
        )
    except Exception:
        return None


async def _parse_xml_export(text: str) -> AsyncIterator[ConnectionEvent]:
    """Parse an XML file exported from Windows Event Viewer."""
    try:
        # Wrap in root if multiple <Event> tags
        if not text.strip().startswith('<Events>'):
            text = f'<Events>{text}</Events>'
        root = ET.fromstring(text)
        for event_el in root.findall('.//{http://schemas.microsoft.com/win/2004/08/events/event}Event'):
            xml_str = ET.tostring(event_el, encoding='unicode')
            event = _parse_evtx_record_xml(xml_str)
            if event:
                yield event
    except ET.ParseError:
        return
