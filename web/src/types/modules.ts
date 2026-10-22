export type ModuleCategory = 'endpoint' | 'saas' | 'identity' | 'cloud';
export type ModuleStatus = 'active' | 'connected' | 'standby' | 'preview';

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
