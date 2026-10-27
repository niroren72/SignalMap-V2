import { useEffect, useRef, useMemo, useState } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { Play, Pause, RotateCcw, Search, Clock } from 'lucide-react';

export function PlaybackView() {
    const {
        isLive,
        isPlaying,
        playbackSpeed,
        playbackTime,
        timeRangePreset,
        timelineBuckets,
        events,
        selectedId,
        setSelectedId,
        setIsPlaying,
        setPlaybackSpeed,
        setPlaybackTime,
        setTimeRangePreset,
        resetToLive,
    } = useConnectionStore();

    const timerRef = useRef<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [mountTime] = useState(() => Date.now());

    // Compute min and max timestamps from events
    const { minTime, maxTime } = useMemo(() => {
        const timestamps = events
            .map((e) => {
                const raw = e.metrics?.last_seen || e.metrics?.first_seen;
                return raw ? new Date(raw).getTime() : null;
            })
            .filter((t): t is number => t !== null && !isNaN(t));

        if (timestamps.length > 0) {
            return {
                minTime: Math.min(...timestamps),
                maxTime: Math.max(...timestamps),
            };
        }
        return {
            minTime: mountTime - 3600000,
            maxTime: mountTime,
        };
    }, [events, mountTime]);

    const effectiveTime = playbackTime ?? maxTime;

    // Playback loop
    useEffect(() => {
        if (!isPlaying) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        const intervalMs = 100; // 10 ticks per second
        timerRef.current = window.setInterval(() => {
            setPlaybackTime((prev) => {
                const current = prev ?? minTime;
                // Advance time by 1s * playbackSpeed per 100ms
                const next = current + (1000 * playbackSpeed) / 10;
                if (next >= maxTime) {
                    setIsPlaying(false);
                    return maxTime;
                }
                return next;
            });
        }, intervalMs);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPlaying, playbackSpeed, minTime, maxTime, setPlaybackTime, setIsPlaying]);

    // Format timestamps
    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    // Filter events up to current playback timestamp
    const visibleEvents = useMemo(() => {
        return events.filter((e) => {
            const raw = e.metrics?.last_seen || e.metrics?.first_seen;
            if (!raw) return true;
            const t = new Date(raw).getTime();
            if (t > effectiveTime) return false;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const match =
                    e.local?.process_name?.toLowerCase().includes(q) ||
                    e.remote?.ip?.toLowerCase().includes(q) ||
                    e.remote?.hostname?.toLowerCase().includes(q) ||
                    e.service?.name?.toLowerCase().includes(q) ||
                    e.geo?.country?.toLowerCase().includes(q);
                if (!match) return false;
            }

            return true;
        });
    }, [events, effectiveTime, searchQuery]);

    // Calculate max events in any bucket for histogram height scaling
    const maxBucketCount = useMemo(() => {
        return Math.max(...timelineBuckets.map((b) => b.count), 1);
    }, [timelineBuckets]);

    const stepTime = (deltaSeconds: number) => {
        setPlaybackTime((prev) => {
            const current = prev ?? maxTime;
            const next = current + deltaSeconds * 1000;
            return Math.min(Math.max(next, minTime), maxTime);
        });
    };

    return (
        <div className="w-full h-full p-4 flex flex-col gap-3 overflow-hidden animate-fade-in box-border">
            {/* Top Control Header Card */}
            <div
                className="glass-card border p-4 flex flex-col gap-3.5 shrink-0"
                style={{
                    backgroundColor: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                }}
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                            <Clock className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold font-mono tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                                Telemetry Time Machine
                            </h2>
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                Historical socket state scrubber & packet replay
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        {/* Time Range Presets */}
                        <div
                            className="flex items-center gap-0.5 p-0.5 rounded-lg border text-xs"
                            style={{
                                backgroundColor: 'var(--color-bg-secondary)',
                                borderColor: 'var(--color-border)',
                            }}
                        >
                            {(['5m', '15m', '1h', '24h', 'all'] as const).map((preset) => (
                                <button
                                    key={preset}
                                    onClick={() => setTimeRangePreset(preset)}
                                    className={`px-2.5 py-1 rounded transition uppercase font-mono text-[11px] font-semibold ${
                                        timeRangePreset === preset
                                            ? 'bg-cyan-600 text-white shadow-sm'
                                            : 'opacity-60 hover:opacity-100'
                                    }`}
                                    style={{
                                        color: timeRangePreset === preset ? '#ffffff' : 'var(--color-text-secondary)',
                                    }}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>

                        {/* Return to Live / Status */}
                        {!isLive ? (
                            <button
                                onClick={resetToLive}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-sm animate-pulse"
                                style={{
                                    backgroundColor: 'var(--color-accent-subtle)',
                                    borderColor: 'var(--color-accent-border)',
                                    color: 'var(--color-accent-text)',
                                }}
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Return to Live</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold font-mono" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--color-status-ok)' }}>
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                LIVE MODE
                            </div>
                        )}
                    </div>
                </div>

                {/* Histogram and Scrub Bar */}
                <div className="flex flex-col gap-2">
                    {/* Traffic Density Histogram */}
                    <div
                        className="relative w-full h-16 border rounded-lg p-2 flex items-end gap-[3px] overflow-hidden"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            borderColor: 'var(--color-border)',
                        }}
                    >
                        {timelineBuckets.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                Loading time buckets...
                            </div>
                        ) : (
                            timelineBuckets.map((bucket, idx) => {
                                const heightPct = Math.max((bucket.count / maxBucketCount) * 100, 12);
                                const hasAnomalies = bucket.anomalies > 0;
                                return (
                                    <div
                                        key={idx}
                                        style={{ height: `${heightPct}%` }}
                                        className={`flex-1 rounded-t transition-all cursor-pointer ${
                                            hasAnomalies
                                                ? 'bg-rose-500 hover:bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.7)]'
                                                : 'bg-cyan-500/50 hover:bg-cyan-400'
                                        }`}
                                        title={`${bucket.count} events (${bucket.anomalies} threats) at ${bucket.timestamp}`}
                                    />
                                );
                            })
                        )}
                    </div>

                    {/* Interactive Range Slider */}
                    <div className="relative flex flex-col gap-1">
                        <input
                            type="range"
                            min={minTime}
                            max={maxTime}
                            value={effectiveTime}
                            onChange={(e) => setPlaybackTime(Number(e.target.value))}
                            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
                            style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                        />
                        <div className="flex justify-between text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                            <span>{formatDate(minTime)} {formatTime(minTime)}</span>
                            <span className="text-cyan-400 font-bold">
                                Current: {formatDate(effectiveTime)} {formatTime(effectiveTime)}
                            </span>
                            <span>{formatDate(maxTime)} {formatTime(maxTime)}</span>
                        </div>
                    </div>
                </div>

                {/* Playback Controls & Speed Multipliers */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                        {/* -10s Step */}
                        <button
                            onClick={() => stepTime(-10)}
                            className="px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition hover:opacity-80"
                            style={{
                                backgroundColor: 'var(--color-bg-secondary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-secondary)',
                            }}
                            title="Step back 10 seconds"
                        >
                            -10s
                        </button>

                        {/* Play/Pause Button */}
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className={`px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${
                                isPlaying
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.35)]'
                                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                            }`}
                        >
                            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            <span>{isPlaying ? 'PAUSE PLAYBACK' : 'START PLAYBACK'}</span>
                        </button>

                        {/* +10s Step */}
                        <button
                            onClick={() => stepTime(10)}
                            className="px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition hover:opacity-80"
                            style={{
                                backgroundColor: 'var(--color-bg-secondary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-secondary)',
                            }}
                            title="Step forward 10 seconds"
                        >
                            +10s
                        </button>

                        {/* Speed Multipliers */}
                        <div
                            className="flex items-center gap-0.5 p-0.5 rounded-lg border text-xs font-semibold ml-2"
                            style={{
                                backgroundColor: 'var(--color-bg-secondary)',
                                borderColor: 'var(--color-border)',
                            }}
                        >
                            <span className="text-[10px] uppercase px-1.5 font-mono" style={{ color: 'var(--color-text-muted)' }}>Speed:</span>
                            {[1, 2, 5, 10].map((spd) => (
                                <button
                                    key={spd}
                                    onClick={() => setPlaybackSpeed(spd)}
                                    className={`px-2 py-0.5 rounded transition text-xs font-mono ${
                                        playbackSpeed === spd
                                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                                            : 'opacity-60 hover:opacity-100'
                                    }`}
                                    style={{
                                        color: playbackSpeed === spd ? undefined : 'var(--color-text-secondary)',
                                    }}
                                >
                                    {spd}x
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Record count badge */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                        <span style={{ color: 'var(--color-text-muted)' }}>Events at Snapshot:</span>
                        <span className="px-2.5 py-1 rounded-md border font-bold" style={{ backgroundColor: 'var(--color-accent-subtle)', borderColor: 'var(--color-accent-border)', color: 'var(--color-accent-text)' }}>
                            {visibleEvents.length} Active Sockets
                        </span>
                    </div>
                </div>
            </div>

            {/* Historical Event List / Telemetry Snapshot */}
            <div
                className="flex-1 min-h-0 flex flex-col glass-card border rounded-xl overflow-hidden shadow-xl"
                style={{
                    backgroundColor: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                }}
            >
                {/* Search header */}
                <div
                    className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
                    style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    <span className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                        Historical Sockets Snapshot
                    </span>
                    <div className="relative max-w-xs">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none opacity-50" style={{ color: 'var(--color-text-muted)' }}>
                            <Search className="w-3.5 h-3.5" />
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter snapshot records..."
                            className="pl-8 pr-3 py-1 border rounded-md text-xs font-mono focus:outline-none"
                            style={{
                                backgroundColor: 'var(--color-bg-tertiary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-primary)',
                            }}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead
                            className="sticky top-0 z-10 border-b text-[10px] font-mono select-none"
                            style={{
                                backgroundColor: 'var(--color-bg-secondary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-muted)',
                            }}
                        >
                            <tr>
                                <th className="px-3 py-2">STATUS</th>
                                <th className="px-3 py-2">TIMESTAMP</th>
                                <th className="px-3 py-2">PROCESS</th>
                                <th className="px-3 py-2">PROTO</th>
                                <th className="px-3 py-2">LOCAL SOCKET</th>
                                <th className="px-3 py-2">REMOTE SOCKET</th>
                                <th className="px-3 py-2">LOCATION</th>
                                <th className="px-3 py-2">SERVICE</th>
                                <th className="px-3 py-2">ANOMALY REASON</th>
                                <th className="px-3 py-2 text-right">ACTION</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y font-mono text-[11px]" style={{ borderColor: 'var(--color-border-hairline)' }}>
                            {visibleEvents.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
                                        No historical events recorded before this timestamp.
                                    </td>
                                </tr>
                            ) : (
                                visibleEvents.map((e, idx) => {
                                    const eventId = e.id || `hist-${idx}`;
                                    const isSelected = selectedId === eventId;
                                    const isAnomaly = e.anomaly?.is_anomaly;
                                    const severity = e.anomaly?.severity;

                                    return (
                                        <tr
                                            key={eventId}
                                            onClick={() => setSelectedId(selectedId === eventId ? null : (eventId || null))}
                                            className={`cursor-pointer transition-colors ${
                                                isSelected
                                                    ? 'bg-cyan-950/60 border-l-2 border-cyan-400'
                                                    : isAnomaly
                                                    ? 'bg-rose-950/20 hover:bg-rose-950/30'
                                                    : 'hover:bg-white/[0.02]'
                                            }`}
                                        >
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                {isAnomaly ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                                        {severity || 'Threat'}
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                                        NORMAL
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                                {e.metrics?.last_seen ? formatTime(new Date(e.metrics.last_seen).getTime()) : '-'}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-sans font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                                        {e.local?.process_name || 'System'}
                                                    </span>
                                                    {e.local?.pid != null && (
                                                        <span className="text-[10px] font-mono opacity-60">
                                                            ({e.local.pid})
                                                        </span>
                                                    )}
                                                    {e.local?.user && (
                                                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/40">
                                                            {e.local.user}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap font-mono uppercase text-[11px]" style={{ color: 'var(--color-accent-text)' }}>
                                                {e.protocol || 'TCP'}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                                {e.local?.host || '127.0.0.1'}:{e.local?.port || 0}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-cyan-300 text-[11px]">
                                                {e.remote?.ip || '0.0.0.0'}:{e.remote?.port || 0}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap font-sans" style={{ color: 'var(--color-text-secondary)' }}>
                                                {e.geo?.city ? `${e.geo.city}, ` : ''}{e.geo?.country || 'Local'}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>
                                                {e.service?.category || '-'}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-rose-300 text-[11px] max-w-[180px] truncate font-sans">
                                                {e.anomaly?.title || e.anomaly?.description || '-'}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right">
                                                <button
                                                    onClick={(ev) => {
                                                        ev.stopPropagation();
                                                        setSelectedId(selectedId === eventId ? null : (eventId || null));
                                                    }}
                                                    className="px-2 py-0.5 rounded text-[11px] font-semibold border transition"
                                                    style={{
                                                        backgroundColor: selectedId === eventId ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                                                        borderColor: selectedId === eventId ? 'var(--color-accent)' : 'var(--color-border)',
                                                        color: selectedId === eventId ? '#ffffff' : 'var(--color-text-secondary)',
                                                    }}
                                                >
                                                    {selectedId === eventId ? 'Close' : 'Inspect'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
