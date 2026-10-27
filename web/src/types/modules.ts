export type ModuleCategory = 'endpoint' | 'saas' | 'identity' | 'cloud';
export type ModuleStatus = 'active' | 'connected' | 'standby' | 'preview';

export interface ModuleDataSource {
    id: string;
    name: string;
    type: string; // e.g. 'Kernel Subsystem', 'Event Collector', 'Cloud REST API', 'Identity Mesh'
    status: 'active' | 'connected' | 'standby' | 'syncing';
    protocol?: string;
    frequency?: string;
    description: string;
}

export interface SystemModule {
    id: string; // 'all' | 'windows' | 'macos' | 'salesforce' | 'hris' | 'cloud'
    name: string;
    shortName: string;
    icon: string;
    category: ModuleCategory;
    status: ModuleStatus;
    badge?: string;
    version: string;
    description: string;
    telemetryTypes: string[];
    dataSources: ModuleDataSource[];
    capabilities: {
        liveSockets?: boolean;
        eventLogs?: boolean;
        remediation?: boolean;
        geoAudit?: boolean;
        apiConnectors?: boolean;
    };
    stats: {
        totalEvents: number;
        activeSockets?: number;
        threatsCount: number;
        sourceType: string;
    };
}

export const SYSTEM_MODULES: SystemModule[] = [
    {
        id: 'windows',
        name: 'Windows Endpoint Telemetry',
        shortName: 'Windows Host',
        icon: '🪟',
        category: 'endpoint',
        status: 'active',
        badge: 'LIVE ENGINE',
        version: 'v1.4.0',
        description: 'Native socket tracking via psutil/netstat, Windows EVTX Security & Sysmon log parsing, and netsh advfirewall remediation.',
        telemetryTypes: ['Live TCP/UDP Sockets', 'Process PID & Handles', 'EVTX Audit Logs', 'Host Adapter I/O'],
        dataSources: [
            {
                id: 'win-psutil',
                name: 'psutil.net_connections',
                type: 'Kernel Subsystem',
                status: 'active',
                protocol: 'AF_INET / SOCK_STREAM',
                frequency: '1.0s poll',
                description: 'Direct Windows kernel socket enumerator for established and listening TCP/UDP endpoints.',
            },
            {
                id: 'win-evtx',
                name: 'Windows Event Log (EVTX)',
                type: 'Event Collector',
                status: 'active',
                protocol: 'Win32 EVTX API',
                frequency: 'Event-driven',
                description: 'Parses Security Event 5156 (Firewall Connection) and Sysmon Event 3 (Network Connect).',
            },
            {
                id: 'win-wfp',
                name: 'Windows Filtering Platform (WFP)',
                type: 'Firewall Engine',
                status: 'active',
                protocol: 'netsh advfirewall',
                frequency: 'Real-time',
                description: 'Enforces live host firewall rules and active socket connection termination.',
            },
            {
                id: 'win-proc',
                name: 'Process Token Security Provider',
                type: 'Identity Provider',
                status: 'active',
                protocol: 'Win32 Process Token API',
                frequency: 'On socket query',
                description: 'Resolves executing Windows user account name and privilege level for each active PID.',
            },
        ],
        capabilities: {
            liveSockets: true,
            eventLogs: true,
            remediation: true,
            geoAudit: true,
            apiConnectors: false,
        },
        stats: {
            totalEvents: 175,
            activeSockets: 175,
            threatsCount: 2,
            sourceType: 'Kernel & OS Sockets',
        },
    },
    {
        id: 'salesforce',
        name: 'Salesforce Cloud Security',
        shortName: 'Salesforce',
        icon: '☁️',
        category: 'saas',
        status: 'connected',
        badge: 'SAAS AUDIT',
        version: 'v1.1.0',
        description: 'Salesforce Event Monitoring & LoginHistory connector. Detects anomalous geo-logins, credential stuffing, and bulk data exfiltration.',
        telemetryTypes: ['LoginHistory Geolocation', 'UriEvent API Queries', 'LightningEventStream', 'ReportExport Spikes'],
        dataSources: [
            {
                id: 'sf-event-mon',
                name: 'Event Monitoring REST API',
                type: 'Cloud REST API',
                status: 'connected',
                protocol: 'HTTPS / OAuth 2.0',
                frequency: 'Real-time Pub/Sub',
                description: 'Ingests ApiEvent, LightningLogger, and ReportExportStream across tenant instances.',
            },
            {
                id: 'sf-login-history',
                name: 'LoginHistory SOAP/REST Service',
                type: 'Authentication Audit',
                status: 'connected',
                protocol: 'HTTPS / JSON',
                frequency: '5s polling',
                description: 'Monitors source IP geolocation, TLS ciphers, and anomalous multi-country credential use.',
            },
            {
                id: 'sf-lightning-bus',
                name: 'Lightning Event Bus Stream',
                type: 'Pub/Sub Bus',
                status: 'active',
                protocol: 'CometD / Bayeux Protocol',
                frequency: 'Streaming',
                description: 'Captures interactive user session activities, privileged record edits, and role changes.',
            },
            {
                id: 'sf-dlp-audit',
                name: 'ReportExport DLP Monitor',
                type: 'DLP Pipeline',
                status: 'connected',
                protocol: 'Webhook / Event Relay',
                frequency: 'On export trigger',
                description: 'Alerts on bulk customer opportunity or lead exfiltration spikes beyond baseline.',
            },
        ],
        capabilities: {
            liveSockets: false,
            eventLogs: true,
            remediation: true,
            geoAudit: true,
            apiConnectors: true,
        },
        stats: {
            totalEvents: 420,
            threatsCount: 3,
            sourceType: 'Salesforce Event API & CSV/JSONL',
        },
    },
    {
        id: 'hris',
        name: 'HRIS Identity & Access Mesh',
        shortName: 'HRIS Systems',
        icon: '👤',
        category: 'identity',
        status: 'connected',
        badge: 'IDENTITY CORRELATION',
        version: 'v1.0.0',
        description: 'Workday, BambooHR, and Rippling employee lifecycle integration. Correlates network connections against employee status, departments, and off-hours access.',
        telemetryTypes: ['Employee Login Telemetry', 'Termination Status Checks', 'Off-Hours Work Alerts', 'Role-Based Access'],
        dataSources: [
            {
                id: 'hris-workday',
                name: 'Workday HCM Enterprise API',
                type: 'Enterprise Webhook',
                status: 'connected',
                protocol: 'HTTPS / mTLS Webhook',
                frequency: 'Real-time webhook',
                description: 'Syncs active employee employment status, department ownership, and termination timestamps.',
            },
            {
                id: 'hris-bamboo',
                name: 'BambooHR Directory Feed',
                type: 'Directory Service',
                status: 'connected',
                protocol: 'REST API v1',
                frequency: '15m sync',
                description: 'Correlates office locations, remote allowances, and contractor termination notices.',
            },
            {
                id: 'hris-okta-scim',
                name: 'Okta / Entra ID SCIM Mesh',
                type: 'IdP SCIM Feeder',
                status: 'active',
                protocol: 'SCIM 2.0 / OAuth',
                frequency: 'Continuous stream',
                description: 'Maps corporate SSO user identities to socket connections and host process owners.',
            },
            {
                id: 'hris-physical-badge',
                name: 'Physical Badge Access Gateway',
                type: 'Physical Security Feeder',
                status: 'standby',
                protocol: 'Syslog / TLS',
                frequency: 'On badge swipe',
                description: 'Correlates turnstile badge-ins with concurrent remote VPN / socket connection locations.',
            },
        ],
        capabilities: {
            liveSockets: false,
            eventLogs: true,
            remediation: false,
            geoAudit: true,
            apiConnectors: true,
        },
        stats: {
            totalEvents: 310,
            threatsCount: 1,
            sourceType: 'HRIS REST Webhooks & Audit Feeds',
        },
    },
    {
        id: 'macos',
        name: 'macOS & Unix Endpoint Agent',
        shortName: 'macOS / Unix',
        icon: '🍎',
        category: 'endpoint',
        status: 'standby',
        badge: 'CROSS-PLATFORM',
        version: 'v0.9.0',
        description: 'macOS / Linux endpoint daemon using pfctl, eBPF / auditd, and BSD socket polling for unified cross-platform endpoint defense.',
        telemetryTypes: ['BSD Socket Polling', 'pfctl Packet Filter', 'Auditd Process Traces', 'Launchd Daemons'],
        dataSources: [
            {
                id: 'mac-pfctl',
                name: 'Packet Filter (pfctl) Subsystem',
                type: 'Kernel Packet Filter',
                status: 'standby',
                protocol: '/dev/pf ioctl API',
                frequency: 'Real-time state table',
                description: 'Inspects macOS kernel network state tables, NAT routes, and active socket mappings.',
            },
            {
                id: 'mac-libproc',
                name: 'BSD libproc / sysctl Enumerator',
                type: 'Kernel Subsystem',
                status: 'standby',
                protocol: 'sysctl() / proc_pidinfo()',
                frequency: '1.0s poll',
                description: 'Low-overhead PID socket enumeration and Mach port reference tracking.',
            },
            {
                id: 'mac-auditd',
                name: 'OpenBSM Auditd Security Pipeline',
                type: 'Security Auditd',
                status: 'standby',
                protocol: '/dev/auditpipe',
                frequency: 'Event-driven stream',
                description: 'Captures socket connect(), bind(), and execve() process execution events.',
            },
            {
                id: 'mac-esf',
                name: 'Apple Endpoint Security Framework (ESF)',
                type: 'System Extension',
                status: 'standby',
                protocol: 'EndpointSecurity.framework',
                frequency: 'Kernel callbacks',
                description: 'Subscribes to authorization events for binary execution and outgoing network flows.',
            },
        ],
        capabilities: {
            liveSockets: true,
            eventLogs: true,
            remediation: true,
            geoAudit: true,
            apiConnectors: false,
        },
        stats: {
            totalEvents: 0,
            threatsCount: 0,
            sourceType: 'Unix Daemon / Shell Connector',
        },
    },
    {
        id: 'cloud',
        name: 'Cloud Infrastructure & VPC Mesh',
        shortName: 'AWS / Cloud VPC',
        icon: '🌐',
        category: 'cloud',
        status: 'preview',
        badge: 'INFRASTRUCTURE',
        version: 'v0.8.0',
        description: 'AWS VPC Flow Logs, GuardDuty findings, and GCP Cloud Audit log streaming into SignalMap 3D Globe topology.',
        telemetryTypes: ['VPC Flow Logs', 'Transit Gateway Metrics', 'CloudTrail Findings', 'S3 Bucket Ingress'],
        dataSources: [
            {
                id: 'cloud-vpc-flow',
                name: 'AWS VPC Flow Logs Collector',
                type: 'CloudWatch Stream',
                status: 'standby',
                protocol: 'S3 / Kinesis Firehose',
                frequency: '1m aggregation',
                description: 'Captures accept/reject IP flow records across VPC subnets, ENIs, and Transit Gateways.',
            },
            {
                id: 'cloud-guardduty',
                name: 'AWS GuardDuty Threat Findings',
                type: 'Threat Intelligence',
                status: 'standby',
                protocol: 'EventBridge Bus',
                frequency: 'Real-time alert push',
                description: 'Streams threat findings for crypto-mining, PortSweep, and anomalous IAM token usage.',
            },
            {
                id: 'cloud-gcp-audit',
                name: 'GCP Cloud Audit & VPC Flow Logs',
                type: 'GCP Pub/Sub',
                status: 'standby',
                protocol: 'Google Cloud Pub/Sub',
                frequency: 'Streaming feed',
                description: 'Aggregates multi-region VPC packet telemetry and IAM administrative audit events.',
            },
            {
                id: 'cloud-azure-nsg',
                name: 'Azure Network Watcher Flow Engine',
                type: 'Azure Event Hub',
                status: 'standby',
                protocol: 'HTTPS / EventHub',
                frequency: '5m aggregate',
                description: 'Collects NSG flow logs and Traffic Analytics data across Azure subscriptions.',
            },
        ],
        capabilities: {
            liveSockets: false,
            eventLogs: true,
            remediation: false,
            geoAudit: true,
            apiConnectors: true,
        },
        stats: {
            totalEvents: 0,
            threatsCount: 0,
            sourceType: 'CloudWatch & VPC Flow Feeds',
        },
    },
];
