import { useMemo, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useConnectionStore } from '../stores/connectionStore';
import { Search, X, ChevronUp, ChevronDown, Download } from 'lucide-react';

export function ConnectionTable() {
    const {
        events,
        selectedId,
        setSelectedId,
        filters,
        searchQuery,
        tableSortField,
        tableSortDirection,
        setTableSort,
        playbackTime,
        isLive,
    } = useConnectionStore();

    const [tableSearch, setTableSearch] = useState('');
    const [copiedIp, setCopiedIp] = useState<string | null>(null);

    // Filter events based on active filters, timeline, and table search
    const filteredEvents = useMemo(() => {
        return events.filter((e) => {
            // Timeline scrubber filter
            if (!isLive && playbackTime !== null) {
                const eventTime = e.metrics?.last_seen || e.metrics?.first_seen;
                if (eventTime && new Date(eventTime).getTime() > playbackTime) {
                    return false;
                }
            }

            // Global FilterBar filters
            if (filters.protocol && e.protocol !== filters.protocol) return false;
            if (filters.direction && e.direction !== filters.direction) return false;
            if (filters.category && e.service?.category !== filters.category) return false;
            if (filters.anomalyOnly && !e.anomaly?.is_anomaly) return false;
            if (filters.severity && e.anomaly?.severity !== filters.severity) return false;

            // Global search query
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchGlobal =
                    e.local?.process_name?.toLowerCase().includes(q) ||
                    e.remote?.ip?.toLowerCase().includes(q) ||
                    e.remote?.hostname?.toLowerCase().includes(q) ||
                    e.service?.name?.toLowerCase().includes(q) ||
                    e.geo?.city?.toLowerCase().includes(q) ||
                    e.geo?.country?.toLowerCase().includes(q) ||
                    e.asn?.org?.toLowerCase().includes(q);
                if (!matchGlobal) return false;
            }

            // Table-specific search
            if (tableSearch) {
                const tq = tableSearch.toLowerCase();
                const matchTable =
                    e.local?.process_name?.toLowerCase().includes(tq) ||
                    e.remote?.ip?.toLowerCase().includes(tq) ||
                    e.remote?.hostname?.toLowerCase().includes(tq) ||
                    e.service?.name?.toLowerCase().includes(tq) ||
                    e.protocol?.toLowerCase().includes(tq) ||
                    e.geo?.country?.toLowerCase().includes(tq) ||
                    e.geo?.city?.toLowerCase().includes(tq) ||
                    e.asn?.org?.toLowerCase().includes(tq) ||
                    e.anomaly?.title?.toLowerCase().includes(tq) ||
                    e.anomaly?.description?.toLowerCase().includes(tq) ||
                    e.anomaly?.tags?.some((t) => t.toLowerCase().includes(tq));
                if (!matchTable) return false;
            }

            return true;
        });
    }, [events, filters, searchQuery, tableSearch, isLive, playbackTime]);

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
                    const pa = a.local?.process_name || '';
                    const pb = b.local?.process_name || '';
                    return pa.localeCompare(pb) * dir;
                }
                case 'protocol': {
                    return (a.protocol || '').localeCompare(b.protocol || '') * dir;
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

    const handleCopyIp = (ip: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(ip);
        setCopiedIp(ip);
        setTimeout(() => setCopiedIp(null), 1500);
    };

    const formatBytes = (bytes?: number) => {
        if (!bytes) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

    const handleExport = (format: 'json' | 'csv') => {
        window.open(`/api/events/export?format=${format}&limit=5000`, '_blank');
    };

    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: sortedEvents.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 44,
        overscan: 12,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();
    const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? totalSize - virtualRows[virtualRows.length - 1].end
            : 0;

    return (
        <div className="flex-1 w-full min-h-0 flex flex-col glass-card border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden">
            {/* Table Control Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950/90 border-b border-slate-800 shrink-0 select-none">
                {/* Left: Table Title & Record Counter */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-100 font-mono">
                        <span className="text-base">📋</span>
                        <span>CONNECTIONS TELEMETRY GRID</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="px-2.5 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-bold">
                            {sortedEvents.length} / {events.length} Records
                        </span>

                        {sortedEvents.some((e) => e.anomaly?.is_anomaly) && (
                            <span className="px-2.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold flex items-center gap-1.5 animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-rose-400" />
                                {sortedEvents.filter((e) => e.anomaly?.is_anomaly).length} Threat Alerts
                            </span>
                        )}
                    </div>
                </div>

                {/* Middle: Quick Search Input */}
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                    <div className="relative w-full">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 pointer-events-none">
                            <Search className="w-3.5 h-3.5" />
                        </span>
                        <input
                            type="text"
                            value={tableSearch}
                            onChange={(e) => setTableSearch(e.target.value)}
                            placeholder="Filter table by process, IP, domain, city..."
                            className="w-full pl-8 pr-7 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 transition-colors"
                        />
                        {tableSearch && (
                            <button
                                onClick={() => setTableSearch('')}
                                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-500 hover:text-slate-300"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Right: Export & Table Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleExport('csv')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-semibold transition"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                    </button>
                    <button
                        onClick={() => handleExport('json')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-semibold transition"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export JSON</span>
                    </button>
                </div>
            </div>

            {/* Scrollable Table Area */}
            <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
                <table className="w-full min-w-[1000px] text-left border-collapse text-xs">
                    {/* Sticky Table Header */}
                    <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-800 text-[11px] font-mono text-slate-400 select-none shadow-sm">
                        <tr>
                            <th
                                onClick={() => setTableSort('severity')}
                                className="px-3.5 py-2.5 cursor-pointer hover:text-cyan-400 transition whitespace-nowrap"
                            >
                                <span className="inline-flex items-center gap-1">
                                    STATUS
                                    {tableSortField === 'severity' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                            </th>
                            <th
                                onClick={() => setTableSort('timestamp')}
                                className="px-3.5 py-2.5 cursor-pointer hover:text-cyan-400 transition whitespace-nowrap"
                            >
                                <span className="inline-flex items-center gap-1">
                                    LAST SEEN
                                    {tableSortField === 'timestamp' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                            </th>
                            <th
                                onClick={() => setTableSort('process')}
                                className="px-3.5 py-2.5 cursor-pointer hover:text-cyan-400 transition whitespace-nowrap"
                            >
                                <span className="inline-flex items-center gap-1">
                                    PROCESS / PID
                                    {tableSortField === 'process' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                            </th>
                            <th
                                onClick={() => setTableSort('protocol')}
                                className="px-3.5 py-2.5 cursor-pointer hover:text-cyan-400 transition whitespace-nowrap"
                            >
                                <span className="inline-flex items-center gap-1">
                                    PROTO
                                    {tableSortField === 'protocol' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                            </th>
                            <th className="px-3.5 py-2.5 whitespace-nowrap">LOCAL SOCKET</th>
                            <th
                                onClick={() => setTableSort('remote_ip')}
                                className="px-3.5 py-2.5 cursor-pointer hover:text-cyan-400 transition whitespace-nowrap"
                            >
                                <span className="inline-flex items-center gap-1">
                                    REMOTE ENDPOINT
                                    {tableSortField === 'remote_ip' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                            </th>
                            <th
                                onClick={() => setTableSort('country')}
                                className="px-3.5 py-2.5 cursor-pointer hover:text-cyan-400 transition whitespace-nowrap"
                            >
                                <span className="inline-flex items-center gap-1">
                                    GEO / LOCATION
                                    {tableSortField === 'country' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                            </th>
                            <th
                                onClick={() => setTableSort('category')}
                                className="px-3.5 py-2.5 cursor-pointer hover:text-cyan-400 transition whitespace-nowrap"
                            >
                                <span className="inline-flex items-center gap-1">
                                    CATEGORY
                                    {tableSortField === 'category' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                            </th>
                            <th className="px-3.5 py-2.5 whitespace-nowrap">ASN / ORG</th>
                            <th
                                onClick={() => setTableSort('bytes')}
                                className="px-3.5 py-2.5 cursor-pointer hover:text-cyan-400 transition whitespace-nowrap"
                            >
                                <span className="inline-flex items-center gap-1">
                                    THROUGHPUT
                                    {tableSortField === 'bytes' && (tableSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                            </th>
                            <th className="px-3.5 py-2.5 whitespace-nowrap">SECURITY DETAILS</th>
                            <th className="px-3.5 py-2.5 text-right whitespace-nowrap">ACTION</th>
                        </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                        {sortedEvents.length === 0 ? (
                            <tr>
                                <td colSpan={12} className="px-6 py-16 text-center text-slate-500 font-mono text-sm">
                                    No connection records matching the selected filters.
                                </td>
                            </tr>
                        ) : (
                            <>
                                {paddingTop > 0 && (
                                    <tr>
                                        <td style={{ height: `${paddingTop}px` }} colSpan={12} />
                                    </tr>
                                )}
                                {virtualRows.map((virtualRow) => {
                                    const e = sortedEvents[virtualRow.index];
                                    const eventId = e.id || '';
                                    const isSelected = selectedId === eventId;
                                    const isAnomaly = e.anomaly?.is_anomaly;
                                    const severity = e.anomaly?.severity;
                                    const localSocket = `${e.local?.host || '127.0.0.1'}:${e.local?.port || 0}`;
                                    const remoteSocket = `${e.remote?.ip || '0.0.0.0'}:${e.remote?.port || 0}`;

                                    return (
                                        <tr
                                            key={virtualRow.key}
                                            data-index={virtualRow.index}
                                            ref={rowVirtualizer.measureElement}
                                            onClick={() => setSelectedId(eventId || null)}
                                            className={`cursor-pointer transition-colors ${
                                                isSelected
                                                    ? 'bg-cyan-950/70 border-l-2 border-cyan-400'
                                                    : isAnomaly
                                                    ? 'bg-rose-950/20 hover:bg-rose-950/35'
                                                    : 'hover:bg-slate-800/50'
                                            }`}
                                        >
                                        {/* Status / Severity */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                                            {isAnomaly ? (
                                                <span
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                                                        severity === 'critical'
                                                            ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50 animate-pulse'
                                                            : severity === 'high'
                                                            ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50'
                                                            : 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                                                    }`}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                                    {severity || 'Threat'}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    NORMAL
                                                </span>
                                            )}
                                        </td>

                                        {/* Time */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                                            {formatTime(e.metrics?.last_seen || e.metrics?.first_seen)}
                                        </td>

                                        {/* Process / PID */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-slate-200">
                                                    {e.local?.process_name || 'System / Kernel'}
                                                </span>
                                                {e.local?.pid && (
                                                    <span className="text-[10px] font-mono text-slate-500">
                                                        ({e.local.pid})
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Protocol */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                                            <span
                                                className={`font-mono text-[11px] font-bold uppercase protocol-${e.protocol || 'tcp'}`}
                                            >
                                                {e.protocol || 'TCP'}
                                            </span>
                                        </td>

                                        {/* Local Socket */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                                            {localSocket}
                                        </td>

                                        {/* Remote Endpoint */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-cyan-300 font-medium">
                                                    {remoteSocket}
                                                </span>
                                                {e.remote?.ip && (
                                                    <button
                                                        onClick={(ev) => handleCopyIp(e.remote?.ip || '', ev)}
                                                        className="text-[10px] text-slate-500 hover:text-slate-200 p-0.5 rounded transition"
                                                        title="Copy Remote IP"
                                                    >
                                                        {copiedIp === e.remote.ip ? '✓' : '📋'}
                                                    </button>
                                                )}
                                                {e.remote?.hostname && (
                                                    <span className="text-slate-400 text-[11px] font-sans">
                                                        ({e.remote.hostname})
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Geo / Location */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5 text-slate-300">
                                                <span>🌍</span>
                                                <span>
                                                    {e.geo?.city ? `${e.geo.city}, ` : ''}
                                                    {e.geo?.country || 'Local / Private'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Category */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                                            {e.service?.category ? (
                                                <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px] uppercase font-semibold">
                                                    {e.service.category}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 font-mono text-[10px]">-</span>
                                            )}
                                        </td>

                                        {/* ASN / Org */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-400 text-[11px] max-w-[150px] truncate">
                                            {e.asn?.org ? `${e.asn.org} (${e.asn.number || 'AS'})` : '-'}
                                        </td>

                                        {/* Throughput */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px]">
                                            <div className="flex items-center gap-2">
                                                <span className="text-emerald-400 font-medium">
                                                    ↓ {formatBytes(e.metrics?.bytes_in)}
                                                </span>
                                                <span className="text-cyan-400 font-medium">
                                                    ↑ {formatBytes(e.metrics?.bytes_out)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Anomaly Reason */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap max-w-[220px] truncate">
                                            {isAnomaly && (e.anomaly?.title || e.anomaly?.description) ? (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-rose-300 text-[11px] truncate">
                                                        {e.anomaly.title || e.anomaly.description}
                                                    </span>
                                                    {e.anomaly.tags && e.anomaly.tags.length > 0 && (
                                                        <span className="px-1.5 py-0.2 rounded bg-rose-950 border border-rose-500/40 text-rose-400 font-mono text-[9px] font-semibold">
                                                            #{e.anomaly.tags[0]}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-600 text-[10px]">-</span>
                                            )}
                                        </td>

                                        {/* Action button */}
                                        <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                                            <button
                                                onClick={(ev) => {
                                                    ev.stopPropagation();
                                                    setSelectedId(eventId || null);
                                                }}
                                                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white text-[11px] font-semibold transition shadow-sm"
                                            >
                                                Inspect
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {paddingBottom > 0 && (
                                <tr>
                                    <td style={{ height: `${paddingBottom}px` }} colSpan={12} />
                                </tr>
                            )}
                        </>
                    )}
                </tbody>
                </table>
            </div>
        </div>
    );
}
