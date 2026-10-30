import { useState, useMemo, Fragment } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { SYSTEM_MODULES } from '../types/modules';
import {
    groupNestedEvents,
    isSampleEvent,
    matchesModule,
    normalizeEventGeoToOrigin,
} from '../utils/nestedConnections';
import { ChevronDown, ChevronRight, Download, Trash2, GitBranch, Binary } from 'lucide-react';

const DEFAULT_MOCK_COMPONENTS = [
    {
        id: 'comp-1',
        local: { process_name: 'Antigravity.exe', pid: 8476, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'localhost', port: 63558 },
        asn: { org: 'localhost' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-2',
        local: { process_name: 'opera.exe', pid: 2456, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'local_network', port: 8009 },
        asn: { org: 'local_network' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-3',
        local: { process_name: 'language_server_windows_x64.exe', pid: 14380, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'Google LLC', port: 443 },
        asn: { org: 'Google LLC' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-4',
        local: { process_name: 'language_server_windows_x64.exe', pid: 14380, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'localhost', port: 50955 },
        asn: { org: 'localhost' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-5',
        local: { process_name: 'M365Copilot.exe', pid: 16972, user: 'Administrator' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'Microsoft Corporation', port: 443 },
        asn: { org: 'Microsoft Corporation' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-6',
        local: { process_name: 'language_server_windows_x64.exe', pid: 3952, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'localhost', port: 54153 },
        asn: { org: 'localhost' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-7',
        local: { process_name: 'Antigravity IDE.exe', pid: 7184, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'localhost', port: 63645 },
        asn: { org: 'localhost' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-8',
        local: { process_name: 'node.exe', pid: 11024, user: 'SYSTEM' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'localhost', port: 5173 },
        asn: { org: 'localhost' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-9',
        local: { process_name: 'python.exe', pid: 9364, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'localhost', port: 8765 },
        asn: { org: 'localhost' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-10',
        local: { process_name: 'chrome.exe', pid: 14016, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'Amazon.com, Inc.', port: 443 },
        asn: { org: 'Amazon.com, Inc.' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-11',
        local: { process_name: 'Code.exe', pid: 18240, user: 'User' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'Microsoft Corporation', port: 443 },
        asn: { org: 'Microsoft Corporation' },
        protocol: 'TCP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
    {
        id: 'comp-12',
        local: { process_name: 'svchost.exe', pid: 1120, user: 'LOCAL SERVICE' },
        service: { category: 'TELEMETRY' },
        remote: { hostname: 'local_network', port: 5353 },
        asn: { org: 'local_network' },
        protocol: 'UDP',
        anomaly: { is_anomaly: false },
        metrics: { last_seen: null },
    },
];

const DEFAULT_MOCK_STREAM = [
    { target: 'localhost', proto: 'TCP', timeAgo: '1m ago', proc: 'Antigravity.exe' },
    { target: 'local_network', proto: 'TCP', timeAgo: '2m ago', proc: 'opera.exe' },
    { target: '172.217.117.4', proto: 'TCP', timeAgo: '3m ago', proc: 'language_server_windows_x64.exe' },
    { target: 'localhost', proto: 'TCP', timeAgo: '4m ago', proc: 'language_server_windows_x64.exe' },
    { target: '20.184.175.12', proto: 'TCP', timeAgo: '5m ago', proc: 'M365Copilot.exe' },
];

export function DashboardView() {
    const {
        events,
        selectedId,
        setSelectedId,
        setActiveView,
        searchQuery: globalSearch,
        setFilter,
        activeModule,
        setActiveModule,
        ingestSampleModule,
        clearSampleModule,
        originGeo,
    } = useConnectionStore();
    const [tableSearch, setTableSearch] = useState('');
    const [timeframe, setTimeframe] = useState<'1h' | '6h' | '24h'>('1h');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const PAGE_SIZE = 7;

    const toggleGroup = (groupKey: string, ev: React.MouseEvent) => {
        ev.stopPropagation();
        setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
    };

    const activeModObj = useMemo(
        () => SYSTEM_MODULES.find((m) => m.id === activeModule),
        [activeModule]
    );

    // Filter events by the active module selected in the Header toggle
    const moduleEvents = useMemo(
        () =>
            events
                .filter((e) => matchesModule(e, activeModule))
                .map((e) => normalizeEventGeoToOrigin(e, originGeo)),
        [events, activeModule, originGeo]
    );

    const activeSampleCount = useMemo(
        () =>
            activeModule !== 'all'
                ? events.filter((e) => isSampleEvent(e, activeModule)).length
                : events.filter((e) => isSampleEvent(e)).length,
        [events, activeModule]
    );

    // ── Metric Calculations (Scoped to activeModule) ────────────────────
    const {
        activeSocketCount,
        dataProcessedMB,
        avgThroughputKB,
        uniqueProcessCount,
        faultedProcessCount,
        threatCount,
        cleanPct,
        unclassifiedPct,
        threatPct,
        protocolStats,
        totalPackets,
        inboundCount,
        outboundCount,
    } = useMemo(() => {
        const isScoped = activeModule !== 'all';
        const totalEvents = moduleEvents.length || 1;
        let totalBytes = 0;
        let totalPkts = 0;
        let threats = 0;
        let unclassified = 0;
        let inbound = 0;
        let outbound = 0;

        const processMap = new Map<string, boolean>();
        const protocols: Record<string, number> = {
            TCP: 0,
            UDP: 0,
            HTTPS: 0,
            HTTP: 0,
            OTHER: 0,
        };

        for (const e of moduleEvents) {
            const bytesIn = e.metrics?.bytes_in || 0;
            const bytesOut = e.metrics?.bytes_out || 0;
            totalBytes += bytesIn + bytesOut;
            totalPkts += e.metrics?.packets || 8;

            if (e.direction === 'inbound') inbound++;
            else outbound++;

            if (e.anomaly?.is_anomaly) {
                threats++;
            }
            if (!e.service?.name && !e.service?.category) {
                unclassified++;
            }

            const procName = e.local?.process_name || 'System';
            const isFaulted = Boolean(e.anomaly?.is_anomaly);
            if (!processMap.has(procName) || isFaulted) {
                processMap.set(procName, isFaulted);
            }

            const p = (e.protocol || 'other').toUpperCase();
            if (p === 'TCP') {
                if (e.remote?.port === 443 || e.local?.port === 443) {
                    protocols.HTTPS++;
                } else if (e.remote?.port === 80 || e.local?.port === 80) {
                    protocols.HTTP++;
                } else {
                    protocols.TCP++;
                }
            } else if (p === 'UDP' || p === 'QUIC' || p === 'DNS' || p === 'NTP') {
                protocols.UDP++;
            } else if (p === 'HTTPS' || p === 'WSS') {
                protocols.HTTPS++;
            } else if (p === 'HTTP' || p === 'WS') {
                protocols.HTTP++;
            } else {
                protocols.OTHER++;
            }
        }

        const cleanCount = Math.max(0, totalEvents - threats - unclassified);
        const clean = moduleEvents.length > 0 ? Number(((cleanCount / totalEvents) * 100).toFixed(1)) : 100.0;
        const unclass = moduleEvents.length > 0 ? Number(((unclassified / totalEvents) * 100).toFixed(1)) : 0.0;
        const threatP = moduleEvents.length > 0 ? Number(((threats / totalEvents) * 100).toFixed(1)) : 0.0;

        let faultedCount = 0;
        processMap.forEach((isFaulted) => {
            if (isFaulted) faultedCount++;
        });

        const displaySockets = moduleEvents.length > 0 ? moduleEvents.length : isScoped ? 0 : 12;
        const totalMB =
            moduleEvents.length > 0
                ? Number((totalBytes / (1024 * 1024)).toFixed(1))
                : isScoped
                ? 0
                : 142;
        const avgKB =
            moduleEvents.length > 0
                ? (totalBytes / totalEvents / 1024).toFixed(1)
                : isScoped
                ? '0.0'
                : '5.2';
        const displayProcs = processMap.size > 0 ? processMap.size : isScoped ? 0 : 7;
        const displayPkts = totalPkts > 0 ? totalPkts : isScoped ? 0 : 4821;

        const protoList = [
            {
                name: 'TCP',
                count: moduleEvents.length > 0 || isScoped ? protocols.TCP : 12,
                share: protocols.TCP ? Number(((protocols.TCP / totalEvents) * 100).toFixed(1)) : isScoped ? 0 : 24.0,
                bgBar: 'bg-amber-500/80 group-hover:bg-amber-400',
                text: 'text-amber-400',
                border: 'hover:border-amber-500/40',
                barHeight: `${Math.max(8, Math.min(100, protocols.TCP ? Math.round((protocols.TCP / totalEvents) * 100) : isScoped ? 8 : 54))}%`,
            },
            {
                name: 'UDP',
                count: moduleEvents.length > 0 || isScoped ? protocols.UDP : 8,
                share: protocols.UDP ? Number(((protocols.UDP / totalEvents) * 100).toFixed(1)) : isScoped ? 0 : 16.0,
                bgBar: 'bg-orange-500/80 group-hover:bg-orange-400',
                text: 'text-orange-400',
                border: 'hover:border-orange-500/40',
                barHeight: `${Math.max(8, Math.min(100, protocols.UDP ? Math.round((protocols.UDP / totalEvents) * 100) : isScoped ? 8 : 36))}%`,
            },
            {
                name: 'HTTPS',
                count: moduleEvents.length > 0 || isScoped ? protocols.HTTPS : 22,
                share: protocols.HTTPS ? Number(((protocols.HTTPS / totalEvents) * 100).toFixed(1)) : isScoped ? 0 : 44.0,
                bgBar: 'bg-cyan-500 group-hover:bg-cyan-400 shadow-sm shadow-cyan-500/40',
                text: 'text-cyan-400',
                border: 'hover:border-cyan-500/40',
                barHeight: `${Math.max(8, Math.min(100, protocols.HTTPS ? Math.round((protocols.HTTPS / totalEvents) * 100) : isScoped ? 8 : 100))}%`,
            },
            {
                name: 'HTTP',
                count: moduleEvents.length > 0 || isScoped ? protocols.HTTP : 5,
                share: protocols.HTTP ? Number(((protocols.HTTP / totalEvents) * 100).toFixed(1)) : isScoped ? 0 : 10.0,
                bgBar: 'bg-sky-500/80 group-hover:bg-sky-400',
                text: 'text-sky-400',
                border: 'hover:border-sky-500/40',
                barHeight: `${Math.max(8, Math.min(100, protocols.HTTP ? Math.round((protocols.HTTP / totalEvents) * 100) : isScoped ? 8 : 22))}%`,
            },
            {
                name: 'OTHER',
                count: moduleEvents.length > 0 || isScoped ? protocols.OTHER : 3,
                share: protocols.OTHER ? Number(((protocols.OTHER / totalEvents) * 100).toFixed(1)) : isScoped ? 0 : 6.0,
                bgBar: 'bg-slate-600 group-hover:bg-slate-500',
                text: 'text-slate-400',
                border: 'hover:border-slate-500/40',
                barHeight: `${Math.max(8, Math.min(100, protocols.OTHER ? Math.round((protocols.OTHER / totalEvents) * 100) : isScoped ? 8 : 14))}%`,
            },
        ];

        return {
            activeSocketCount: displaySockets,
            dataProcessedMB: totalMB,
            avgThroughputKB: avgKB,
            uniqueProcessCount: displayProcs,
            faultedProcessCount: faultedCount,
            threatCount: threats,
            cleanPct: clean,
            unclassifiedPct: unclass,
            threatPct: threatP,
            protocolStats: protoList,
            totalPackets: displayPkts,
            inboundCount: inbound,
            outboundCount: outbound,
        };
    }, [moduleEvents, activeModule]);

    // ── Unified Source List (Module-Scoped Events; only fallback to mock if 'all' and 0 events) ──
    const sourceList = useMemo(() => {
        if (moduleEvents.length > 0) return moduleEvents;
        if (activeModule !== 'all') return [];
        return DEFAULT_MOCK_COMPONENTS as any[];
    }, [moduleEvents, activeModule]);

    // ── Table Filtering, Nested Grouping & Pagination ───────────────────
    const filteredEvents = useMemo(() => {
        const query = (tableSearch || globalSearch).toLowerCase().trim();
        if (!query) return sourceList;

        return sourceList.filter((e) => {
            const proc = (e.local?.process_name || '').toLowerCase();
            const pid = String(e.local?.pid || '');
            const ip = (e.remote?.ip || '').toLowerCase();
            const host = (e.remote?.hostname || '').toLowerCase();
            const org = (e.asn?.org || '').toLowerCase();
            const proto = (e.protocol || '').toLowerCase();
            const dir = (e.direction || 'outbound').toLowerCase();
            return (
                proc.includes(query) ||
                pid.includes(query) ||
                ip.includes(query) ||
                host.includes(query) ||
                org.includes(query) ||
                proto.includes(query) ||
                dir.includes(query)
            );
        });
    }, [sourceList, tableSearch, globalSearch]);

    const groupedRows = useMemo(() => groupNestedEvents(filteredEvents), [filteredEvents]);
    const totalNestedCount = useMemo(
        () => groupedRows.reduce((sum, g) => sum + g.children.length, 0),
        [groupedRows]
    );

    const totalPages = Math.ceil(groupedRows.length / PAGE_SIZE) || 1;
    const paginatedGroups = useMemo(() => {
        const safePage = Math.min(currentPage, totalPages);
        const start = (safePage - 1) * PAGE_SIZE;
        return groupedRows.slice(start, start + PAGE_SIZE);
    }, [groupedRows, currentPage, totalPages]);

    // Gauge circumference: 251.2
    const gaugeCircumference = 251.2;
    const strokeDashoffset = Math.max(0, gaugeCircumference * (1 - cleanPct / 100));

    const formatTimeAgo = (dateStr?: string | null, index = 0) => {
        if (!dateStr) {
            return index === 0 ? 'Just now' : `${index + 1}m ago`;
        }
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        return `${Math.floor(mins / 60)}h ago`;
    };

    // Live Activity Stream Items (Scoped to activeModule)
    const streamItems = useMemo(() => {
        if (moduleEvents.length > 0) {
            return moduleEvents.slice(-5).reverse().map((e, idx) => ({
                id: e.id || idx,
                target: e.asn?.org || e.remote?.hostname || (e.remote?.ip === '127.0.0.1' ? 'localhost' : e.remote?.ip) || 'localhost',
                proto: (e.protocol || 'TCP').toUpperCase(),
                direction: (e.direction || 'outbound').toUpperCase(),
                proc: e.local?.process_name || 'System',
                timeAgo: formatTimeAgo(e.metrics?.last_seen, idx),
            }));
        }
        if (activeModule !== 'all') {
            return [];
        }
        return DEFAULT_MOCK_STREAM.map((item, idx) => ({
            id: `stream-${idx}`,
            direction: 'OUTBOUND',
            ...item,
        }));
    }, [moduleEvents, activeModule]);

    return (
        <main className="flex-1 p-4 space-y-4 max-w-[1920px] mx-auto w-full select-none" data-purpose="main-dashboard-canvas">
            {/* Active Cluster & Direction / Sample Controls Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl border border-white/10 bg-[#0c1322]/90">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-semibold font-mono text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        {activeModObj ? activeModObj.name : 'All Connected Clusters'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/25 text-cyan-300 font-mono text-[10px]">
                        ↗ Outbound: {outboundCount}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/25 text-emerald-300 font-mono text-[10px]">
                        ↙ Inbound: {inboundCount}
                    </span>
                    {totalNestedCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 font-mono text-[10px]">
                            <GitBranch className="w-3 h-3" />
                            +{totalNestedCount} nested
                        </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                        Origin: {originGeo.city || 'Tel Aviv'}, {originGeo.country || 'IL'} ({originGeo.lat.toFixed(2)}, {originGeo.lng.toFixed(2)})
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {activeModule !== 'all' && (
                        <>
                            <button
                                onClick={() => ingestSampleModule(activeModule)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-mono font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                            >
                                <Download className="w-3 h-3" />
                                Ingest Sample
                            </button>
                            {activeSampleCount > 0 && (
                                <button
                                    onClick={() => clearSampleModule(activeModule)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-mono font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    Clear Sample ({activeSampleCount})
                                </button>
                            )}
                            <button
                                onClick={() => setActiveModule('all')}
                                className="px-2 py-1 rounded-lg text-[10.5px] font-mono text-slate-400 hover:text-white bg-slate-900 border border-white/10 transition-colors cursor-pointer"
                            >
                                Show All Connected
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => {
                            if (selectedId) {
                                setSelectedId(null);
                            } else {
                                const pick = moduleEvents[0]?.id || events[0]?.id || 'default-inspect-1';
                                setSelectedId(pick);
                            }
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10.5px] font-mono font-bold transition-all cursor-pointer shadow-sm ${
                            selectedId
                                ? 'bg-cyan-500 text-white border border-cyan-400 ring-2 ring-cyan-400/50 shadow-cyan-500/20'
                                : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/50'
                        }`}
                        title="Open Deep Data Inspection & Payload Suite"
                    >
                        <Binary className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{selectedId ? 'Close Inspect' : '🔬 Open Inspection Suite'}</span>
                    </button>
                </div>
            </div>

            {/* BEGIN: TopKPISection */}
            {/* 4 Key Telemetry Metrics with High-Tech Monospace Data */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-purpose="kpi-metric-cards">
                {/* KPI 1: Active Telemetry Sockets */}
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#0e1626] to-[#0a101b] p-3.5 group hover:border-emerald-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium tracking-wide">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active telemetry sockets
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            +{activeSocketCount} live
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <div className="text-2xl font-bold text-white tracking-tight font-mono">{activeSocketCount}</div>
                        <div className="text-[10px] text-emerald-400/80 font-mono flex items-center gap-1">
                            <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M5 10l7-7m0 0l7 7m-7-7v18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            </svg>
                            {cleanPct}% nominal
                        </div>
                    </div>
                    {/* Progress Line Indicator */}
                    <div className="mt-2.5 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full w-full" />
                    </div>
                </div>

                {/* KPI 2: Data Processed */}
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#0e1626] to-[#0a101b] p-3.5 group hover:border-cyan-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium tracking-wide">
                            <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            </svg>
                            Data processed
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                            +{totalPackets > 1000 ? 61 : events.length * 5} pkts
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <div className="text-2xl font-bold text-white tracking-tight font-mono">
                            {dataProcessedMB} <span className="text-sm font-semibold text-slate-400">MB</span>
                        </div>
                        <div className="text-[10px] text-cyan-400/80 font-mono">{avgThroughputKB} kB/s avg</div>
                    </div>
                    {/* Progress Line Indicator */}
                    <div className="mt-2.5 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style={{ width: '68%' }} />
                    </div>
                </div>

                {/* KPI 3: Host Processes */}
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#0e1626] to-[#0a101b] p-3.5 group hover:border-indigo-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium tracking-wide">
                            <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            </svg>
                            Host processes
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">active listeners</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <div className="text-2xl font-bold text-white tracking-tight font-mono">{uniqueProcessCount}</div>
                        <div className="text-[10px] text-indigo-300 font-mono">{faultedProcessCount} faulted</div>
                    </div>
                    {/* Progress Line Indicator */}
                    <div className="mt-2.5 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: '45%' }} />
                    </div>
                </div>

                {/* KPI 4: Security Threat Signals */}
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#0e1626] to-[#0a101b] p-3.5 group hover:border-rose-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium tracking-wide">
                            <svg className="w-3 h-3 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            </svg>
                            Security threat signals
                        </span>
                        <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                threatCount === 0
                                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                    : 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                            }`}
                        >
                            {threatCount === 0 ? 'Shielded' : 'Alert Active'}
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <div className="text-2xl font-bold text-white tracking-tight font-mono">{threatCount}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{threatCount} anomalies detected</div>
                    </div>
                    {/* Progress Line Indicator */}
                    <div className="mt-2.5 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full w-full ${
                                threatCount === 0 ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                        />
                    </div>
                </div>
            </section>
            {/* END: TopKPISection */}

            {/* BEGIN: MiddleVisualizations */}
            {/* Clearance Rate Radial Chart & Protocol Distribution Bars */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4" data-purpose="charts-section">
                {/* Left: Telemetry Clearance Rate Gauge */}
                <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0c1322] p-4 sm:p-5 shadow-xl flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-xs font-semibold text-white tracking-wide">Telemetry clearance rate</h3>
                            <p className="text-[10.5px] text-slate-400">Automated deep packet inspection verdict</p>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-900 border border-white/5 p-0.5 rounded-lg text-[10px]">
                            {(['1h', '6h', '24h'] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTimeframe(t)}
                                    className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                                        timeframe === t ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Gauge Radial Display */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
                        <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full donut-gauge" viewBox="0 0 100 100">
                                {/* Background Track */}
                                <circle cx="50" cy="50" fill="transparent" r="40" stroke="#162235" strokeWidth="9" />
                                {/* Progress Emerald Track */}
                                <circle
                                    className="donut-glow"
                                    cx="50"
                                    cy="50"
                                    fill="transparent"
                                    r="40"
                                    stroke="#10b981"
                                    strokeDasharray="251.2"
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                    strokeWidth="9"
                                />
                            </svg>
                            {/* Gauge Inner Data */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-xl font-bold font-mono tracking-tight text-white">{cleanPct}%</span>
                                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5 mt-0.5">
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path d="M5 10l7-7m0 0l7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                                    </svg>
                                    {activeSocketCount} active
                                </span>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex flex-col gap-2 font-sans text-[11px] w-full sm:w-auto">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                                <span className="text-slate-300 font-medium">Verified Clean</span>
                                <span className="ml-auto font-mono text-emerald-400 font-bold pl-3">{cleanPct}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-400/80" />
                                <span className="text-slate-400">Unclassified</span>
                                <span className="ml-auto font-mono text-slate-500 pl-3">{unclassifiedPct}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500/80" />
                                <span className="text-slate-400">Threat Flags</span>
                                <span className="ml-auto font-mono text-slate-500 pl-3">{threatPct}%</span>
                            </div>
                            <div className="pt-2 border-t border-white/5 text-[10px] text-slate-500 flex items-center gap-1">
                                <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                                </svg>
                                Zero payload drift detected
                            </div>
                        </div>
                    </div>

                    {/* Card Bottom Bar */}
                    <div className="mt-1.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>Sensor: EDR-Kernel-v2</span>
                        <span className="text-emerald-400 font-medium">Heuristic Guard Active</span>
                    </div>
                </div>

                {/* Right: Traffic by Protocol Distribution */}
                <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0c1322] p-4 sm:p-5 shadow-xl flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-xs font-semibold text-white tracking-wide">Traffic by protocol distribution</h3>
                            <p className="text-[10.5px] text-slate-400">Breakdown across {activeSocketCount} observed transport sockets</p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono text-[10px] bg-slate-900 border border-white/5 px-2 py-0.5 rounded-md">
                                Total Packets: {totalPackets.toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Protocol Column Breakdown Panels */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 my-1.5">
                        {protocolStats.map((p) => (
                            <div
                                key={p.name}
                                onClick={() => setFilter('protocol', p.name.toLowerCase())}
                                className={`bg-[#090f1a] border border-white/5 rounded-xl p-2.5 flex flex-col justify-between relative overflow-hidden group ${p.border} transition-colors cursor-pointer hover:border-cyan-500/50 hover:bg-[#0d1627]`}
                                title={`Click to filter by ${p.name}`}
                            >
                                <div>
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-medium">
                                        {p.name}
                                    </span>
                                    <div className="text-xl font-bold font-mono text-white mt-0.5">{p.count}</div>
                                </div>
                                <div className="mt-2.5">
                                    <div className="h-11 w-full bg-slate-800/40 rounded flex items-end p-0.5">
                                        <div
                                            className={`w-full ${p.bgBar} rounded transition-colors`}
                                            style={{ height: p.barHeight }}
                                        />
                                    </div>
                                    <div className="flex justify-between items-center mt-1.5 text-[10px] font-mono">
                                        <span className="text-slate-400">Share</span>
                                        <span className={`${p.text} font-bold`}>{p.share}%</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer Summary Progress Bar */}
                    <div className="mt-2 pt-2.5 border-t border-white/5">
                        <div className="w-full h-1 rounded-full overflow-hidden flex bg-slate-800">
                            <div className="bg-amber-500" style={{ width: '24%' }} title="TCP: 24%" />
                            <div className="bg-orange-500" style={{ width: '16%' }} title="UDP: 16%" />
                            <div className="bg-cyan-500" style={{ width: '44%' }} title="HTTPS: 44%" />
                            <div className="bg-sky-500" style={{ width: '10%' }} title="HTTP: 10%" />
                            <div className="bg-slate-600" style={{ width: '6%' }} title="Other: 6%" />
                        </div>
                    </div>
                </div>
            </section>
            {/* END: MiddleVisualizations */}

            {/* BEGIN: DataGridAndStreamSection */}
            {/* Telemetry Components Grid (Left 70%) & Live Activity Stream (Right 30%) */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4" data-purpose="bottom-grid-and-activity-stream">
                {/* Telemetry Components Table (8 Cols on LG) */}
                <div className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#0c1322] shadow-xl overflow-hidden flex flex-col">
                    {/* Table Header Toolbar */}
                    <div className="p-3 sm:px-4 py-2 border-b border-white/5 flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5">
                            <h3 className="text-xs font-semibold text-white tracking-wide">Active telemetry components</h3>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-white/5">
                                {filteredEvents.length} total
                            </span>
                        </div>
                        {/* Filter Search & Quick Actions */}
                        <div className="flex items-center gap-1.5">
                            <div className="relative">
                                <input
                                    value={tableSearch}
                                    onChange={(e) => {
                                        setTableSearch(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="bg-[#090f1a] border border-white/10 text-[11px] rounded-lg pl-7 pr-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 w-44 font-mono"
                                    placeholder="Filter by name, PID, host..."
                                    type="text"
                                />
                                <svg className="w-3 h-3 text-slate-500 absolute left-2 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                                </svg>
                            </div>
                            <button
                                onClick={() => setActiveView('table')}
                                className="p-1 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer"
                                title="Filter options"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                                </svg>
                            </button>
                            <button
                                onClick={() => setActiveView('table')}
                                className="p-1 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer"
                                title="More options"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-[#090f1a]/60 text-slate-400 font-mono uppercase text-[9.5px] tracking-wider">
                                    <th className="py-2 px-3 sm:px-4 font-semibold" scope="col">Component / Process</th>
                                    <th className="py-2 px-2.5 font-semibold" scope="col">Direction</th>
                                    <th className="py-2 px-2.5 font-semibold" scope="col">Category</th>
                                    <th className="py-2 px-2.5 font-semibold" scope="col">Status</th>
                                    <th className="py-2 px-2.5 font-semibold" scope="col">Remote ASN / Supplier</th>
                                    <th className="py-2 px-2.5 font-semibold" scope="col">Target Protocol</th>
                                    <th className="py-2 px-3 sm:px-4 font-semibold text-right" scope="col">Last Seen</th>
                                    <th className="py-2 px-3 sm:px-4 font-semibold text-right" scope="col">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-sans">
                                {paginatedGroups.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-slate-400 font-mono text-xs">
                                            No telemetry records in this cluster yet. Use &quot;Ingest Sample&quot; above or in System Modules to populate sample telemetry.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedGroups.map((group, idx) => {
                                        const e = group.primary;
                                        const isExpanded = Boolean(expandedGroups[group.groupKey]);
                                        const nestedCount = group.children.length;

                                        const renderDashboardRow = (ev: any, childIdx?: number) => {
                                            const isChild = childIdx !== undefined;
                                            const procName = ev.local?.process_name || 'System';
                                            const pid = ev.local?.pid ? `PID-${ev.local.pid}` : 'PID-8476';
                                            const dir = (ev.direction || 'outbound').toLowerCase();
                                            const isInbound = dir === 'inbound';
                                            const category = (ev.service?.category || 'TELEMETRY').toUpperCase();
                                            const isAnomaly = Boolean(ev.anomaly?.is_anomaly);
                                            const remoteTarget =
                                                ev.asn?.org ||
                                                ev.remote?.hostname ||
                                                (ev.remote?.ip === '127.0.0.1' ? 'localhost' : ev.remote?.ip) ||
                                                'localhost';
                                            const port = ev.remote?.port || ev.local?.port || 443;
                                            const isHttps = port === 443;
                                            const protoStr = `${(ev.protocol || 'TCP').toUpperCase()} :${port}`;
                                            const lastSeen = formatTimeAgo(ev.metrics?.last_seen, idx);

                                            return (
                                                <tr
                                                    key={`dash-row-${group.groupKey}-${ev.id || 'e'}-${isChild ? `child-${childIdx}` : 'primary'}-${idx}`}
                                                    onClick={() => ev.id && setSelectedId(ev.id)}
                                                    className={`hover:bg-slate-800/30 transition-colors group cursor-pointer ${
                                                        isChild ? 'bg-indigo-950/15' : ''
                                                    }`}
                                                >
                                                    <td className="py-1.5 px-3 sm:px-4">
                                                        <div className={`flex items-center gap-2.5 ${isChild ? 'pl-5' : ''}`}>
                                                            {isChild ? (
                                                                <span className="text-[10px] font-mono text-indigo-400 font-semibold shrink-0">
                                                                    ↳ #{childIdx + 1}
                                                                </span>
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-md bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                                                                    </svg>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-medium text-slate-200 group-hover:text-emerald-300 font-mono text-[11px] transition-colors leading-tight">
                                                                        {procName}
                                                                    </span>
                                                                    {!isChild && nestedCount > 0 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(clickEv) => toggleGroup(group.groupKey, clickEv)}
                                                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9.5px] font-mono font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 cursor-pointer"
                                                                            title="Expand/collapse nested child connections"
                                                                        >
                                                                            {isExpanded ? (
                                                                                <ChevronDown className="w-2.5 h-2.5" />
                                                                            ) : (
                                                                                <ChevronRight className="w-2.5 h-2.5" />
                                                                            )}
                                                                            +{nestedCount} nested
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-[9.5px] font-mono text-slate-500">
                                                                    <span>{pid}</span>
                                                                    {(ev.local as any)?.user && (
                                                                        <span className="text-cyan-400 font-medium bg-cyan-950/60 px-1 py-0.2 rounded border border-cyan-800/40">
                                                                            {(ev.local as any).user}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-1.5 px-2.5 font-mono">
                                                        {isInbound ? (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                                ↙ INBOUND
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                                                ↗ OUTBOUND
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-slate-400 font-mono text-[10px]">{category}</td>
                                                    <td className="py-1.5 px-2.5">
                                                        {isAnomaly ? (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Threat
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Passed
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-slate-300 font-mono text-[10.5px] truncate max-w-[190px]">{remoteTarget}</td>
                                                    <td className="py-1.5 px-2.5 font-mono">
                                                        {isHttps ? (
                                                            <span className="bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded text-[10px] text-cyan-300">
                                                                {protoStr}
                                                            </span>
                                                        ) : (
                                                            <span className="bg-slate-900 border border-white/10 px-1.5 py-0.5 rounded text-[10px] text-slate-300">
                                                                {protoStr}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-1.5 px-3 sm:px-4 text-right text-slate-400 font-mono text-[10px]">
                                                        {lastSeen}
                                                    </td>
                                                    <td className="py-1.5 px-3 sm:px-4 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={(btnEv) => {
                                                                btnEv.stopPropagation();
                                                                const targetId = ev.id || 'default-inspect-1';
                                                                setSelectedId(selectedId === targetId ? null : targetId);
                                                            }}
                                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition cursor-pointer shadow-xs ${
                                                                selectedId === ev.id
                                                                    ? 'bg-cyan-500 text-white font-bold ring-2 ring-cyan-400/50'
                                                                    : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30'
                                                            }`}
                                                            title="Inspect socket data and wire payloads"
                                                        >
                                                            <Binary className="w-2.5 h-2.5" />
                                                            {selectedId === ev.id ? 'Close' : 'Inspect'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        };

                                        return (
                                            <Fragment key={`dash-fg-${group.groupKey}-${idx}`}>
                                                {renderDashboardRow(e)}
                                                {isExpanded &&
                                                    group.children.map((child, cIdx) => renderDashboardRow(child, cIdx))}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Table Footer Pagination/Status */}
                    <div className="p-2 px-4 border-t border-white/5 bg-[#090f1a]/80 flex items-center justify-between text-[10.5px] text-slate-400">
                        <span className="font-mono text-[10px]">
                            Showing {paginatedGroups.length} primary groups ({filteredEvents.length} total sockets)
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white border border-white/5 disabled:opacity-40 cursor-pointer text-[10px]"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white border border-white/5 disabled:opacity-40 cursor-pointer text-[10px]"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                {/* Live Telemetry Stream / Activity Feed (4 Cols on LG) */}
                <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#0c1322] shadow-xl p-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-2.5 pb-1.5 border-b border-white/5">
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                </span>
                                <h3 className="text-xs font-semibold text-white tracking-wide">Live Telemetry Activity</h3>
                            </div>
                            <button
                                onClick={() => setActiveView('table')}
                                className="text-[11px] font-mono text-emerald-400 hover:underline hover:text-emerald-300 cursor-pointer"
                            >
                                View All
                            </button>
                        </div>

                        {/* Stream Timeline Items */}
                        <div className="space-y-2 font-mono">
                            {streamItems.map((item, sIdx) => (
                                <div
                                    key={`stream-${item.id}-${sIdx}`}
                                    onClick={() => setSelectedId(String(item.id))}
                                    className="flex items-start gap-2.5 p-2 rounded-lg bg-[#090f1a] border border-white/5 hover:border-emerald-500/30 transition-all cursor-pointer"
                                    title="Click to inspect payload stream"
                                >
                                    <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="font-medium text-slate-200 truncate">
                                                Connected — {item.target}
                                            </span>
                                            <span className="text-[9.5px] text-slate-400 shrink-0">{item.proto}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                                            {item.timeAgo} • <span className="text-slate-300">{item.proc}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Terminal Status Notice */}
                    <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Stream sync: 24ms
                        </span>
                        <button
                            onClick={() => setTableSearch('')}
                            className="hover:text-white transition-colors cursor-pointer"
                        >
                            Clear feed
                        </button>
                    </div>
                </div>
            </section>
            {/* END: DataGridAndStreamSection */}
        </main>
    );
}
