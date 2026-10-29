import { useState, useRef, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { ConnectionPathView } from './ConnectionPathView';
import {
    Activity,
    Globe,
    Search,
    Shield,
    Server,
    Radio,
    Terminal,
    Play,
    Copy,
    Check,
    Wifi,
    Cpu,
} from 'lucide-react';

// Extend window for cross-component communication from DetailPanel
declare global {
    interface Window {
        __signalmap_diag_ip?: string;
        __signalmap_diag_tool?: string;
    }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Tool = 'ping' | 'traceroute' | 'nslookup' | 'dig' | 'whois' | 'path' | 'ifconfig' | 'netstat' | 'firewall';

interface BlockedIpItem {
    ip: string;
    direction: string;
    reason: string;
    firewall_rule: string;
    firewall_active: boolean;
    blocked_at: number;
}

interface PingResult {
    target: string;
    success: boolean;
    output: string;
    stats: { min_ms?: number; max_ms?: number; avg_ms?: number; sent?: number; received?: number; lost?: number };
    echoes: { ip: string | null; time_ms: number | null; timeout?: boolean }[];
}

interface Hop {
    hop: number;
    ip: string | null;
    hostname?: string | null;
    times_ms: number[];
    avg_ms: number | null;
    timeout?: boolean;
    geo?: {
        country?: string;
        city?: string;
        org?: string;
        lat?: number;
        lon?: number;
        asn?: string;
        is_pop?: boolean;
    };
}

interface TracerouteResult {
    target: string;
    success: boolean;
    output: string;
    hops: Hop[];
}

interface NslookupResult {
    target: string;
    forward: string[];
    reverse: string | null;
    mx: string[];
    txt: string[];
    error?: string;
}

interface DigRecord {
    name: string;
    type: string;
    ttl: number;
    data: string;
}

interface DigResult {
    success: boolean;
    target: string;
    record_type: string;
    status: string;
    query_time_ms: number;
    server: string;
    answers: DigRecord[];
    authorities: DigRecord[];
    raw: string;
}

interface WhoisResult {
    target: string;
    ip: string;
    asn?: string;
    asn_org?: string;
    network_name?: string;
    cidr?: string;
    country?: string;
    city?: string;
    abuse_contact?: string;
    raw: string;
}

interface PathHop {
    ip: string;
    hostname: string;
    geo?: {
        city?: string;
        country?: string;
        org?: string;
        asn?: string;
        lat?: number;
        lon?: number;
    };
    rtt_ms?: number;
    is_pop?: boolean;
    pop_name?: string;
    layer?: string;
}

interface PathResult {
    source: string;
    destination: string;
    hops: PathHop[];
    total_hops: number;
    estimated_latency_ms: number;
    asn_path: string[];
}

interface NetworkInterface {
    name: string;
    display_name: string;
    ip_addresses: string[];
    mac: string;
    speed_mbps: number;
    status: string;
    bytes_sent: number;
    bytes_recv: number;
    packets_sent: number;
    packets_recv: number;
    mtu: number;
}

interface IfconfigResult {
    interfaces: NetworkInterface[];
    raw: string;
}

interface NetstatConnection {
    proto: string;
    local_address: string;
    local_port: number;
    remote_address: string;
    remote_port: number;
    state: string;
    pid: number;
    process_name: string;
}

interface NetstatResult {
    summary: {
        total: number;
        tcp: number;
        udp: number;
        listening: number;
        established: number;
        close_wait: number;
    };
    connections: NetstatConnection[];
    raw: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function latencyColor(ms: number | null | undefined): string {
    if (ms == null) return 'text-slate-500';
    if (ms < 25) return 'text-emerald-400';
    if (ms < 80) return 'text-amber-400';
    if (ms < 180) return 'text-orange-400';
    return 'text-rose-400';
}

function LatencyBar({ ms, max = 250 }: { ms: number | null | undefined; max?: number }) {
    const pct = ms != null ? Math.min(100, (ms / max) * 100) : 0;
    const color = ms != null
        ? ms < 25 ? '#10b981' : ms < 80 ? '#f59e0b' : ms < 180 ? '#f97316' : '#ef4444'
        : '#475569';
    return (
        <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NetworkUtils() {
    const { events, setDiagnosticOverlay, setActiveView, layoutTheme } = useConnectionStore();
    const [activeTool, setActiveTool] = useState<Tool>('traceroute');
    const [target, setTarget] = useState('8.8.8.8');
    const [loading, setLoading] = useState(false);
    const [maxHops, setMaxHops] = useState(30);
    const [timeoutSec, setTimeoutSec] = useState(2);
    const [copiedRaw, setCopiedRaw] = useState(false);
    const [result, setResult] = useState<PingResult | TracerouteResult | NslookupResult | DigResult | WhoisResult | PathResult | IfconfigResult | NetstatResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [blockedList, setBlockedList] = useState<BlockedIpItem[]>([]);
    const [netstatState, setNetstatState] = useState<'all' | 'listening' | 'established'>('all');
    const [netstatProto, setNetstatProto] = useState<'all' | 'tcp' | 'udp'>('all');
    const [digType, setDigType] = useState('A');
    const abortRef = useRef<AbortController | null>(null);

    // Quick-fill list from live events
    const remoteIPs = [...new Set(events.map(e => e.remote?.ip).filter((ip): ip is string => typeof ip === 'string' && ip.length > 0 && !ip.startsWith('127.') && !ip.startsWith('192.168.')))].slice(0, 10);

    const loadBlockedIps = useCallback(async () => {
        try {
            const res = await fetch('/api/actions/blocked-ips');
            if (res.ok) {
                const data = await res.json();
                setBlockedList(data.blocked_ips || []);
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        if (activeTool === 'firewall') {
            loadBlockedIps();
        }
    }, [activeTool, loadBlockedIps]);

    const handleUnblock = async (ipToUnblock: string) => {
        try {
            setLoading(true);
            await fetch('/api/actions/unblock-ip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: ipToUnblock }),
            });
            await loadBlockedIps();
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    };

    // Pre-fill from DetailPanel quick-action
    useEffect(() => {
        const ip = window.__signalmap_diag_ip;
        const tool = window.__signalmap_diag_tool as Tool | undefined;
        if (ip) {
            setTarget(ip);
            if (tool) setActiveTool(tool);
            window.__signalmap_diag_ip = undefined;
            window.__signalmap_diag_tool = undefined;
        }
    }, []);

    const targetRequired = activeTool !== 'ifconfig' && activeTool !== 'netstat' && activeTool !== 'firewall';

    const run = useCallback(async () => {
        if (targetRequired && !target.trim()) {
            setError('Please enter a target host or IP address');
            return;
        }

        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            let url = '';
            const t = encodeURIComponent(target.trim());

            switch (activeTool) {
                case 'ping':
                    url = `/api/netutils/ping?target=${t}&count=4`;
                    break;
                case 'traceroute':
                    url = `/api/netutils/traceroute?target=${t}&max_hops=${maxHops}`;
                    break;
                case 'nslookup':
                    url = `/api/netutils/nslookup?target=${t}`;
                    break;
                case 'dig':
                    url = `/api/netutils/dig?target=${t}&type=${digType}`;
                    break;
                case 'whois':
                    url = `/api/netutils/whois?target=${t}`;
                    break;
                case 'path':
                    url = `/api/netutils/path?target=${t}`;
                    break;
                case 'ifconfig':
                    url = '/api/netutils/ifconfig';
                    break;
                case 'netstat':
                    url = `/api/netutils/netstat?state=${encodeURIComponent(netstatState)}&proto=${encodeURIComponent(netstatProto)}&limit=350`;
                    break;
                case 'firewall':
                    if (target.trim()) {
                        const blockResp = await fetch('/api/actions/block-ip', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                ip: target.trim(),
                                direction: 'inbound',
                                reason: 'Manual Block via SignalMap Diagnostics Console',
                            }),
                        });
                        const blockData = await blockResp.json();
                        setResult(blockData as any);
                        await loadBlockedIps();
                    } else {
                        await loadBlockedIps();
                    }
                    return;
            }

            const resp = await fetch(url, { signal: abortRef.current.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            setResult(data);
        } catch (e: unknown) {
            if ((e as Error).name !== 'AbortError') {
                setError((e as Error).message || 'Request failed');
            }
        } finally {
            setLoading(false);
        }
    }, [target, activeTool, targetRequired, maxHops, digType, netstatState, netstatProto, loadBlockedIps]);

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') run();
    };

    const tools: { id: Tool; label: string; icon: typeof Activity; desc: string }[] = [
        { id: 'traceroute', label: 'Traceroute', icon: Radio, desc: 'Hop-by-hop route with geo mapping' },
        { id: 'ping', label: 'Ping', icon: Activity, desc: 'ICMP echo test with latency stats' },
        { id: 'nslookup', label: 'NSLookup', icon: Search, desc: 'DNS A, MX, TXT records' },
        { id: 'dig', label: 'DiG (DoH)', icon: Terminal, desc: 'Deep DNS query with RFC authority & TTL' },
        { id: 'whois', label: 'WHOIS', icon: Server, desc: 'Registration info via RDAP/IPInfo' },
        { id: 'netstat', label: 'Netstat', icon: Wifi, desc: 'Active listening ports & socket states' },
        { id: 'ifconfig', label: 'Interfaces', icon: Cpu, desc: 'Local adapters, MAC, MTU & I/O' },
        { id: 'firewall', label: 'Firewall', icon: Shield, desc: 'Blocked IPs & Windows Firewall rules' },
        { id: 'path', label: 'Path View', icon: Globe, desc: 'Visual end-to-end path with PoPs' },
    ];

    // Compute summary stats for the right panel
    let kpiHopsCount = 0;
    let kpiAvgLatency = 0;
    let kpiLoss = '0%';
    let rawOutputText = '';

    if (result && activeTool === 'traceroute') {
        const r = result as TracerouteResult;
        kpiHopsCount = r.hops.length;
        const validMs = r.hops.map(h => h.avg_ms).filter((ms): ms is number => ms != null);
        kpiAvgLatency = validMs.length ? Math.round(validMs.reduce((a, b) => a + b, 0) / validMs.length) : 0;
        const timeouts = r.hops.filter(h => h.timeout).length;
        kpiLoss = r.hops.length ? `${Math.round((timeouts / r.hops.length) * 100)}%` : '0%';
        rawOutputText = r.output || '';
    } else if (result && activeTool === 'ping') {
        const r = result as PingResult;
        kpiHopsCount = r.echoes.length;
        kpiAvgLatency = r.stats.avg_ms ? Math.round(r.stats.avg_ms) : 0;
        kpiLoss = r.stats.lost && r.stats.sent ? `${Math.round((r.stats.lost / r.stats.sent) * 100)}%` : '0%';
        rawOutputText = r.output || '';
    } else if (result && activeTool === 'netstat') {
        const r = result as NetstatResult;
        kpiHopsCount = r.connections.length;
        kpiAvgLatency = r.summary.listening;
        kpiLoss = '0%';
        rawOutputText = r.raw || '';
    } else if (result && (result as any).raw) {
        rawOutputText = (result as any).raw;
    } else if (result && (result as any).output) {
        rawOutputText = (result as any).output;
    }

    const copyRaw = () => {
        if (!rawOutputText) return;
        navigator.clipboard.writeText(rawOutputText);
        setCopiedRaw(true);
        setTimeout(() => setCopiedRaw(false), 1500);
    };

    return (
        <div className="w-full h-full flex flex-col overflow-hidden p-4 gap-3">
            {/* Top Bar: Title & Horizontal Tool Switcher Tabs */}
            <div className="flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-bold font-mono uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>
                            Network Utils
                        </h2>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                            Investigate / Diagnostic Engine
                        </span>
                    </div>

                    {/* Horizontal Tool Tabs (As suggested in Mockups) */}
                    <div
                        role="tablist"
                        aria-label="Diagnostic Tool Switcher"
                        className="flex items-center gap-1 p-1 rounded-lg border overflow-x-auto no-scrollbar"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            borderColor: 'var(--color-border)',
                        }}
                    >
                        {tools.map(tool => {
                            const isSelected = activeTool === tool.id;
                            const Icon = tool.icon;
                            return (
                                <button
                                    key={tool.id}
                                    role="tab"
                                    aria-selected={isSelected}
                                    onClick={() => { setActiveTool(tool.id); setResult(null); setError(null); }}
                                    className="px-2.5 py-1 text-xs font-mono font-medium rounded transition-all flex items-center gap-1.5 shrink-0"
                                    style={{
                                        backgroundColor: isSelected ? 'var(--color-accent)' : 'transparent',
                                        color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                                        fontWeight: isSelected ? 600 : 500,
                                    }}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{tool.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Horizontal Command / Input Bar */}
                <div
                    className="flex items-center gap-2.5 p-2 rounded-xl border flex-wrap"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    {/* Target Input */}
                    {targetRequired ? (
                        <div className="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-1.5 rounded-lg border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                                Target:
                            </span>
                            <input
                                id="diag-target-input"
                                type="text"
                                value={target}
                                onChange={e => setTarget(e.target.value)}
                                onKeyDown={handleKey}
                                placeholder={activeTool === 'dig' ? 'Domain name (e.g. google.com)' : 'IP or Hostname (e.g. 8.8.8.8)'}
                                className="w-full bg-transparent text-xs font-mono outline-none"
                                style={{ color: 'var(--color-text-primary)' }}
                            />
                        </div>
                    ) : activeTool === 'netstat' ? (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono uppercase font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                                State:
                            </span>
                            <div className="flex items-center gap-1">
                                {(['all', 'listening', 'established'] as const).map(st => (
                                    <button
                                        key={st}
                                        onClick={() => setNetstatState(st)}
                                        className="px-2 py-1 rounded text-[10px] font-mono capitalize border transition"
                                        style={{
                                            backgroundColor: netstatState === st ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                                            borderColor: 'var(--color-border)',
                                            color: netstatState === st ? '#ffffff' : 'var(--color-text-secondary)',
                                        }}
                                    >
                                        {st}
                                    </button>
                                ))}
                            </div>
                            <span className="text-[10px] font-mono uppercase font-semibold ml-2" style={{ color: 'var(--color-text-muted)' }}>
                                Proto:
                            </span>
                            <div className="flex items-center gap-1">
                                {(['all', 'tcp', 'udp'] as const).map(pr => (
                                    <button
                                        key={pr}
                                        onClick={() => setNetstatProto(pr)}
                                        className="px-2 py-1 rounded text-[10px] font-mono uppercase border transition"
                                        style={{
                                            backgroundColor: netstatProto === pr ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                                            borderColor: 'var(--color-border)',
                                            color: netstatProto === pr ? '#ffffff' : 'var(--color-text-secondary)',
                                        }}
                                    >
                                        {pr}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                            System Inspection Ready
                        </div>
                    )}

                    {/* Traceroute Options (Max Hops / Timeout) */}
                    {activeTool === 'traceroute' && (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-mono" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Max Hops:</span>
                                <select
                                    value={maxHops}
                                    onChange={e => setMaxHops(Number(e.target.value))}
                                    className="bg-transparent font-bold outline-none cursor-pointer"
                                    style={{ color: 'var(--color-text-primary)' }}
                                >
                                    <option value={15}>15</option>
                                    <option value={30}>30</option>
                                    <option value={60}>60</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-mono" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Timeout:</span>
                                <select
                                    value={timeoutSec}
                                    onChange={e => setTimeoutSec(Number(e.target.value))}
                                    className="bg-transparent font-bold outline-none cursor-pointer"
                                    style={{ color: 'var(--color-text-primary)' }}
                                >
                                    <option value={1}>1s</option>
                                    <option value={2}>2s</option>
                                    <option value={4}>4s</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* DiG Record Type */}
                    {activeTool === 'dig' && (
                        <div className="flex items-center gap-1">
                            {(['A', 'AAAA', 'CNAME', 'MX', 'TXT'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setDigType(t)}
                                    className="px-2 py-1 rounded text-[10px] font-mono border transition"
                                    style={{
                                        backgroundColor: digType === t ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                                        borderColor: 'var(--color-border)',
                                        color: digType === t ? '#ffffff' : 'var(--color-text-secondary)',
                                    }}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Primary Run Button */}
                    <button
                        onClick={run}
                        disabled={loading || (targetRequired && !target.trim())}
                        className={
                            layoutTheme === 'a'
                                ? 'px-5 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-40 bg-white text-zinc-950 hover:bg-zinc-200'
                                : 'px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-40'
                        }
                        style={layoutTheme === 'a' ? undefined : {
                            backgroundColor: 'var(--color-accent)',
                            color: '#ffffff',
                        }}
                    >
                        {loading ? (
                            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>Run</span>
                    </button>

                    {/* Secondary "View on globe" Button */}
                    {result && (activeTool === 'traceroute' || activeTool === 'ping' || activeTool === 'path') && (
                        <button
                            onClick={() => {
                                if (activeTool === 'traceroute') {
                                    const r = result as TracerouteResult;
                                    const overlayHops = r.hops.map(h => ({
                                        hop: h.hop,
                                        ip: h.ip,
                                        hostname: h.hostname,
                                        times_ms: h.times_ms,
                                        avg_ms: h.avg_ms,
                                        timeout: h.timeout,
                                        geo: h.geo,
                                    }));
                                    setDiagnosticOverlay({
                                        tool: 'traceroute',
                                        target: r.target,
                                        hops: overlayHops,
                                        totalHops: r.hops.length,
                                        avgLatencyMs: kpiAvgLatency,
                                        timestamp: Date.now(),
                                    });
                                }
                                setActiveView('globe');
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition flex items-center gap-1.5 hover:opacity-90"
                            style={{
                                backgroundColor: 'var(--color-bg-secondary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-accent-text)',
                            }}
                            title="Project traceroute trajectory on 3D Globe"
                        >
                            <Globe className="w-3.5 h-3.5" />
                            <span>View on globe</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="p-3 rounded-lg border text-xs font-mono flex items-center gap-2" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--color-status-danger)', color: 'var(--color-status-danger)' }}>
                    <span>⚠️ Error: {error}</span>
                </div>
            )}

            {/* Main Workspace (2-Column Layout as shown in Mockups) */}
            <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
                {/* Left/Main Results Table Column */}
                <div
                    className="flex-1 min-w-0 h-full overflow-y-auto rounded-xl border p-3 flex flex-col"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    {/* Path View Component delegation */}
                    {activeTool === 'path' && result && (
                        <ConnectionPathView data={result as any} />
                    )}

                    {/* Loading State */}
                    {loading && !result && activeTool !== 'path' && (
                        <div className="flex flex-col gap-2 py-4">
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="h-9 rounded-lg animate-pulse" style={{ width: `${80 + (i % 3) * 8}%`, backgroundColor: 'var(--color-bg-tertiary)' }} />
                            ))}
                        </div>
                    )}

                    {/* Empty State */}
                    {!loading && !result && !error && activeTool !== 'path' && activeTool !== 'firewall' && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--color-text-muted)' }}>
                            <Terminal className="w-10 h-10 opacity-30" />
                            <div className="text-center font-mono">
                                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                    Network Diagnostics Console
                                </p>
                                <p className="text-xs mt-1">Enter target IP or host and click Run to begin inspection</p>
                            </div>
                            {remoteIPs.length > 0 && (
                                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2 max-w-md">
                                    <span className="text-[10px] font-mono uppercase tracking-wider mr-1">Quick-fill:</span>
                                    {remoteIPs.slice(0, 6).map(ip => (
                                        <button
                                            key={ip}
                                            onClick={() => setTarget(ip)}
                                            className="px-2 py-0.5 rounded text-[10px] font-mono border hover:opacity-80 transition"
                                            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                                        >
                                            {ip}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Traceroute Results Table (Exact styling from Mockups A, B, C) */}
                    {result && activeTool === 'traceroute' && (() => {
                        const r = result as TracerouteResult;
                        return (
                            <div className="flex flex-col gap-2">
                                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                                    <div
                                        className="grid grid-cols-[3rem_1fr_1.2fr_1.2fr_5.5rem_2.5rem] px-3 py-2 text-[10px] font-mono uppercase font-semibold border-b"
                                        style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                                    >
                                        <span>Hop</span>
                                        <span>IP Address</span>
                                        <span>Hostname / ASN</span>
                                        <span>Country & City</span>
                                        <span className="text-right">RTT ms</span>
                                        <span className="text-center">Status</span>
                                    </div>
                                    <div className="divide-y" style={{ borderColor: 'var(--color-border-hairline)' }}>
                                        {r.hops.map((hop) => (
                                            <div
                                                key={hop.hop}
                                                className={`grid grid-cols-[3rem_1fr_1.2fr_1.2fr_5.5rem_2.5rem] items-center px-3 py-2 text-xs font-mono transition-colors ${
                                                    hop.timeout ? 'opacity-40' : 'hover:opacity-90'
                                                }`}
                                            >
                                                <span style={{ color: 'var(--color-text-muted)' }}>{hop.hop}</span>
                                                <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{hop.ip || '* * *'}</span>
                                                <div className="flex flex-col truncate pr-2">
                                                    <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{hop.hostname || hop.geo?.org || '—'}</span>
                                                    {hop.geo?.asn && <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{hop.geo.asn}</span>}
                                                </div>
                                                <div className="truncate pr-2" style={{ color: 'var(--color-text-secondary)' }}>
                                                    {hop.geo ? `${hop.geo.city || ''} ${hop.geo.country || '—'}` : '—'}
                                                </div>
                                                <div className="flex items-center justify-end gap-2">
                                                    <LatencyBar ms={hop.avg_ms} />
                                                    <span className={`w-12 text-right font-bold ${latencyColor(hop.avg_ms)}`}>
                                                        {hop.avg_ms != null ? `${hop.avg_ms}ms` : '—'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-center">
                                                    <span
                                                        className="w-2 h-2 rounded-full"
                                                        style={{
                                                            backgroundColor: hop.timeout
                                                                ? 'var(--color-status-danger)'
                                                                : hop.avg_ms && hop.avg_ms > 100
                                                                ? 'var(--color-status-warn)'
                                                                : 'var(--color-status-ok)',
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Ping Results Table */}
                    {result && activeTool === 'ping' && (() => {
                        const r = result as PingResult;
                        return (
                            <div className="flex flex-col gap-3">
                                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                                    <div
                                        className="grid grid-cols-[3rem_1fr_6rem_3rem] px-3 py-2 text-[10px] font-mono uppercase font-semibold border-b"
                                        style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                                    >
                                        <span>Seq</span>
                                        <span>Reply From</span>
                                        <span className="text-right">Latency</span>
                                        <span className="text-center">Status</span>
                                    </div>
                                    <div className="divide-y" style={{ borderColor: 'var(--color-border-hairline)' }}>
                                        {r.echoes.map((echo, i) => (
                                            <div key={i} className="grid grid-cols-[3rem_1fr_6rem_3rem] items-center px-3 py-2 text-xs font-mono">
                                                <span style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span>
                                                <span style={{ color: 'var(--color-text-primary)' }}>{echo.ip || r.target}</span>
                                                <div className="flex items-center justify-end gap-2">
                                                    <LatencyBar ms={echo.time_ms} />
                                                    <span className={`w-12 text-right font-bold ${latencyColor(echo.time_ms)}`}>
                                                        {echo.time_ms != null ? `${echo.time_ms}ms` : 'Timeout'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-center">
                                                    <span
                                                        className="w-2 h-2 rounded-full"
                                                        style={{
                                                            backgroundColor: echo.timeout ? 'var(--color-status-danger)' : 'var(--color-status-ok)',
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Netstat Socket Grid */}
                    {result && activeTool === 'netstat' && (() => {
                        const r = result as NetstatResult;
                        return (
                            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                                <div
                                    className="grid grid-cols-[4rem_1.2fr_1.2fr_5.5rem_1fr] px-3 py-2 text-[10px] font-mono uppercase font-semibold border-b"
                                    style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                                >
                                    <span>Proto</span>
                                    <span>Local Address</span>
                                    <span>Remote Address</span>
                                    <span>State</span>
                                    <span>Process</span>
                                </div>
                                <div className="divide-y max-h-[500px] overflow-y-auto" style={{ borderColor: 'var(--color-border-hairline)' }}>
                                    {r.connections.slice(0, 150).map((conn, i) => (
                                        <div key={i} className="grid grid-cols-[4rem_1.2fr_1.2fr_5.5rem_1fr] items-center px-3 py-1.5 text-xs font-mono">
                                            <span style={{ color: 'var(--color-text-muted)' }}>{conn.proto}</span>
                                            <span style={{ color: 'var(--color-text-primary)' }}>{conn.local_address}:{conn.local_port}</span>
                                            <span style={{ color: 'var(--color-text-secondary)' }}>{conn.remote_address}:{conn.remote_port}</span>
                                            <span
                                                className="text-[10px] font-bold uppercase"
                                                style={{
                                                    color: conn.state === 'ESTABLISHED' ? 'var(--color-status-ok)' : conn.state === 'LISTENING' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                                }}
                                            >
                                                {conn.state}
                                            </span>
                                            <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>
                                                {conn.process_name || `PID ${conn.pid}`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Firewall Blocked IP Table */}
                    {activeTool === 'firewall' && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                    Windows Firewall Blocked Rules ({blockedList.length})
                                </span>
                            </div>
                            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                                <div
                                    className="grid grid-cols-[1fr_5rem_1.5fr_5rem] px-3 py-2 text-[10px] font-mono uppercase font-semibold border-b"
                                    style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                                >
                                    <span>IP Address</span>
                                    <span>Direction</span>
                                    <span>Reason</span>
                                    <span className="text-right">Action</span>
                                </div>
                                <div className="divide-y" style={{ borderColor: 'var(--color-border-hairline)' }}>
                                    {blockedList.length === 0 ? (
                                        <div className="p-4 text-center text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                            No active IP blocks currently enforced by SignalMap.
                                        </div>
                                    ) : (
                                        blockedList.map((item) => (
                                            <div key={item.ip} className="grid grid-cols-[1fr_5rem_1.5fr_5rem] items-center px-3 py-2 text-xs font-mono">
                                                <span className="font-bold" style={{ color: 'var(--color-status-danger)' }}>{item.ip}</span>
                                                <span style={{ color: 'var(--color-text-secondary)' }}>{item.direction}</span>
                                                <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>{item.reason}</span>
                                                <div className="text-right">
                                                    <button
                                                        onClick={() => handleUnblock(item.ip)}
                                                        className="px-2 py-0.5 rounded text-[10px] font-mono border hover:opacity-80 transition"
                                                        style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-status-ok)' }}
                                                    >
                                                        Unblock
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: KPI Metrics Card + Mini Route Map + Raw Output Console */}
                <div className="w-72 shrink-0 flex flex-col gap-3 h-full overflow-y-auto">
                    {/* Summary KPI Card (As highlighted in mockups) */}
                    <div
                        className="rounded-xl border p-3 flex flex-col gap-3"
                        style={{
                            backgroundColor: 'var(--color-bg-card)',
                            borderColor: 'var(--color-border)',
                        }}
                    >
                        <span className="text-[10px] font-mono uppercase font-semibold tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                            Inspection Telemetry
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex flex-col">
                                <span className="text-lg font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                    {kpiHopsCount}
                                </span>
                                <span className="text-[9px] font-mono uppercase" style={{ color: 'var(--color-text-muted)' }}>
                                    Hops/Items
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-lg font-mono font-bold" style={{ color: 'var(--color-accent-text)' }}>
                                    {kpiAvgLatency} ms
                                </span>
                                <span className="text-[9px] font-mono uppercase" style={{ color: 'var(--color-text-muted)' }}>
                                    Avg RTT
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-lg font-mono font-bold" style={{ color: kpiLoss === '0%' ? 'var(--color-status-ok)' : 'var(--color-status-danger)' }}>
                                    {kpiLoss}
                                </span>
                                <span className="text-[9px] font-mono uppercase" style={{ color: 'var(--color-text-muted)' }}>
                                    Loss Rate
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Collapsible Raw Terminal Box (Exact match to Mockup C) */}
                    <div
                        className="flex-1 rounded-xl border flex flex-col overflow-hidden min-h-[220px]"
                        style={{
                            backgroundColor: 'var(--color-bg-card)',
                            borderColor: 'var(--color-border)',
                        }}
                    >
                        <div
                            className="flex items-center justify-between px-3 py-2 border-b text-[10px] font-mono uppercase font-semibold"
                            style={{
                                backgroundColor: 'var(--color-bg-secondary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-muted)',
                            }}
                        >
                            <span>&gt; Raw CLI Output</span>
                            {rawOutputText && (
                                <button
                                    onClick={copyRaw}
                                    className="flex items-center gap-1 hover:opacity-80 transition"
                                    title="Copy raw terminal output"
                                >
                                    {copiedRaw ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    <span>{copiedRaw ? 'Copied' : 'Copy'}</span>
                                </button>
                            )}
                        </div>
                        <div
                            className="flex-1 p-2.5 font-mono text-[10px] overflow-y-auto leading-relaxed select-text"
                            style={{
                                backgroundColor: 'var(--color-bg-primary)',
                                color: 'var(--color-text-secondary)',
                            }}
                        >
                            {rawOutputText ? (
                                <pre className="whitespace-pre-wrap">{rawOutputText}</pre>
                            ) : (
                                <span className="opacity-40 italic">Awaiting diagnostic process execution...</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
