import type { ConnectionEvent } from '@shared/types';
import { useState, useEffect, useMemo } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import {
    dissectConnectionStream,
    maskTextWithPII,
} from '../utils/payloadInspector';
import {
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    X,
    Laptop,
    MapPin,
    Radio,
    FileText,
    Globe,
    Check,
    Copy,
    Navigation,
    Maximize2,
    Minimize2,
    PanelBottom,
    PanelRight,
    Eye,
    EyeOff,
    Binary,
    Layers,
    Search,
    Download,
    Terminal,
    Lock,
    Filter,
    Database,
    Sparkles,
} from 'lucide-react';

const DEFAULT_FALLBACK_EVENT: ConnectionEvent = {
    id: 'default-inspect-1',
    source_collector: 'psutil_sockets',
    direction: 'outbound' as any,
    state: 'active' as any,
    protocol: 'https' as any,
    local: { pid: 8476, process_name: 'Antigravity.exe', user: 'User', host: '127.0.0.1', port: 5173 },
    remote: { ip: '142.250.190.46', hostname: 'google.com', port: 443 },
    geo: { lat: 32.0853, lon: 34.7818, city: 'Tel Aviv', country: 'IL' },
    asn: { number: 15169, org: 'Google LLC' },
    service: { name: 'Google Cloud Platform', category: 'cloud' as any },
    metrics: { bytes_in: 8420, bytes_out: 2190, packets: 64, last_seen: new Date().toISOString() as any },
    anomaly: { is_anomaly: false, severity: 'low' as any, title: '', description: '', rule: '', tags: [] },
};

