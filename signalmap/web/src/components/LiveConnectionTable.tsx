import { useMemo, useState, Fragment } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { getDataSourceMeta } from './ConnectionTable';
import { ChevronDown, ChevronUp, ChevronRight, Search, X, Copy, Check, GitBranch } from 'lucide-react';
import { groupNestedEvents, matchesModule, normalizeEventGeoToOrigin } from '../utils/nestedConnections';

export function LiveConnectionTable() {
    const {
        events,
        selectedId,
        setSelectedId,
        filters,
        searchQuery,
        tableSortField,
        tableSortDirection,
        setTableSort,
        activeModule,
        originGeo,
    } = useConnectionStore();

    const [isExpanded, setIsExpanded] = useState(false);
    const [tableSearch, setTableSearch] = useState('');
    const [copiedIp, setCopiedIp] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = (groupKey: string, ev: React.MouseEvent) => {
        ev.stopPropagation();
        setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
    };

    // Filter events
    const filteredEvents = useMemo(() => {
        return events
            .filter((e) => {
                if (!matchesModule(e, activeModule)) return false;

                if (filters.protocol && e.protocol !== filters.protocol) return false;
                if (filters.direction && e.direction !== filters.direction) return false;
                if (filters.category && e.service?.category !== filters.category) return false;
                if (filters.source && getDataSourceMeta(e).id !== filters.source && e.source_collector !== filters.source) return false;
                if (filters.anomalyOnly && !e.anomaly?.is_anomaly) return false;
                if (filters.severity && e.anomaly?.severity !== filters.severity) return false;

                const sourceMeta = getDataSourceMeta(e);

                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const matchGlobal =
                        e.local?.process_name?.toLowerCase().includes(q) ||
                        e.local?.user?.toLowerCase().includes(q) ||
                        e.remote?.ip?.toLowerCase().includes(q) ||
                        e.remote?.hostname?.toLowerCase().includes(q) ||
                        e.service?.name?.toLowerCase().includes(q) ||
                        e.geo?.city?.toLowerCase().includes(q) ||
                        e.geo?.country?.toLowerCase().includes(q) ||
                        e.direction?.toLowerCase().includes(q) ||
                        sourceMeta.label.toLowerCase().includes(q) ||
                        sourceMeta.sublabel.toLowerCase().includes(q);
                    if (!matchGlobal) return false;
                }

                if (tableSearch) {
                    const tq = tableSearch.toLowerCase();
                    const matchTable =
                        e.local?.process_name?.toLowerCase().includes(tq) ||
                        e.local?.user?.toLowerCase().includes(tq) ||
                        e.remote?.ip?.toLowerCase().includes(tq) ||
                        e.remote?.hostname?.toLowerCase().includes(tq) ||
                        e.service?.name?.toLowerCase().includes(tq) ||
                        e.protocol?.toLowerCase().includes(tq) ||
                        e.direction?.toLowerCase().includes(tq) ||
                        e.geo?.country?.toLowerCase().includes(tq) ||
                        sourceMeta.label.toLowerCase().includes(tq) ||
                        sourceMeta.sublabel.toLowerCase().includes(tq) ||
                        e.anomaly?.title?.toLowerCase().includes(tq);
                    if (!matchTable) return false;
                }

                return true;
            })
            .map((e) => normalizeEventGeoToOrigin(e, originGeo));
    }, [events, filters, searchQuery, tableSearch, activeModule, originGeo]);

    // Sort events
    const sortedEvents = useMemo(() => {
        const sorted = [...filteredEvents];
        const dir = tableSortDirection === 'asc' ? 1 : -1;

        sorted.sort((a, b) => {
            switch (tableSortField) {
                case 'timestamp': {
                    const ta = new Date(a.metrics?.last_seen || a.metrics?.first_seen || 0).getTime();
                    const tb = new Date(b.metrics?.last_seen || b.metrics?.first_seen || 0).getTime();
                    return (ta - tb) * dir;
                }
                case 'process': {
                    const pa = (a.local?.process_name || '') + (a.local?.user || '');
                    const pb = (b.local?.process_name || '') + (b.local?.user || '');
                    return pa.localeCompare(pb) * dir;
                }
                case 'source': {
                    const sa = getDataSourceMeta(a).label;
                    const sb = getDataSourceMeta(b).label;
                    return sa.localeCompare(sb) * dir;
                }
                case 'protocol': {
                    return (a.protocol || '').localeCompare(b.protocol || '') * dir;
                }
                case 'direction': {
                    return (a.direction || 'outbound').localeCompare(b.direction || 'outbound') * dir;
                }
                case 'remote_ip': {
                    return (a.remote?.ip || '').localeCompare(b.remote?.ip || '') * dir;
                }
                case 'country': {
                    return (a.geo?.country || '').localeCompare(b.geo?.country || '') * dir;
                }
                case 'category': {
                    return (a.service?.category || '').localeCompare(b.service?.category || '') * dir;
                }
                case 'bytes': {
                    const ba = (a.metrics?.bytes_in || 0) + (a.metrics?.bytes_out || 0);
                    const bb = (b.metrics?.bytes_in || 0) + (b.metrics?.bytes_out || 0);
                    return (ba - bb) * dir;
                }
                case 'severity': {
                    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
                    const sa = a.anomaly?.severity ? rank[a.anomaly.severity] : 0;
                    const sb = b.anomaly?.severity ? rank[b.anomaly.severity] : 0;
                    return (sa - sb) * dir;
                }
                default:
                    return 0;
            }
        });

        return sorted;
    }, [filteredEvents, tableSortField, tableSortDirection]);

    const groupedRows = useMemo(() => groupNestedEvents(sortedEvents), [sortedEvents]);
    const totalNestedCount = useMemo(
        () => groupedRows.reduce((sum, g) => sum + g.children.length, 0),
        [groupedRows]
    );

    const handleCopyIp = (ip: string, ev: React.MouseEvent) => {
        ev.stopPropagation();
        navigator.clipboard.writeText(ip);
        setCopiedIp(ip);
        setTimeout(() => setCopiedIp(null), 1500);
    };

    const formatBytes = (bytes?: number | null) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const dm = 1;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const formatTime = (ts?: string | null) => {
        if (!ts) return '-';
        try {
            const d = new Date(ts);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
            return ts;
        }
    };

    const anomalyCount = sortedEvents.filter((e) => e.anomaly?.is_anomaly).length;

    return (
        <div
            className={`shrink-0 z-20 mx-3 mb-2 overflow-hidden flex flex-col border rounded-xl shadow-lg transition-all duration-200 select-none ${
                isExpanded ? 'h-72' : 'h-11'
            }`}
            style={{
                backgroundColor: 'var(--color-bg-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
            }}
        >
            {/* Control Bar Header */}
            <div
                className="flex items-center justify-between px-3.5 py-2 border-b shrink-0 cursor-pointer"
                style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Left info & toggle */}
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="flex items-center gap-1.5 text-xs font-bold font-mono transition-colors"
                        style={{ color: 'var(--color-text-primary)' }}
                    >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        <span>Live Connections</span>
                    </button>

                    <div className="flex items-center gap-2 text-xs font-mono">
                        <span
                            className="px-2 py-0.5 rounded border font-semibold text-[11px]"
                            style={{
                                backgroundColor: 'var(--color-bg-tertiary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-secondary)',
                            }}
                        >
                            {sortedEvents.length} Active
                        </span>

                        {totalNestedCount > 0 && (
                            <span
                                className="px-2 py-0.5 rounded border text-[11px] font-bold flex items-center gap-1"
                                style={{
                                    backgroundColor: 'rgba(99, 102, 241, 0.14)',
                                    borderColor: 'rgba(99, 102, 241, 0.45)',
                                    color: '#a5b4fc',
                                }}
                            >
                                <GitBranch className="w-3 h-3" />
                                <span>{totalNestedCount} Nested</span>
                            </span>
                        )}

                        {anomalyCount > 0 && (
                            <span
                                className="px-2 py-0.5 rounded border text-[11px] font-bold flex items-center gap-1.5"
                                style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                    borderColor: 'var(--color-status-danger)',
                                    color: 'var(--color-status-danger)',
                                }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-status-danger)' }} />
                                {anomalyCount} Threats
                            </span>
                        )}
                    </div>
                </div>

                {/* Middle: Inline Search when expanded */}
                {isExpanded && (
                    <div
                        className="flex items-center gap-2 flex-1 max-w-xs mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="relative w-full flex items-center border rounded-md px-2 py-1"
                            style={{
                                backgroundColor: 'var(--color-bg-primary)',
                                borderColor: 'var(--color-border)',
                            }}
                        >
                            <Search className="w-3.5 h-3.5 mr-1.5 opacity-50 shrink-0" />
                            <input
                                type="text"
                                value={tableSearch}
                                onChange={(e) => setTableSearch(e.target.value)}
                                placeholder="Filter active sockets..."
                                className="w-full bg-transparent text-xs font-mono outline-none"
                                style={{ color: 'var(--color-text-primary)' }}
                            />
                            {tableSearch && (
                                <button
                                    onClick={() => setTableSearch('')}
                                    className="opacity-60 hover:opacity-100"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Right: Expand/Collapse button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono font-medium transition hover:opacity-90"
                    style={{
                        backgroundColor: 'var(--color-bg-primary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-secondary)',
                    }}
                >
                    {isExpanded ? (
                        <>
                            <span>Collapse</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                        </>
                    ) : (
                        <>
                            <span>Expand</span>
                            <ChevronUp className="w-3.5 h-3.5" />
                        </>
                    )}
                </button>
            </div>

            {/* Scrollable Live Table Body */}
            {isExpanded && (
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead
                            className="sticky top-0 z-10 border-b text-[10px] font-mono uppercase select-none"
                            style={{
                                backgroundColor: 'var(--color-bg-secondary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-muted)',
                            }}
                        >
                            <tr>
                                <th onClick={() => setTableSort('severity')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Status
                                        {tableSortField === 'severity' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th onClick={() => setTableSort('timestamp')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Time
                                        {tableSortField === 'timestamp' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th onClick={() => setTableSort('process')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Process / PID / User
                                        {tableSortField === 'process' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th onClick={() => setTableSort('source')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Data Source
                                        {tableSortField === 'source' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th onClick={() => setTableSort('protocol')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Proto
                                        {tableSortField === 'protocol' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th onClick={() => setTableSort('direction')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Direction
                                        {tableSortField === 'direction' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th className="px-3 py-2">Local Socket</th>
                                <th onClick={() => setTableSort('remote_ip')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Remote Endpoint
                                        {tableSortField === 'remote_ip' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th onClick={() => setTableSort('country')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Location
                                        {tableSortField === 'country' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th onClick={() => setTableSort('bytes')} className="px-3 py-2 cursor-pointer hover:opacity-80">
                                    <span className="inline-flex items-center gap-1">
                                        Throughput
                                        {tableSortField === 'bytes' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </span>
                                </th>
                                <th className="px-3 py-2">Anomaly / Details</th>
                                <th className="px-3 py-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y font-mono text-[11px]" style={{ borderColor: 'var(--color-border-hairline)' }}>
                            {groupedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
                                        No active sockets matching current filters.
                                    </td>
                                </tr>
                            ) : (
                                groupedRows.map((group, idx) => {
                                    const isGroupExpanded = Boolean(expandedGroups[group.groupKey]);
                                    const rowsToRender = isGroupExpanded
                                        ? [
                                              { event: group.primary, isChild: false, childIdx: 0 },
                                              ...group.children.map((c, cIdx) => ({ event: c, isChild: true, childIdx: cIdx + 1 })),
                                          ]
                                        : [{ event: group.primary, isChild: false, childIdx: 0 }];

                                    return (
                                        <Fragment key={`live-group-${group.groupKey}-${idx}`}>
                                            {rowsToRender.map(({ event: e, isChild, childIdx }) => {
                                                const eventId = e.id || '';
                                                const isSelected = selectedId === eventId;
                                                const isAnomaly = e.anomaly?.is_anomaly;
                                                const severity = e.anomaly?.severity;
                                                const sourceMeta = getDataSourceMeta(e);
                                                const isInbound = e.direction === 'inbound';

                                                return (
                                                    <tr
                                                        key={`live-row-${group.groupKey}-${eventId || 'e'}-${isChild ? `c-${childIdx}` : 'p'}-${idx}`}
                                                        onClick={() => setSelectedId(selectedId === eventId ? null : (eventId || null))}
                                                        className="cursor-pointer transition-colors hover:opacity-90"
                                                        style={{
                                                            backgroundColor: isSelected
                                                                ? 'var(--color-accent-subtle)'
                                                                : isChild
                                                                ? 'rgba(99, 102, 241, 0.08)'
                                                                : isAnomaly
                                                                ? 'rgba(239, 68, 68, 0.08)'
                                                                : 'transparent',
                                                            borderLeft: isSelected
                                                                ? '3px solid var(--color-accent)'
                                                                : isChild
                                                                ? '3px solid #818cf8'
                                                                : '3px solid transparent',
                                                        }}
                                                    >
                                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                                            {isAnomaly ? (
                                                                <span
                                                                    className="px-2 py-0.5 rounded text-[9px] font-bold uppercase border"
                                                                    style={{
                                                                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                                                        borderColor: 'var(--color-status-danger)',
                                                                        color: 'var(--color-status-danger)',
                                                                    }}
                                                                >
                                                                    {severity || 'Threat'}
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    className="px-2 py-0.5 rounded text-[9px] border"
                                                                    style={{
                                                                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                                                        borderColor: 'var(--color-status-ok)',
                                                                        color: 'var(--color-status-ok)',
                                                                    }}
                                                                >
                                                                    NORMAL
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                                                            {formatTime(e.metrics?.last_seen || e.metrics?.first_seen)}
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                                            <div className={`flex items-center gap-1.5 flex-wrap ${isChild ? 'pl-4' : ''}`}>
                                                                {isChild && (
                                                                    <span className="text-[9.5px] font-bold text-indigo-400">
                                                                        ↳ #{childIdx}
                                                                    </span>
                                                                )}
                                                                <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                                                    {e.local?.process_name || 'System'}
                                                                </span>
                                                                {e.local?.pid != null && (
                                                                    <span className="text-[10px] opacity-60 font-mono">
                                                                        ({e.local.pid})
                                                                    </span>
                                                                )}
                                                                {e.local?.user && (
                                                                    <span
                                                                        className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.2 rounded"
                                                                        style={{
                                                                            backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                                                            color: '#38bdf8',
                                                                            border: '1px solid rgba(56, 189, 248, 0.25)',
                                                                        }}
                                                                        title={`Executing User: ${e.local.user}`}
                                                                    >
                                                                        <span className="w-1 h-1 rounded-full bg-sky-400" />
                                                                        {e.local.user}
                                                                    </span>
                                                                )}
                                                                {!isChild && group.children.length > 0 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(ev) => toggleGroup(group.groupKey, ev)}
                                                                        className="inline-flex items-center gap-0.5 text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded-full border border-indigo-400/50 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 transition cursor-pointer"
                                                                        title="Expand/collapse nested sub-connections"
                                                                    >
                                                                        {isGroupExpanded ? (
                                                                            <ChevronDown className="w-2.5 h-2.5" />
                                                                        ) : (
                                                                            <ChevronRight className="w-2.5 h-2.5" />
                                                                        )}
                                                                        <span>+{group.children.length} nested</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                                            <span
                                                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-mono font-semibold ${sourceMeta.badgeClass}`}
                                                                title={`Collector: ${sourceMeta.sublabel}`}
                                                            >
                                                                <span>{sourceMeta.icon}</span>
                                                                <span>{sourceMeta.label}</span>
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap uppercase font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                                                            {e.protocol || 'TCP'}
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                                            {isInbound ? (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300 font-mono text-[9px] font-bold uppercase">
                                                                    <span>↙</span>
                                                                    <span>INBOUND</span>
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-mono text-[9px] font-bold uppercase">
                                                                    <span>↗</span>
                                                                    <span>OUTBOUND</span>
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                                                            {e.local?.host || '127.0.0.1'}:{e.local?.port || 0}
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                                            <div className="flex items-center gap-1.5">
                                                                <span style={{ color: 'var(--color-accent-text)' }}>
                                                                    {e.remote?.ip || '0.0.0.0'}:{e.remote?.port || 0}
                                                                </span>
                                                                {e.remote?.ip && (
                                                                    <button
                                                                        onClick={(ev) => handleCopyIp(e.remote?.ip || '', ev)}
                                                                        className="opacity-50 hover:opacity-100 transition"
                                                                        title="Copy IP"
                                                                    >
                                                                        {copiedIp === e.remote.ip ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                                                            {e.geo?.city ? `${e.geo.city}, ` : ''}{e.geo?.country || 'Local'}
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                                            <span style={{ color: 'var(--color-status-ok)' }}>↓ {formatBytes(e.metrics?.bytes_in)}</span>{' '}
                                                            <span style={{ color: 'var(--color-accent-text)' }}>↑ {formatBytes(e.metrics?.bytes_out)}</span>
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap max-w-[180px] truncate" style={{ color: isAnomaly ? 'var(--color-status-danger)' : 'var(--color-text-muted)' }}>
                                                            {e.anomaly?.title || e.anomaly?.description || '-'}
                                                        </td>
                                                        <td className="px-3 py-1.5 whitespace-nowrap text-right">
                                                            <button
                                                                onClick={(ev) => {
                                                                    ev.stopPropagation();
                                                                    setSelectedId(selectedId === eventId ? null : (eventId || null));
                                                                }}
                                                                className="px-2 py-0.5 rounded border text-[10px] font-semibold transition hover:opacity-80 cursor-pointer"
                                                                style={{
                                                                    backgroundColor: selectedId === eventId ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                                                                    borderColor: selectedId === eventId ? 'var(--color-accent)' : 'var(--color-border)',
                                                                    color: selectedId === eventId ? '#ffffff' : 'var(--color-text-primary)',
                                                                }}
                                                            >
                                                                {selectedId === eventId ? 'Close' : '🔬 Inspect'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
