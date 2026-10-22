import { useState, useEffect } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
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
} from 'lucide-react';

export function DetailPanel() {
    const { events, selectedId, setSelectedId, setActiveView } = useConnectionStore();
    const [actionLoading, setActionLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [confirmKill, setConfirmKill] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [copiedIp, setCopiedIp] = useState(false);

    const event = events.find((e) => e.id === selectedId);

    // Check if current remote IP is already blocked
    useEffect(() => {
        if (!event?.remote?.ip) {
            return;
        }
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

    if (!selectedId || !event) return null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedIp(true);
        setTimeout(() => setCopiedIp(false), 1500);
    };

    const formatBytes = (bytes?: number) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    const isThreat = event.anomaly?.is_anomaly;
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

    return (
        <div
            className="fixed top-0 bottom-0 right-0 z-40 w-96 flex flex-col shadow-2xl animate-slide-in border-l backdrop-blur-xl"
            style={{
                backgroundColor: 'var(--color-bg-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
            }}
        >
            {/* Header */}
            <div className="p-4 border-b flex items-start justify-between" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex-1 pr-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                            Socket Forensics
                        </span>
                        {isThreat && (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                <ShieldAlert className="w-3 h-3" />
                                Threat
                            </span>
                        )}
                    </div>
                    <h3 className="text-base font-bold font-mono truncate mt-0.5" title={event.remote?.hostname || event.remote?.ip || undefined}>
                        {event.remote?.hostname || event.remote?.ip || 'Unknown Endpoint'}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs">
                        <span className="px-2 py-0.5 rounded font-mono uppercase font-bold text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                            {event.protocol}
                        </span>
                        <span className="px-2 py-0.5 rounded font-mono uppercase font-semibold text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30">
                            {(event.direction || 'OUTBOUND').toUpperCase()}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                            Port {event.remote?.port || 'N/A'}
                        </span>
                        {isBlocked && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950 border border-rose-500/60 text-rose-300 text-[10px] font-mono font-bold">
                                <ShieldAlert className="w-3 h-3" />
                                BLOCKED
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setSelectedId(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg opacity-60 hover:opacity-100 transition"
                    style={{ backgroundColor: 'var(--color-bg-secondary)' }}
                    title="Close Forensics Drawer"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Notification Banner */}
            {actionMessage && (
                <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        {actionMessage}
                    </span>
                    <button onClick={() => setActionMessage(null)} className="opacity-60 hover:opacity-100">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
            {actionError && (
                <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-500/40 text-rose-300 text-xs font-mono flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        {actionError}
                    </span>
                    <button onClick={() => setActionError(null)} className="opacity-60 hover:opacity-100">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Body */}
            <div className="p-4 space-y-3.5 text-sm overflow-y-auto flex-1">
                {/* Threat & Anomaly Assessment Card */}
                {isThreat && event.anomaly && (
                    <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/50 space-y-2 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                Security Assessment
                            </span>
                            <span className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                                event.anomaly.severity === 'critical' ? 'bg-red-500 text-white animate-pulse' :
                                event.anomaly.severity === 'high' ? 'bg-rose-500 text-white' :
                                event.anomaly.severity === 'medium' ? 'bg-amber-500 text-slate-950 font-bold' :
                                'bg-yellow-500 text-slate-950'
                            }`}>
                                {event.anomaly.severity || 'ALERT'}
                            </span>
                        </div>
                        <div className="text-sm font-semibold text-rose-200">
                            {event.anomaly.title}
                        </div>
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
                        {event.anomaly.tags && event.anomaly.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {event.anomaly.tags.map((tag) => (
                                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/40 text-rose-300 border border-rose-800/40 font-mono">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Local Process Info & Remediation */}
                <div className="space-y-2 p-3 rounded-lg border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                            Local Process
                        </span>
                        {event.local?.pid != null && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                                PID {event.local.pid}
                            </span>
                        )}
                    </div>
                    <div className="font-mono text-xs flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-bold" style={{ color: 'var(--color-text-primary)' }}>
                            <Laptop className="w-3.5 h-3.5 text-cyan-400" />
                            {event.local?.process_name || 'System Process'}
                        </span>
                    </div>
                    {event.local?.host && (
                        <div className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                            Bound: {event.local.host}:{event.local.port}
                        </div>
                    )}

                    {/* Kill Process Action */}
                    {event.local?.pid != null && !isProtectedPid && (
                        <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border-hairline)' }}>
                            {!confirmKill ? (
                                <button
                                    onClick={() => setConfirmKill(true)}
                                    disabled={actionLoading}
                                    className="w-full py-1.5 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-600/40 text-rose-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                                >
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                    <span>Terminate Process (Kill PID)</span>
                                </button>
                            ) : (
                                <div className="p-2 rounded bg-rose-950/80 border border-rose-600 space-y-1.5">
                                    <div className="text-[11px] text-rose-200 font-medium">
                                        Confirm kill <strong>{event.local?.process_name || `PID ${event.local.pid}`}</strong>?
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleKillProcess}
                                            disabled={actionLoading}
                                            className="flex-1 py-1 px-2 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition flex items-center justify-center gap-1"
                                        >
                                            {actionLoading ? 'Killing...' : 'Yes, Terminate'}
                                        </button>
                                        <button
                                            onClick={() => setConfirmKill(false)}
                                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Service Classification */}
                <div className="space-y-1 p-3 rounded-lg border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                        Service Classification
                    </div>
                    <div className="flex items-center justify-between mt-1">
                        <span className="font-semibold text-xs" style={{ color: 'var(--color-text-primary)' }}>
                            {event.service?.name || 'Unclassified Service'}
                        </span>
                        {event.service?.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded uppercase font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                {event.service.category}
                            </span>
                        )}
                    </div>
                </div>

                {/* Destination & Location + Firewall Action */}
                <div className="space-y-2 p-3 rounded-lg border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                        Destination & Geolocation
                    </div>
                    <div className="font-mono text-xs flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <span style={{ color: 'var(--color-text-primary)' }}>IP: {event.remote?.ip || 'Unknown'}</span>
                            {event.remote?.ip && (
                                <button
                                    onClick={() => copyToClipboard(event.remote!.ip!)}
                                    className="opacity-60 hover:opacity-100 transition-opacity"
                                    title="Copy IP"
                                >
                                    {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                                </button>
                            )}
                        </div>
                        <span style={{ color: 'var(--color-text-muted)' }}>Port: {event.remote?.port || 'Unknown'}</span>
                    </div>
                    <div className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{event.geo?.city ? `${event.geo.city}, ` : ''}{event.geo?.country || 'Global Internet'}</span>
                    </div>
                    {event.geo?.lat != null && (
                        <div className="text-[11px] font-mono pl-5" style={{ color: 'var(--color-text-muted)' }}>
                            {event.geo.lat.toFixed(2)}°, {event.geo.lon?.toFixed(2)}°
                        </div>
                    )}
                    {event.asn?.org && (
                        <div className="text-xs border-t pt-1.5 font-mono" style={{ borderColor: 'var(--color-border-hairline)', color: 'var(--color-accent-text)' }}>
                            AS{event.asn.number || 'N/A'}: {event.asn.org}
                        </div>
                    )}

                    {/* Firewall Block/Unblock Button */}
                    {event.remote?.ip && !event.remote.ip.startsWith('127.') && (
                        <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border-hairline)' }}>
                            <button
                                onClick={handleToggleBlockIp}
                                disabled={actionLoading}
                                className={`w-full py-1.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                                    isBlocked
                                        ? 'bg-emerald-950/50 hover:bg-emerald-900/60 border-emerald-500/40 text-emerald-300 hover:text-white'
                                        : 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-600/40 text-rose-300 hover:text-white'
                                }`}
                            >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {actionLoading
                                    ? 'Updating Firewall...'
                                    : isBlocked
                                    ? `Unblock IP (${event.remote.ip})`
                                    : `Block IP in Firewall (${event.remote.ip})`}
                            </button>
                        </div>
                    )}
                </div>

                {/* Bandwidth & Packet Metrics */}
                {event.metrics && (
                    <div className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                        <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                            Throughput & Metrics
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="p-2 rounded border" style={{ backgroundColor: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-hairline)' }}>
                                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Received (In)</div>
                                <div className="font-mono text-emerald-400 font-bold text-sm">
                                    {formatBytes(event.metrics.bytes_in)}
                                </div>
                            </div>
                            <div className="p-2 rounded border" style={{ backgroundColor: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-hairline)' }}>
                                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Transmitted (Out)</div>
                                <div className="font-mono text-cyan-400 font-bold text-sm">
                                    {formatBytes(event.metrics.bytes_out)}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                            <span>Packets: <strong className="font-mono" style={{ color: 'var(--color-text-primary)' }}>{event.metrics.packets}</strong></span>
                            {event.metrics.last_seen && (
                                <span className="font-mono">
                                    {new Date(event.metrics.last_seen).toLocaleTimeString()}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* HTTP Request metadata (if available) */}
                {event.http && (
                    <div className="space-y-1 p-3 rounded-lg border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                        <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                            HTTP Request Metadata
                        </div>
                        <div className="font-mono text-xs p-2 rounded border break-all mt-1" style={{ backgroundColor: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-hairline)' }}>
                            <span className={event.http.status_code && event.http.status_code >= 400 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {event.http.method} {event.http.status_code}
                            </span>
                            {' '}{event.http.url_path}
                        </div>
                    </div>
                )}
            </div>

            {/* Quick-Actions Footer */}
            {event.remote?.ip && (
                <div className="px-4 py-3 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                    <span className="text-[10px] font-mono uppercase font-semibold w-full tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                        Launch Diagnostics
                    </span>
                    <button
                        onClick={() => {
                            setActiveView('netutils');
                            setSelectedId(null);
                            window.__signalmap_diag_ip = event.remote!.ip!;
                            window.__signalmap_diag_tool = 'path';
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition hover:opacity-90"
                        style={{
                            backgroundColor: 'rgba(168, 85, 247, 0.15)',
                            borderColor: 'rgba(168, 85, 247, 0.4)',
                            color: '#c084fc',
                        }}
                    >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Trace Path</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveView('netutils');
                            setSelectedId(null);
                            window.__signalmap_diag_ip = event.remote!.ip!;
                            window.__signalmap_diag_tool = 'ping';
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition hover:opacity-90"
                        style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            borderColor: 'rgba(16, 185, 129, 0.4)',
                            color: '#34d399',
                        }}
                    >
                        <Radio className="w-3.5 h-3.5" />
                        <span>Ping</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveView('netutils');
                            setSelectedId(null);
                            window.__signalmap_diag_ip = event.remote!.ip!;
                            window.__signalmap_diag_tool = 'whois';
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition hover:opacity-90"
                        style={{
                            backgroundColor: 'rgba(6, 182, 212, 0.15)',
                            borderColor: 'rgba(6, 182, 212, 0.4)',
                            color: '#22d3ee',
                        }}
                    >
                        <FileText className="w-3.5 h-3.5" />
                        <span>WHOIS</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveView('netutils');
                            setSelectedId(null);
                            window.__signalmap_diag_ip = event.remote!.ip!;
                            window.__signalmap_diag_tool = 'traceroute';
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition hover:opacity-90"
                        style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.15)',
                            borderColor: 'rgba(245, 158, 11, 0.4)',
                            color: '#fbbf24',
                        }}
                    >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Traceroute</span>
                    </button>
                </div>
            )}
        </div>
    );
}