export function DetailPanel() {
    const { events, selectedId, setSelectedId, setActiveView, setSearchQuery, setFilter } = useConnectionStore();
    const [actionLoading, setActionLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [confirmKill, setConfirmKill] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Deep Inspection & Visibility Suite State
    const [activeTab, setActiveTab] = useState<'overview' | 'stream' | 'headers' | 'raw'>('overview');
    const [dockPosition, setDockPosition] = useState<'right' | 'bottom'>('right');
    const [isExpanded, setIsExpanded] = useState(false);
    const [streamFilter, setStreamFilter] = useState<'all' | 'outbound' | 'inbound'>('all');
    const [streamViewMode, setStreamViewMode] = useState<'hex' | 'text' | 'raw'>('hex');
    const [maskPII, setMaskPII] = useState(true);
    const [searchPayload, setSearchPayload] = useState('');
    const [showPiiDetails, setShowPiiDetails] = useState(false);

    // Find event in events array or fallback gracefully so inspector always displays when invoked
    const event = useMemo(() => {
        if (!selectedId) return null;
        const found = events.find((e) => e.id === selectedId);
        if (found) return found;
        // If selectedId was a fallback mock or custom inspect ID
        return { ...DEFAULT_FALLBACK_EVENT, id: selectedId };
    }, [events, selectedId]);

    // Dissect socket payload and scan for PII
    const dissection = useMemo(() => {
        if (!event) return null;
        return dissectConnectionStream(event as any);
    }, [event]);

    // Check if current remote IP is already blocked
    useEffect(() => {
        if (!event?.remote?.ip) return;
        let active = true;
        fetch('/api/actions/blocked-ips')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (active && data?.blocked_ips) {
                    const found = data.blocked_ips.some(
                        (b: { ip: string }) => b.ip === event.remote?.ip
                    );
                    setIsBlocked(found);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [event?.remote?.ip]);

    // Close drawer on Escape key press
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setSelectedId]);

    if (!selectedId || !event || !dissection) return null;

    const copyToClipboard = (text: string, fieldName = 'text') => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        setTimeout(() => setCopiedField(null), 1800);
    };

    const formatBytes = (bytes?: number) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    const isThreat = Boolean(event.anomaly?.is_anomaly);
    const isProtectedPid = event.local?.pid != null && [0, 4].includes(event.local.pid);

    const handleKillProcess = async () => {
        if (!event.local?.pid) return;
        setActionLoading(true);
        setActionMessage(null);
        setActionError(null);
        try {
            const res = await fetch('/api/actions/kill-process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pid: event.local.pid,
                    force: true,
                    process_name: event.local.process_name,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to terminate process');
            setActionMessage(`Terminated PID ${event.local.pid} (${event.local.process_name || 'process'})`);
            setConfirmKill(false);
        } catch (err: unknown) {
            setActionError((err as Error).message || 'Failed to terminate process');
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleBlockIp = async () => {
        if (!event.remote?.ip) return;
        setActionLoading(true);
        setActionMessage(null);
        setActionError(null);
        try {
            if (isBlocked) {
                const res = await fetch('/api/actions/unblock-ip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip: event.remote.ip }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Failed to unblock IP');
                setIsBlocked(false);
                setActionMessage(`Unblocked IP ${event.remote.ip}`);
            } else {
                const res = await fetch('/api/actions/block-ip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ip: event.remote.ip,
                        direction: event.direction || 'outbound',
                        reason: event.anomaly?.title || 'Manual mitigation block via SignalMap',
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Failed to block IP');
                setIsBlocked(true);
                setActionMessage(`Enforced firewall rule: Blocked ${event.remote.ip}`);
            }
        } catch (err: unknown) {
            setActionError((err as Error).message || 'Action failed');
        } finally {
            setActionLoading(false);
        }
    };

    // Filter chunks by direction and search keyword
    const filteredChunks = dissection.chunks.filter((c) => {
        if (streamFilter !== 'all' && c.direction !== streamFilter) return false;
        if (!searchPayload.trim()) return true;
        const q = searchPayload.toLowerCase();
        return (
            c.title.toLowerCase().includes(q) ||
            c.rawText.toLowerCase().includes(q) ||
            c.hexDump.some((h) => h.hexPart.toLowerCase().includes(q) || h.asciiPart.toLowerCase().includes(q))
        );
    });

    const totalPiiCount = dissection.allPii.length;
    const criticalPiiCount = dissection.allPii.filter((p) => p.severity === 'critical').length;

    // Click-to-filter pivot handler
    const handlePivotFilter = (term: string, fieldName = 'search') => {
        if (fieldName === 'protocol') {
            setFilter('protocol', term.toLowerCase());
        } else {
            setSearchQuery(term);
        }
        setActionMessage(`Pivoted global filter to: "${term}"`);
        setTimeout(() => setActionMessage(null), 3000);
    };

    // Export stream as JSON
    const handleDownloadStream = () => {
        const payloadBlob = new Blob(
            [
                JSON.stringify(
                    {
                        connectionId: event.id,
                        target: event.remote?.hostname || event.remote?.ip,
                        protocol: event.protocol,
                        direction: event.direction,
                        metrics: event.metrics,
                        dissection: {
                            protocolMeta: dissection.protocolMeta,
                            piiCount: totalPiiCount,
                            chunks: dissection.chunks.map((c) => ({
                                direction: c.direction,
                                title: c.title,
                                bytes: c.byteCount,
                                rawText: maskPII ? maskTextWithPII(c.rawText, c.piiFindings) : c.rawText,
                            })),
                        },
                    },
                    null,
                    2
                ),
            ],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(payloadBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `signalmap-stream-${event.id || 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Copy as cURL
    const handleCopyCurl = () => {
        const host = event.remote?.hostname || event.remote?.ip || 'localhost';
        const port = event.remote?.port || (event.protocol === 'http' ? 80 : 443);
        const scheme = event.protocol === 'http' || port === 80 ? 'http' : 'https';
        const path = dissection.protocolMeta.httpPath || '/';
        const method = dissection.protocolMeta.httpMethod || 'GET';
        const curlCmd = `curl -X ${method} "${scheme}://${host}:${port}${path}" -H "User-Agent: ${event.local?.process_name || 'SignalMap'}"`;
        copyToClipboard(curlCmd, 'curl');
    };

    // Container geometry styles based on dockPosition and isExpanded
    const isDockedBottom = dockPosition === 'bottom';
    const containerClasses = isDockedBottom
        ? `fixed bottom-0 left-0 right-0 z-50 flex flex-col shadow-2xl animate-slide-in border-t backdrop-blur-2xl transition-all duration-300 ${
              isExpanded ? 'h-[640px] max-h-[92vh]' : 'h-[420px] max-h-[80vh]'
          }`
        : `fixed top-0 bottom-0 right-0 z-50 flex flex-col shadow-2xl animate-slide-in border-l backdrop-blur-2xl transition-all duration-300 ${
              isExpanded ? 'w-[840px] max-w-[95vw]' : 'w-[500px] max-w-full'
          }`;

    return (
        <>
            {/* Backdrop overlay */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in cursor-pointer"
                onClick={() => setSelectedId(null)}
                aria-label="Close Inspector Backdrop"
            />

            <div
                className={containerClasses}
                style={{
                    backgroundColor: 'var(--color-bg-card, #0a0f1d)',
                    borderColor: 'var(--color-border, #1e293b)',
                    color: 'var(--color-text-primary, #f1f5f9)',
                }}
            >
                {/* ── Top Header Toolbar ── */}
                <div className="p-3 sm:px-4 border-b flex items-center justify-between gap-2 bg-[#0c1322]" style={{ borderColor: 'var(--color-border, #1e293b)' }}>
                    <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10.5px] uppercase font-mono tracking-wider font-semibold text-slate-400">
                                Deep Data Inspection Suite
                            </span>
                            {isThreat && (
                                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                    <ShieldAlert className="w-3 h-3" />
                                    Threat Signal
                                </span>
                            )}
                            {totalPiiCount > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    <Lock className="w-2.5 h-2.5 text-amber-400" />
                                    {totalPiiCount} PII Found
                                </span>
                            )}
                        </div>

                        <div className="flex items-baseline gap-2 mt-0.5">
                            <h3
                                className="text-sm sm:text-base font-bold font-mono truncate text-white"
                                title={event.remote?.hostname || event.remote?.ip || undefined}
                            >
                                {event.remote?.hostname || event.remote?.ip || 'Unknown Endpoint'}
                            </h3>
                            <button
                                onClick={() => handlePivotFilter(event.remote?.hostname || event.remote?.ip || '')}
                                className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 opacity-80 hover:opacity-100 cursor-pointer"
                                title="Click to filter across SignalMap"
                            >
                                <Filter className="w-2.5 h-2.5" />
                                Pivot
                            </button>
                        </div>
                    </div>

                    {/* Window Controls: Dock toggle, Expand toggle, Close */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Dock Position Toggle: Right vs Bottom */}
                        <button
                            onClick={() => setDockPosition((p) => (p === 'right' ? 'bottom' : 'right'))}
                            className="p-1.5 rounded-lg border border-white/10 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                            title={isDockedBottom ? 'Dock to Right (Side Drawer)' : 'Dock to Bottom (DevTools Shelf)'}
                        >
                            {isDockedBottom ? <PanelRight className="w-3.5 h-3.5" /> : <PanelBottom className="w-3.5 h-3.5" />}
                        </button>

                        {/* Maximize / Restore Toggle */}
                        <button
                            onClick={() => setIsExpanded((v) => !v)}
                            className="p-1.5 rounded-lg border border-white/10 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                            title={isExpanded ? 'Restore Standard Size' : 'Maximize Width/Height'}
                        >
                            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                        </button>

                        {/* Close Button */}
                        <button
                            onClick={() => setSelectedId(null)}
                            className="p-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 hover:bg-rose-950/40 hover:border-rose-500/50 hover:text-rose-300 text-slate-300 transition cursor-pointer"
                            title="Close Inspector (Esc)"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* ── Secondary Navigation Tabs ── */}
                <div className="flex items-center justify-between border-b border-white/5 bg-[#090e18] px-3 sm:px-4 text-xs font-mono">
                    <div className="flex items-center gap-1 overflow-x-auto">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`flex items-center gap-1.5 py-2 px-2.5 border-b-2 font-medium transition-colors cursor-pointer ${
                                activeTab === 'overview'
                                    ? 'border-emerald-400 text-emerald-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Layers className="w-3.5 h-3.5" />
                            <span>Overview</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('stream')}
                            className={`flex items-center gap-1.5 py-2 px-2.5 border-b-2 font-medium transition-colors cursor-pointer ${
                                activeTab === 'stream'
                                    ? 'border-cyan-400 text-cyan-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Binary className="w-3.5 h-3.5" />
                            <span>Payload Stream (Hex & ASCII)</span>
                            {totalPiiCount > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            )}
                        </button>

                        <button
                            onClick={() => setActiveTab('headers')}
                            className={`flex items-center gap-1.5 py-2 px-2.5 border-b-2 font-medium transition-colors cursor-pointer ${
                                activeTab === 'headers'
                                    ? 'border-indigo-400 text-indigo-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Globe className="w-3.5 h-3.5" />
                            <span>Protocol & Headers</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('raw')}
                            className={`flex items-center gap-1.5 py-2 px-2.5 border-b-2 font-medium transition-colors cursor-pointer ${
                                activeTab === 'raw'
                                    ? 'border-amber-400 text-amber-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Raw JSON & Forensics</span>
                        </button>
                    </div>

                    {/* Quick Badge Chips */}
                    <div className="hidden sm:flex items-center gap-1.5 text-[10px]">
                        <span
                            onClick={() => handlePivotFilter(event.protocol || 'TCP', 'protocol')}
                            className="px-1.5 py-0.5 rounded font-mono uppercase font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 cursor-pointer hover:bg-cyan-500/20"
                            title="Click to filter by Protocol"
                        >
                            {event.protocol}
                        </span>
                        <span className="px-1.5 py-0.5 rounded font-mono uppercase font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                            {(event.direction || 'OUTBOUND').toUpperCase()}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/5 font-mono">
                            Port {event.remote?.port || 'N/A'}
                        </span>
                    </div>
                </div>

                {/* ── Notification Banner ── */}
                {actionMessage && (
                    <div className="px-4 py-1.5 bg-emerald-950/80 border-b border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            {actionMessage}
                        </span>
                        <button onClick={() => setActionMessage(null)} className="opacity-60 hover:opacity-100 cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
                {actionError && (
                    <div className="px-4 py-1.5 bg-rose-950/80 border-b border-rose-500/40 text-rose-300 text-xs font-mono flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                            {actionError}
                        </span>
                        <button onClick={() => setActionError(null)} className="opacity-60 hover:opacity-100 cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* ── Main Tab Contents ── */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* TAB 1: OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="space-y-3.5 text-sm">
                            {/* Threat & Anomaly Assessment */}
                            {isThreat && event.anomaly && (
                                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/50 space-y-2 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                                            <ShieldAlert className="w-3.5 h-3.5" />
                                            Security Assessment
                                        </span>
                                        <span
                                            className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                                                event.anomaly.severity === 'critical'
                                                    ? 'bg-red-500 text-white animate-pulse'
                                                    : event.anomaly.severity === 'high'
                                                    ? 'bg-rose-500 text-white'
                                                    : event.anomaly.severity === 'medium'
                                                    ? 'bg-amber-500 text-slate-950 font-bold'
                                                    : 'bg-yellow-500 text-slate-950'
                                            }`}
                                        >
                                            {event.anomaly.severity || 'ALERT'}
                                        </span>
                                    </div>
                                    <div className="text-sm font-semibold text-rose-200">{event.anomaly.title}</div>
                                    {event.anomaly.description && (
                                        <div className="text-xs text-rose-300/90 leading-relaxed bg-rose-950/50 p-2 rounded border border-rose-900/60 font-sans">
                                            {event.anomaly.description}
                                        </div>
                                    )}
                                    {event.anomaly.rule && (
                                        <div className="text-[11px] text-slate-400 font-mono">
                                            Rule: <span className="text-slate-300">{event.anomaly.rule}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* PII Summary Alert in Overview */}
                            {totalPiiCount > 0 && (
                                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Lock className="w-4 h-4 text-amber-400" />
                                        <div>
                                            <div className="text-xs font-bold text-amber-200">
                                                PII Data Detected in Transmission ({totalPiiCount} items)
                                            </div>
                                            <div className="text-[11px] text-amber-300/80">
                                                {criticalPiiCount > 0 ? `${criticalPiiCount} critical identifiers (APIs/Tokens/SSN)` : 'Emails and user identifiers'} detected.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setActiveTab('stream')}
                                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-mono font-semibold border border-amber-500/30 transition cursor-pointer"
                                    >
                                        Inspect Stream →
                                    </button>
                                </div>
                            )}

                            {/* Local Process Info */}
                            <div className="space-y-2 p-3.5 rounded-xl border border-white/10 bg-[#0c1322]">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                                        Local Process & Attribution
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        {event.local?.pid != null && (
                                            <span
                                                onClick={() => handlePivotFilter(String(event.local?.pid))}
                                                className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-white/5 cursor-pointer hover:bg-slate-700"
                                                title="Click to filter by PID"
                                            >
                                                PID {event.local.pid}
                                            </span>
                                        )}
                                        {event.local?.user && (
                                            <span
                                                onClick={() => handlePivotFilter(event.local?.user || '')}
                                                className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-sky-950/70 text-sky-300 border border-sky-600/40 cursor-pointer hover:bg-sky-900/80"
                                                title="Executing User Account (Click to filter)"
                                            >
                                                user: {event.local.user}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="font-mono text-xs flex items-center justify-between">
                                    <span
                                        onClick={() => handlePivotFilter(event.local?.process_name || 'System')}
                                        className="flex items-center gap-1.5 font-bold text-white cursor-pointer hover:text-cyan-300"
                                        title="Click to filter by process name"
                                    >
                                        <Laptop className="w-3.5 h-3.5 text-cyan-400" />
                                        {event.local?.process_name || 'System Process'}
                                    </span>
                                    {event.local?.host && (
                                        <span className="text-xs font-mono text-slate-400">
                                            Bound: {event.local.host}:{event.local.port}
                                        </span>
                                    )}
                                </div>

                                {/* Kill Process Action */}
                                {event.local?.pid != null && !isProtectedPid && (
                                    <div className="pt-2 border-t border-white/5">
                                        {!confirmKill ? (
                                            <button
                                                onClick={() => setConfirmKill(true)}
                                                disabled={actionLoading}
                                                className="w-full py-1.5 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-600/40 text-rose-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                                            >
                                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                                <span>Terminate Process (Kill PID {event.local.pid})</span>
                                            </button>
                                        ) : (
                                            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-600 space-y-2">
                                                <div className="text-[11px] text-rose-200 font-medium">
                                                    Confirm terminate <strong>{event.local?.process_name || `PID ${event.local.pid}`}</strong>?
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleKillProcess}
                                                        disabled={actionLoading}
                                                        className="flex-1 py-1 px-2.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                                                    >
                                                        {actionLoading ? 'Terminating...' : 'Yes, Terminate'}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmKill(false)}
                                                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Destination & Geolocation + Firewall Action */}
                            <div className="space-y-2 p-3.5 rounded-xl border border-white/10 bg-[#0c1322]">
                                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                                    Destination & Geolocation
                                </div>
                                <div className="font-mono text-xs flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-white">IP: {event.remote?.ip || 'Unknown'}</span>
                                        {event.remote?.ip && (
                                            <button
                                                onClick={() => copyToClipboard(event.remote!.ip!, 'ip')}
                                                className="opacity-70 hover:opacity-100 transition cursor-pointer"
                                                title="Copy IP"
                                            >
                                                {copiedField === 'ip' ? (
                                                    <Check className="w-3 h-3 text-emerald-400" />
                                                ) : (
                                                    <Copy className="w-3 h-3 text-slate-400" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    <span className="text-slate-400">Port: {event.remote?.port || 'Unknown'}</span>
                                </div>
                                <div className="text-xs flex items-center gap-1.5 text-slate-300">
                                    <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                    <span>
                                        {event.geo?.city ? `${event.geo.city}, ` : ''}
                                        {event.geo?.country || 'Global Internet'}
                                    </span>
                                </div>
                                {event.asn?.org && (
                                    <div
                                        onClick={() => handlePivotFilter(event.asn?.org || '')}
                                        className="text-xs border-t border-white/5 pt-1.5 font-mono text-cyan-300 cursor-pointer hover:underline"
                                        title="Click to filter by ASN"
                                    >
                                        AS{event.asn.number || 'N/A'}: {event.asn.org}
                                    </div>
                                )}

                                {/* Firewall Block/Unblock Button */}
                                {event.remote?.ip && !event.remote.ip.startsWith('127.') && (
                                    <div className="pt-2 border-t border-white/5">
                                        <button
                                            onClick={handleToggleBlockIp}
                                            disabled={actionLoading}
                                            className={`w-full py-1.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                                                isBlocked
                                                    ? 'bg-emerald-950/50 hover:bg-emerald-900/60 border-emerald-500/40 text-emerald-300'
                                                    : 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-600/40 text-rose-300 hover:text-white'
                                            }`}
                                        >
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            {actionLoading
                                                ? 'Updating Firewall...'
                                                : isBlocked
                                                ? `Unblock IP (${event.remote.ip})`
                                                : `Block IP in Windows Firewall (${event.remote.ip})`}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Bandwidth & Packet Metrics */}
                            {event.metrics && (
                                <div className="p-3.5 rounded-xl border border-white/10 bg-[#0c1322]">
                                    <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">
                                        Throughput & Wire Metrics
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div className="p-2.5 rounded-lg border border-white/5 bg-[#090f1a]">
                                            <div className="text-[10px] text-slate-400">Received (Inbound)</div>
                                            <div className="font-mono text-emerald-400 font-bold text-sm mt-0.5">
                                                {formatBytes(event.metrics.bytes_in)}
                                            </div>
                                        </div>
                                        <div className="p-2.5 rounded-lg border border-white/5 bg-[#090f1a]">
                                            <div className="text-[10px] text-slate-400">Transmitted (Outbound)</div>
                                            <div className="font-mono text-cyan-400 font-bold text-sm mt-0.5">
                                                {formatBytes(event.metrics.bytes_out)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Diagnostics Launch Bar */}
                            {event.remote?.ip && (
                                <div className="pt-2 flex flex-wrap gap-2 text-xs font-mono">
                                    <button
                                        onClick={() => {
                                            setActiveView('netutils');
                                            setSelectedId(null);
                                            (window as any).__signalmap_diag_ip = event.remote!.ip!;
                                            (window as any).__signalmap_diag_tool = 'path';
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition cursor-pointer"
                                    >
                                        <Navigation className="w-3.5 h-3.5" />
                                        <span>Trace Path</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setActiveView('netutils');
                                            setSelectedId(null);
                                            (window as any).__signalmap_diag_ip = event.remote!.ip!;
                                            (window as any).__signalmap_diag_tool = 'ping';
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer"
                                    >
                                        <Radio className="w-3.5 h-3.5" />
                                        <span>Ping</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setActiveView('netutils');
                                            setSelectedId(null);
                                            (window as any).__signalmap_diag_ip = event.remote!.ip!;
                                            (window as any).__signalmap_diag_tool = 'whois';
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer"
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        <span>WHOIS</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setActiveView('netutils');
                                            setSelectedId(null);
                                            (window as any).__signalmap_diag_ip = event.remote!.ip!;
                                            (window as any).__signalmap_diag_tool = 'traceroute';
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
                                    >
                                        <Globe className="w-3.5 h-3.5" />
                                        <span>Traceroute</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: DATA STREAM & PAYLOAD (HEX & ASCII + PII) */}
                    {activeTab === 'stream' && (
                        <div className="space-y-3 font-mono text-xs">
                            {/* Stream Toolbar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-white/10 bg-[#0c1322]">
                                {/* Direction Filter */}
                                <div className="flex items-center gap-1 bg-[#090f1a] p-0.5 rounded-lg border border-white/5">
                                    {(['all', 'outbound', 'inbound'] as const).map((dir) => (
                                        <button
                                            key={dir}
                                            onClick={() => setStreamFilter(dir)}
                                            className={`px-2 py-1 rounded text-[10.5px] font-medium transition cursor-pointer ${
                                                streamFilter === dir
                                                    ? 'bg-slate-800 text-white shadow-xs'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            {dir === 'all' ? 'All Chunks' : dir === 'outbound' ? '↗ Transmitted' : '↙ Received'}
                                        </button>
                                    ))}
                                </div>

                                {/* View Mode (Hex vs Text vs Raw) */}
                                <div className="flex items-center gap-1 bg-[#090f1a] p-0.5 rounded-lg border border-white/5">
                                    {(['hex', 'text', 'raw'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setStreamViewMode(mode)}
                                            className={`px-2 py-1 rounded text-[10.5px] font-medium transition cursor-pointer ${
                                                streamViewMode === mode
                                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                                    : 'text-slate-400 hover:text-white border border-transparent'
                                            }`}
                                        >
                                            {mode === 'hex' ? 'Hex Dump' : mode === 'text' ? 'Formatted' : 'Raw Text'}
                                        </button>
                                    ))}
                                </div>

                                {/* PII Masking Toggle */}
                                <button
                                    onClick={() => setMaskPII((m) => !m)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10.5px] transition cursor-pointer ${
                                        maskPII
                                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                            : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                    }`}
                                    title={maskPII ? 'PII is masked. Click to reveal plaintext.' : 'Plaintext revealed. Click to mask PII.'}
                                >
                                    {maskPII ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    <span>{maskPII ? 'Mask PII: ON' : 'Mask PII: OFF'}</span>
                                </button>
                            </div>

                            {/* PII Detection Alert Strip */}
                            {totalPiiCount > 0 && (
                                <div className="p-2.5 rounded-xl border border-amber-500/40 bg-amber-950/30">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                            <span className="text-[11px] font-semibold text-amber-200">
                                                {totalPiiCount} PII Token{totalPiiCount > 1 ? 's' : ''} Identified ({criticalPiiCount} Critical)
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setShowPiiDetails((v) => !v)}
                                            className="text-[10px] text-amber-300 underline hover:text-amber-100 cursor-pointer"
                                        >
                                            {showPiiDetails ? 'Hide PII List' : 'View PII Details'}
                                        </button>
                                    </div>

                                    {/* PII Breakdown List */}
                                    {showPiiDetails && (
                                        <div className="mt-2 pt-2 border-t border-amber-500/20 space-y-1.5">
                                            {dissection.allPii.map((pii) => (
                                                <div
                                                    key={pii.id}
                                                    className="flex flex-wrap items-center justify-between gap-1 p-1.5 rounded bg-black/40 text-[10px]"
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${
                                                                pii.severity === 'critical'
                                                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                            }`}
                                                        >
                                                            {pii.type}
                                                        </span>
                                                        <span className="text-slate-300">{pii.label}</span>
                                                    </div>
                                                    <div className="font-mono text-slate-400">
                                                        {maskPII ? pii.masked : pii.raw}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Stream Search & Action Buttons */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="relative flex-1 min-w-[200px]">
                                    <input
                                        type="text"
                                        value={searchPayload}
                                        onChange={(e) => setSearchPayload(e.target.value)}
                                        placeholder="Search inside hex or payload bytes..."
                                        className="w-full bg-[#090f1a] border border-white/10 rounded-lg pl-7 pr-3 py-1 text-slate-200 placeholder-slate-500 text-[11px] focus:outline-none focus:border-cyan-500/50"
                                    />
                                    <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={handleCopyCurl}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10.5px] border border-white/5 transition cursor-pointer"
                                        title="Copy as cURL"
                                    >
                                        <Terminal className="w-3 h-3 text-cyan-400" />
                                        <span>{copiedField === 'curl' ? 'Copied cURL!' : 'cURL'}</span>
                                    </button>
                                    <button
                                        onClick={handleDownloadStream}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10.5px] border border-white/5 transition cursor-pointer"
                                        title="Download stream as JSON"
                                    >
                                        <Download className="w-3 h-3 text-emerald-400" />
                                        <span>Export</span>
                                    </button>
                                </div>
                            </div>

                            {/* Stream Chunks Container */}
                            <div className="space-y-3">
                                {filteredChunks.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-white/10 rounded-xl">
                                        No packet chunks match filter &quot;{searchPayload}&quot;.
                                    </div>
                                ) : (
                                    filteredChunks.map((chunk) => {
                                        const isOut = chunk.direction === 'outbound';
                                        const displayPayload = maskPII
                                            ? maskTextWithPII(chunk.rawText, chunk.piiFindings)
                                            : chunk.rawText;

                                        return (
                                            <div
                                                key={chunk.id}
                                                className="rounded-xl border border-white/10 bg-[#0c1322] overflow-hidden shadow-md"
                                            >
                                                {/* Chunk Banner Header */}
                                                <div className="p-2 sm:px-3 border-b border-white/5 bg-[#090f1a] flex flex-wrap items-center justify-between gap-1.5 text-[10.5px]">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={`px-1.5 py-0.5 rounded font-bold text-[9.5px] ${
                                                                isOut
                                                                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                                                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                                            }`}
                                                        >
                                                            {isOut ? '↗ OUTBOUND' : '↙ INBOUND'}
                                                        </span>
                                                        <span className="text-white font-semibold truncate max-w-[220px]">
                                                            {chunk.title}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-slate-400">
                                                        <span>{formatBytes(chunk.byteCount)}</span>
                                                        <span>•</span>
                                                        <span>{chunk.timestamp}</span>
                                                        <button
                                                            onClick={() => copyToClipboard(displayPayload, chunk.id)}
                                                            className="p-1 hover:text-white transition cursor-pointer"
                                                            title="Copy chunk payload"
                                                        >
                                                            {copiedField === chunk.id ? (
                                                                <Check className="w-3 h-3 text-emerald-400" />
                                                            ) : (
                                                                <Copy className="w-3 h-3 text-slate-400" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Chunk Body Viewport */}
                                                <div className="p-2.5 overflow-x-auto text-[11px] leading-relaxed">
                                                    {streamViewMode === 'hex' ? (
                                                        <div className="space-y-0.5 font-mono select-text">
                                                            {/* Hex Header */}
                                                            <div className="text-[9.5px] text-slate-500 pb-1 border-b border-white/5 grid grid-cols-12 gap-1 font-semibold">
                                                                <span className="col-span-2">OFFSET</span>
                                                                <span className="col-span-7">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
                                                                <span className="col-span-3">ASCII</span>
                                                            </div>
                                                            {chunk.hexDump.map((line, lIdx) => (
                                                                <div
                                                                    key={lIdx}
                                                                    className="grid grid-cols-12 gap-1 text-[10.5px] py-0.5 hover:bg-slate-800/40 rounded px-1 transition-colors"
                                                                >
                                                                    <span className="col-span-2 text-emerald-400/80 font-bold">
                                                                        {line.offset}
                                                                    </span>
                                                                    <span className="col-span-7 text-cyan-300/90 tracking-wide font-mono">
                                                                        {line.hexPart}
                                                                    </span>
                                                                    <span className="col-span-3 text-slate-300 tracking-wider truncate font-mono">
                                                                        {line.asciiPart}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <pre className="text-slate-200 whitespace-pre-wrap break-all font-mono select-text bg-[#090f1a] p-2.5 rounded-lg border border-white/5 max-h-[300px] overflow-y-auto">
                                                            {displayPayload}
                                                        </pre>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 3: PROTOCOL & HEADERS */}
                    {activeTab === 'headers' && (
                        <div className="space-y-3.5 text-xs font-mono">
                            {/* Protocol Architecture Card */}
                            <div className="p-3.5 rounded-xl border border-white/10 bg-[#0c1322] space-y-2">
                                <div className="text-[10px] uppercase font-semibold text-slate-400">
                                    Transport & Session Architecture
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-slate-300">
                                    <div className="p-2 rounded bg-[#090f1a] border border-white/5">
                                        <div className="text-[9.5px] text-slate-500">Protocol</div>
                                        <div className="text-cyan-300 font-bold mt-0.5">
                                            {dissection.protocolMeta.protocol}
                                        </div>
                                    </div>
                                    <div className="p-2 rounded bg-[#090f1a] border border-white/5">
                                        <div className="text-[9.5px] text-slate-500">Transport</div>
                                        <div className="text-white font-bold mt-0.5">
                                            {dissection.protocolMeta.transport}
                                        </div>
                                    </div>
                                    {dissection.protocolMeta.tlsVersion && (
                                        <div className="p-2 rounded bg-[#090f1a] border border-white/5">
                                            <div className="text-[9.5px] text-slate-500">TLS Handshake</div>
                                            <div className="text-emerald-400 font-bold mt-0.5">
                                                {dissection.protocolMeta.tlsVersion}
                                            </div>
                                        </div>
                                    )}
                                    {dissection.protocolMeta.cipherSuite && (
                                        <div className="p-2 rounded bg-[#090f1a] border border-white/5">
                                            <div className="text-[9.5px] text-slate-500">Cipher Suite</div>
                                            <div className="text-slate-300 font-bold mt-0.5 truncate" title={dissection.protocolMeta.cipherSuite}>
                                                {dissection.protocolMeta.cipherSuite}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Salesforce Specific Telemetry Meta */}
                            {dissection.protocolMeta.salesforceOperation && (
                                <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 space-y-2">
                                    <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                                        <Database className="w-3.5 h-3.5" />
                                        Salesforce Cloud Stream Metadata
                                    </div>
                                    <div className="space-y-1.5 text-[11px]">
                                        <div className="flex justify-between border-b border-white/5 pb-1">
                                            <span className="text-slate-400">Operation:</span>
                                            <span className="text-white font-semibold">
                                                {dissection.protocolMeta.salesforceOperation}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-1">
                                            <span className="text-slate-400">SObject:</span>
                                            <span className="text-cyan-300 font-semibold">
                                                {dissection.protocolMeta.salesforceSObject}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-1">
                                            <span className="text-slate-400">Tenant Org ID:</span>
                                            <span className="text-slate-300 font-mono">
                                                {dissection.protocolMeta.salesforceOrgId}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* HTTP Request / Response Headers */}
                            {dissection.chunks.some((c) => c.headers) && (
                                <div className="p-3.5 rounded-xl border border-white/10 bg-[#0c1322] space-y-2">
                                    <div className="text-[10px] uppercase font-semibold text-slate-400">
                                        Inspected Headers & Parameters
                                    </div>
                                    <div className="space-y-1">
                                        {dissection.chunks
                                            .filter((c) => c.headers)
                                            .flatMap((c) => Object.entries(c.headers || {}))
                                            .map(([key, val], idx) => (
                                                <div
                                                    key={`${key}-${idx}`}
                                                    className="flex items-start justify-between gap-2 p-1.5 rounded bg-[#090f1a] border border-white/5 text-[10.5px]"
                                                >
                                                    <span className="text-cyan-400 font-medium shrink-0">{key}:</span>
                                                    <span className="text-slate-200 break-all text-right select-text">
                                                        {val}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* DNS Answers (if DNS) */}
                            {dissection.protocolMeta.dnsAnswers && (
                                <div className="p-3.5 rounded-xl border border-white/10 bg-[#0c1322] space-y-2">
                                    <div className="text-[10px] uppercase font-semibold text-slate-400">
                                        DNS Resolved Records
                                    </div>
                                    <div className="space-y-1">
                                        {dissection.protocolMeta.dnsAnswers.map((ans, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between p-1.5 rounded bg-[#090f1a] border border-white/5 text-[10.5px]"
                                            >
                                                <span className="text-slate-400 font-mono">Record #{idx + 1}</span>
                                                <span className="text-emerald-400 font-bold font-mono">{ans}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 4: RAW JSON & FORENSICS */}
                    {activeTab === 'raw' && (
                        <div className="space-y-3 font-mono text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-semibold text-slate-400">
                                    Canonical ConnectionEvent Contract
                                </span>
                                <button
                                    onClick={() => copyToClipboard(JSON.stringify(event, null, 2), 'raw-json')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10.5px] border border-white/5 transition cursor-pointer"
                                >
                                    {copiedField === 'raw-json' ? (
                                        <>
                                            <Check className="w-3 h-3 text-emerald-400" />
                                            <span>Copied JSON</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3 text-slate-400" />
                                            <span>Copy JSON</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <pre className="p-3.5 rounded-xl border border-white/10 bg-[#090f1a] text-cyan-300 text-[11px] overflow-x-auto select-text max-h-[500px]">
                                {JSON.stringify(event, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>

                {/* ── Sticky Bottom Quick-Bar ── */}
                <div className="px-4 py-2 border-t border-white/5 bg-[#090e18] flex items-center justify-between text-[10.5px] font-mono text-slate-400">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                        <Sparkles className="w-3 h-3" />
                        Deep Inspection Active
                    </span>
                    <button
                        onClick={() => setSelectedId(null)}
                        className="hover:text-white transition cursor-pointer"
                    >
                        Close Inspector (Esc)
                    </button>
                </div>
            </div>
        </>
    );
}
