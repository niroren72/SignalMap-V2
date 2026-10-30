// Auto-generated — do not edit. Run: python -m agent.schema
// Generated at: 2026-10-30T01:26:00.000000Z

export type Direction = "inbound" | "outbound";
export type State = "active" | "closed";
export type Protocol = "tcp" | "udp" | "http" | "https" | "ws" | "wss" | "dns" | "quic" | "ssh" | "rdp" | "smb" | "ntp";
export type NodeType = "local_process" | "local_host" | "remote_endpoint" | "service" | "geo_location";
export type ServiceCategory = "finance" | "crm" | "dev" | "comms" | "cloud" | "cdn" | "other";
export type Severity = "low" | "medium" | "high" | "critical";

export interface AnomalyInfo {
  is_anomaly?: boolean;
  severity?: Severity;
  title?: string;
  description?: string | null;
  rule?: string | null;
  tags?: string[];
}

export interface AsnInfo {
  number?: number | null;
  org?: string | null;
}

export interface GeoInfo {
  lat?: number | null;
  lon?: number | null;
  country?: string | null;
  city?: string | null;
}

export interface HttpMeta {
  method?: string | null;
  url_path?: string | null;
  status_code?: number | null;
  req_size?: number | null;
  resp_size?: number | null;
  content_type?: string | null;
}

export interface LocalEndpoint {
  pid?: number | null;
  process_name?: string | null;
  user?: string | null;
  host?: string | null;
  port?: number | null;
}

export interface Metrics {
  bytes_in?: number;
  bytes_out?: number;
  packets?: number;
  first_seen?: string | null;
  last_seen?: string | null;
}

export interface RemoteEndpoint {
  ip?: OptionalString;
  hostname?: string | null;
  port?: number | null;
}

type OptionalString = string | null;

export interface ServiceInfo {
  name?: string | null;
  category?: ServiceCategory | null;
}

export interface ConnectionEvent {
  id?: string;
  source_collector?: string;
  direction?: Direction;
  state?: State;
  protocol?: Protocol;
  transport?: string | null;
  local?: LocalEndpoint;
  remote?: RemoteEndpoint;
  geo?: GeoInfo;
  asn?: AsnInfo;
  service?: ServiceInfo;
  metrics?: Metrics;
  http?: HttpMeta | null;
  anomaly?: AnomalyInfo | null;
}
