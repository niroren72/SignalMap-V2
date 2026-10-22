import { useMemo } from 'react';
import { useConnectionStore } from '../stores/connectionStore';

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

interface PathResult {
    local_ip: string;
    remote_ip: string;
    remote_port: number | null;
    origin_geo: { ip?: string; country?: string; city?: string; org?: string; lat?: number; lon?: number } | null;
    remote_geo: { ip?: string; country?: string; city?: string; org?: string; lat?: number; lon?: number; asn?: string } | null;
    hops: Hop[];
    hop_count: number;
    total_hops: number;
}

function latencyColor(ms: number | null | undefined): string {
    if (ms == null) return '#64748b';
    if (ms < 20) return '#34d399';
    if (ms < 80) return '#facc15';
    if (ms < 200) return '#fb923c';
    return '#f87171';
}

// ─── Node card for each hop ───────────────────────────────────────────────────

function PathNode({
    label,
    sublabel,
    org,
    ip,
    isOrigin,
    isDestination,
    isPop,
    avgMs,
    hopNum,
    timeout,
}: {
    label: string;
    sublabel?: string;
    org?: string;
    ip?: string | null;
    isOrigin?: boolean;
    isDestination?: boolean;
    isPop?: boolean;
    avgMs?: number | null;
    hopNum?: number;
    timeout?: boolean;
}) {
    const color = isOrigin
        ? 'from-emerald-600/80 to-teal-600/80 border-emerald-400/40 shadow-[0_0_16px_rgba(52,211,153,0.25)]'
        : isDestination
        ? 'from-cyan-600/80 to-blue-700/80 border-cyan-400/40 shadow-[0_0_16px_rgba(6,182,212,0.3)]'
        : isPop
        ? 'from-violet-700/60 to-purple-700/60 border-violet-400/40 shadow-[0_0_12px_rgba(139,92,246,0.25)]'
        : 'from-slate-700/60 to-slate-800/60 border-slate-600/40';

    return (
        <div className={`flex flex-col items-center gap-1 min-w-[100px] max-w-[130px] shrink-0`}>
            {/* Node circle */}
            <div
                className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${color} border flex items-center justify-center shadow-lg transition-transform hover:scale-105`}
                title={ip || label}
            >
                <span className="text-2xl">
                    {isOrigin ? '💻' : isDestination ? '🖥️' : isPop ? '🔗' : timeout ? '⚡' : '📍'}
                </span>
                {hopNum != null && !isOrigin && !isDestination && (
                    <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-slate-900 border border-slate-600 text-[9px] font-mono font-bold text-slate-400 flex items-center justify-center">
                        {hopNum}
                    </span>
                )}
                {isPop && (
                    <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-violet-900 border border-violet-500/60 text-[8px] font-mono font-bold text-violet-300">
                        PoP
                    </span>
                )}
                {isOrigin && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-emerald-900 border border-emerald-500/60 text-[8px] font-mono font-bold text-emerald-300 whitespace-nowrap">
                        YOU
                    </span>
                )}
                {isDestination && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-cyan-900 border border-cyan-500/60 text-[8px] font-mono font-bold text-cyan-300 whitespace-nowrap">
                        DEST
                    </span>
                )}
            </div>

            {/* Label below */}
            <div className="flex flex-col items-center text-center mt-1.5">
                <span className="text-[10px] font-semibold text-slate-200 truncate max-w-full" title={label}>{label}</span>
                {sublabel && <span className="text-[9px] text-slate-500 truncate max-w-full" title={sublabel}>{sublabel}</span>}
                {org && <span className="text-[9px] text-slate-600 truncate max-w-full" title={org}>{org}</span>}
                {avgMs != null && !timeout && (
                    <span className="text-[9px] font-mono font-bold mt-0.5" style={{ color: latencyColor(avgMs) }}>
                        {avgMs}ms
                    </span>
                )}
                {timeout && <span className="text-[9px] font-mono text-rose-500">timeout</span>}
            </div>
        </div>
    );
}

// ─── Animated connector arrow between hops ────────────────────────────────────

function Connector({ ms, isLast: _isLast }: { ms?: number | null; isLast?: boolean }) {
    const color = latencyColor(ms);
    return (
        <div className="flex flex-col items-center gap-1 shrink-0 mx-1 mt-2">
            <div className="relative flex items-center" style={{ width: 48 }}>
                <div
                    className="h-0.5 w-full rounded-full"
                    style={{
                        background: `linear-gradient(to right, ${color}66, ${color})`,
                        boxShadow: `0 0 6px ${color}40`,
                    }}
                />
                <svg
                    className="absolute right-0 shrink-0"
                    width="8" height="8" viewBox="0 0 8 8"
                    style={{ marginRight: -1 }}
                >
                    <path d="M0 0 L8 4 L0 8 Z" fill={color} />
                </svg>
            </div>
            {ms != null && (
                <span className="text-[8px] font-mono" style={{ color }}>
                    {ms}ms
                </span>
            )}
        </div>
    );
}

// ─── Mini world map with dot positions ───────────────────────────────────────

function MiniGeoMap({ nodes }: { nodes: { lat?: number; lon?: number; label: string; isOrigin?: boolean; isDestination?: boolean; isPop?: boolean }[] }) {
    // Simple equirectangular projection
    const W = 500, H = 220;
    const project = (lat: number, lon: number) => ({
        x: ((lon + 180) / 360) * W,
        y: ((90 - lat) / 180) * H,
    });

    const geoNodes = nodes.filter(n => n.lat != null && n.lon != null);

    return (
        <div className="glass-card border border-slate-700/60 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 text-[10px] font-mono uppercase text-slate-500 font-semibold">
                Geographic Path
            </div>
            <div className="relative p-2" style={{ height: H + 16 }}>
                {/* World outline SVG background */}
                <svg
                    width="100%"
                    viewBox={`0 0 ${W} ${H}`}
                    className="absolute inset-2 opacity-10"
                    style={{ pointerEvents: 'none' }}
                >
                    {/* Rough graticule grid */}
                    {[-60, -30, 0, 30, 60].map(lat => {
                        const y = ((90 - lat) / 180) * H;
                        return <line key={lat} x1={0} y1={y} x2={W} y2={y} stroke="#64748b" strokeWidth="0.5" />;
                    })}
                    {[-120, -60, 0, 60, 120].map(lon => {
                        const x = ((lon + 180) / 360) * W;
                        return <line key={lon} x1={x} y1={0} x2={x} y2={H} stroke="#64748b" strokeWidth="0.5" />;
                    })}
                </svg>

                {/* Path lines */}
                <svg
                    width="100%"
                    viewBox={`0 0 ${W} ${H}`}
                    className="absolute inset-2"
                    style={{ pointerEvents: 'none' }}
                >
                    {geoNodes.slice(0, -1).map((node, i) => {
                        const next = geoNodes[i + 1];
                        if (!next.lat || !next.lon || !node.lat || !node.lon) return null;
                        const p1 = project(node.lat, node.lon);
                        const p2 = project(next.lat, next.lon);
                        // Curved arc via quadratic bezier
                        const cx = (p1.x + p2.x) / 2;
                        const cy = Math.min(p1.y, p2.y) - 20;
                        return (
                            <path
                                key={i}
                                d={`M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`}
                                stroke="#6d28d9"
                                strokeWidth="1.5"
                                strokeDasharray="4 2"
                                fill="none"
                                opacity="0.7"
                            />
                        );
                    })}
                </svg>

                {/* Geo dots */}
                <svg
                    width="100%"
                    viewBox={`0 0 ${W} ${H}`}
                    className="absolute inset-2"
                >
                    {geoNodes.map((node, i) => {
                        const { x, y } = project(node.lat!, node.lon!);
                        const fill = node.isOrigin ? '#34d399' : node.isDestination ? '#06b6d4' : node.isPop ? '#a78bfa' : '#94a3b8';
                        return (
                            <g key={i}>
                                <circle cx={x} cy={y} r={5} fill={fill} opacity={0.9} />
                                <circle cx={x} cy={y} r={9} fill={fill} opacity={0.2} />
                                <text
                                    x={x}
                                    y={y - 10}
                                    textAnchor="middle"
                                    fill={fill}
                                    fontSize={8}
                                    fontFamily="monospace"
                                    opacity={0.9}
                                >
                                    {node.label.substring(0, 12)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ConnectionPathView({ data }: { data: PathResult }) {
    // Build display nodes — dedupe consecutive same-country/org hops to avoid clutter
    const nodes = useMemo(() => {
        const result: {
            type: 'origin' | 'hop' | 'destination';
            hop?: Hop;
            label: string;
            sublabel?: string;
            org?: string;
            ip?: string | null;
            lat?: number;
            lon?: number;
            isPop?: boolean;
            avgMs?: number | null;
            timeout?: boolean;
        }[] = [];

        // Origin node
        result.push({
            type: 'origin',
            label: data.origin_geo?.city || 'Your Network',
            sublabel: data.origin_geo?.country,
            org: data.origin_geo?.org,
            ip: data.origin_geo?.ip || data.local_ip,
            lat: data.origin_geo?.lat,
            lon: data.origin_geo?.lon,
        });

        // Hops — keep first public hop in each org cluster + all PoPs
        let lastOrg: string | undefined;
        for (const hop of data.hops) {
            if (hop.timeout && !hop.ip) continue; // skip pure timeouts
            const org = hop.geo?.org;
            const isPop = hop.geo?.is_pop || false;
            // Include if: first public hop, PoP, different org from last, or destination
            if (isPop || !org || org !== lastOrg) {
                result.push({
                    type: 'hop',
                    hop,
                    label: hop.geo?.city || hop.ip || `Hop ${hop.hop}`,
                    sublabel: hop.geo?.country,
                    org: hop.geo?.org,
                    ip: hop.ip,
                    lat: hop.geo?.lat,
                    lon: hop.geo?.lon,
                    isPop,
                    avgMs: hop.avg_ms,
                    timeout: hop.timeout,
                });
                lastOrg = org;
            }
        }

        // Destination node
        result.push({
            type: 'destination',
            label: data.remote_geo?.city || data.remote_ip,
            sublabel: data.remote_geo?.country,
            org: data.remote_geo?.org,
            ip: data.remote_ip,
            lat: data.remote_geo?.lat,
            lon: data.remote_geo?.lon,
        });

        return result;
    }, [data]);

    const geoNodes = nodes.map(n => ({
        lat: n.lat,
        lon: n.lon,
        label: n.label,
        isOrigin: n.type === 'origin',
        isDestination: n.type === 'destination',
        isPop: n.isPop,
    })).filter(n => n.lat != null && n.lon != null);

    const { setDiagnosticOverlay, setActiveView } = useConnectionStore();

    const totalLatency = data.hops
        .filter(h => h.avg_ms != null)
        .reduce((sum, h) => sum + (h.avg_ms || 0), 0);

    return (
        <div className="flex flex-col gap-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-start gap-3 flex-wrap">
                <div>
                    <div className="font-mono font-bold text-slate-100 text-sm flex items-center gap-2">
                        <span>🛤️</span>
                        CONNECTION PATH
                    </div>
                    <div className="text-xs font-mono text-slate-500 mt-0.5">
                        {data.local_ip} → {data.remote_ip}{data.remote_port ? `:${data.remote_port}` : ''}
                    </div>
                </div>
                {/* Summary pills and 3D globe button */}
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <button
                        onClick={() => {
                            const overlayHops = data.hops.map((h) => ({
                                hop: h.hop,
                                ip: h.ip,
                                hostname: h.hostname,
                                times_ms: h.times_ms,
                                avg_ms: h.avg_ms,
                                timeout: h.timeout,
                                geo: h.geo,
                            }));
                            setDiagnosticOverlay({
                                tool: 'path',
                                target: data.remote_ip,
                                hops: overlayHops,
                                totalHops: data.total_hops,
                                avgLatencyMs: totalLatency > 0 ? Math.round(totalLatency) : null,
                                timestamp: Date.now(),
                            });
                            setActiveView('globe');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all animate-pulse"
                        title="Project path on 3D Globe"
                    >
                        <span>🌐</span>
                        <span>View Path on 3D Globe</span>
                    </button>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
                        <span className="text-slate-500">Hops: </span>
                        <span className="text-cyan-400 font-bold">{data.hop_count}</span>
                        <span className="text-slate-600">/{data.total_hops}</span>
                    </span>
                    {totalLatency > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
                            <span className="text-slate-500">Total RTT: </span>
                            <span className="font-bold" style={{ color: latencyColor(totalLatency) }}>~{Math.round(totalLatency)}ms</span>
                        </span>
                    )}
                    {data.remote_geo?.country && (
                        <span className="px-2.5 py-1 rounded-lg bg-cyan-950/50 border border-cyan-500/30 text-xs font-mono text-cyan-300">
                            🌍 {data.remote_geo.city ? `${data.remote_geo.city}, ` : ''}{data.remote_geo.country}
                        </span>
                    )}
                    {data.remote_geo?.org && (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-slate-400">
                            {data.remote_geo.org}
                        </span>
                    )}
                </div>
            </div>

            {/* Geographic map */}
            {geoNodes.length >= 2 && (
                <MiniGeoMap nodes={geoNodes} />
            )}

            {/* Horizontal path visualization */}
            <div className="glass-card border border-slate-700/60 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 text-[10px] font-mono uppercase text-slate-500 font-semibold flex items-center gap-3">
                    End-to-End Path
                    <span className="ml-auto flex items-center gap-2 text-slate-600">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Origin</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" /> PoP</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" /> Destination</span>
                    </span>
                </div>
                <div className="p-5 overflow-x-auto">
                    <div className="flex items-start" style={{ minWidth: nodes.length * 140 }}>
                        {nodes.map((node, i) => (
                            <div key={i} className="flex items-start">
                                <PathNode
                                    label={node.label}
                                    sublabel={node.sublabel}
                                    org={node.org}
                                    ip={node.ip}
                                    isOrigin={node.type === 'origin'}
                                    isDestination={node.type === 'destination'}
                                    isPop={node.isPop}
                                    avgMs={node.avgMs}
                                    hopNum={node.hop?.hop}
                                    timeout={node.timeout}
                                />
                                {i < nodes.length - 1 && (
                                    <Connector
                                        ms={nodes[i + 1]?.avgMs}
                                        isLast={i === nodes.length - 2}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Detailed hop table */}
            <div className="glass-card border border-slate-700/60 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 text-[10px] font-mono uppercase text-slate-500 font-semibold">
                    Full Hop Table
                </div>
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr_5rem] px-4 py-2 bg-slate-900/50 border-b border-slate-800/60 text-[10px] font-mono uppercase text-slate-600 font-semibold gap-3">
                    <span>#</span>
                    <span>IP / Host</span>
                    <span>Location</span>
                    <span>Organization / ASN</span>
                    <span className="text-right">RTT</span>
                </div>
                <div className="divide-y divide-slate-800/40 max-h-64 overflow-y-auto">
                    {data.hops.map((hop, i) => (
                        <div
                            key={i}
                            className={`grid grid-cols-[2rem_1fr_1fr_1fr_5rem] items-center px-4 py-2 gap-3 text-xs transition-colors ${
                                hop.timeout ? 'opacity-40' : 'hover:bg-slate-800/20'
                            } ${hop.geo?.is_pop ? 'bg-violet-950/10' : ''}`}
                        >
                            <span className="font-mono text-slate-500">{hop.hop}</span>
                            <div className="flex flex-col min-w-0">
                                <span className="font-mono text-cyan-300 truncate">{hop.ip || '*'}</span>
                                {hop.hostname && <span className="text-[10px] text-slate-500 truncate">{hop.hostname}</span>}
                            </div>
                            <div className="flex flex-col min-w-0">
                                {hop.geo?.city || hop.geo?.country ? (
                                    <>
                                        <span className="text-slate-300 truncate">{hop.geo.city || '—'}</span>
                                        <span className="text-[10px] text-slate-500">{hop.geo.country}</span>
                                    </>
                                ) : (
                                    <span className="text-slate-600">
                                        {hop.ip && hop.ip.startsWith('192.168.') ? 'LAN' : '—'}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                {hop.geo?.org ? (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-400 truncate text-[11px]">{hop.geo.org}</span>
                                        {hop.geo.is_pop && (
                                            <span className="text-[8px] px-1 py-0.5 rounded bg-violet-900/60 border border-violet-500/40 text-violet-300 font-mono font-bold shrink-0">PoP</span>
                                        )}
                                    </div>
                                ) : <span className="text-slate-600">—</span>}
                                {hop.geo?.asn && <span className="text-[9px] text-slate-600 font-mono">{hop.geo.asn}</span>}
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                                {hop.timeout ? (
                                    <span className="text-rose-500 font-mono text-[10px]">* * *</span>
                                ) : (
                                    <>
                                        <span className="font-mono font-bold text-xs" style={{ color: latencyColor(hop.avg_ms) }}>
                                            {hop.avg_ms != null ? `${hop.avg_ms}ms` : '—'}
                                        </span>
                                        {hop.times_ms.length > 1 && (
                                            <span className="text-[9px] text-slate-600 font-mono">
                                                [{hop.times_ms.map(t => `${t}`).join('/')}]
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
