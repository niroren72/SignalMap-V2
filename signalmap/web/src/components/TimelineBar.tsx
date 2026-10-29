import { useEffect, useRef } from 'react';
import { useConnectionStore } from '../stores/connectionStore';

export function TimelineBar() {
    const {
        isLive,
        isPlaying,
        playbackSpeed,
        playbackTime,
        timeRangePreset,
        timelineBuckets,
        events,
        setIsPlaying,
        setPlaybackSpeed,
        setPlaybackTime,
        setTimeRangePreset,
        resetToLive,
    } = useConnectionStore();

    const timerRef = useRef<number | null>(null);

    // Compute min and max timestamps from events
    const timestamps = events
        .map((e) => (e.metrics?.last_seen || e.metrics?.first_seen ? new Date(e.metrics?.last_seen || e.metrics?.first_seen!).getTime() : null))
        .filter((t): t is number => t !== null && !isNaN(t));

    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : Date.now() - 3600000;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
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

    // Format human readable timestamp
    const formatTime = (ms: number) => {
        const d = new Date(ms);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // Calculate max count for histogram scaling
    const maxBucketCount = Math.max(...timelineBuckets.map((b) => b.count), 1);

    const isSidebarCollapsed = useConnectionStore((s) => s.isSidebarCollapsed);

    return (
        <div
            className={`fixed bottom-2 right-0 z-10 glass-card mx-4 px-4 py-2 flex flex-col gap-1.5 transition-all duration-300 ${
                isSidebarCollapsed ? 'left-20' : 'left-60'
            }`}
        >
            {/* Top row: Controls, presets, and live indicator */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {/* Play/Pause Button */}
                    <button
                        id="timeline-play-btn"
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all ${
                            isPlaying
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
                        }`}
                        title={isPlaying ? 'Pause playback' : 'Play historical traffic'}
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>

                    {/* Speed Selector */}
                    <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-lg border border-slate-800 text-xs font-semibold">
                        {[1, 2, 5, 10].map((spd) => (
                            <button
                                key={spd}
                                onClick={() => setPlaybackSpeed(spd)}
                                className={`px-2 py-1 rounded transition ${
                                    playbackSpeed === spd
                                        ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {spd}x
                            </button>
                        ))}
                    </div>

                    {/* Current Scrubber Timestamp */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono bg-slate-950/60 px-2.5 py-1 rounded-md border border-slate-800">
                        <span className="text-slate-500">Time:</span>
                        <span className="font-semibold text-cyan-400">{formatTime(effectiveTime)}</span>
                    </div>
                </div>

                {/* Range Presets */}
                <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-lg border border-slate-800 text-xs">
                    {(['5m', '15m', '1h', '24h', 'all'] as const).map((preset) => (
                        <button
                            key={preset}
                            onClick={() => setTimeRangePreset(preset)}
                            className={`px-2.5 py-1 rounded transition uppercase font-medium ${
                                timeRangePreset === preset
                                    ? 'bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.4)]'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {preset}
                        </button>
                    ))}
                </div>

                {/* Live Mode Switch */}
                <div className="flex items-center gap-2">
                    {!isLive && (
                        <button
                            onClick={resetToLive}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-600/20 border border-cyan-500/60 text-cyan-300 hover:bg-cyan-600/30 text-xs font-semibold shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all animate-pulse"
                        >
                            <span>↻</span> Return to Live
                        </button>
                    )}

                    <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                            isLive
                                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                : 'bg-slate-800/80 border border-slate-700 text-slate-400'
                        }`}
                    >
                        <span
                            className={`w-2 h-2 rounded-full ${
                                isLive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
                            }`}
                        />
                        {isLive ? 'LIVE' : 'REPLAY'}
                    </div>
                </div>
            </div>

            {/* Bottom row: Visual Histogram & Scrub Slider */}
            <div className="relative w-full flex flex-col pt-1">
                {/* Mini traffic density histogram bars */}
                {timelineBuckets.length > 0 && (
                    <div className="flex items-end gap-[2px] h-6 w-full mb-1 opacity-70 px-1">
                        {timelineBuckets.map((bucket, idx) => {
                            const heightPct = Math.max((bucket.count / maxBucketCount) * 100, 10);
                            const hasAnomalies = bucket.anomalies > 0;
                            return (
                                <div
                                    key={idx}
                                    style={{ height: `${heightPct}%` }}
                                    className={`flex-1 rounded-t-sm transition-all ${
                                        hasAnomalies
                                            ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]'
                                            : 'bg-cyan-500/50 hover:bg-cyan-400'
                                    }`}
                                    title={`${bucket.count} events (${bucket.anomalies} threats) at ${bucket.timestamp}`}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Range Slider */}
                <input
                    type="range"
                    min={minTime}
                    max={maxTime}
                    value={effectiveTime}
                    onChange={(e) => setPlaybackTime(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
                />

                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span>{formatTime(minTime)}</span>
                    <span>{formatTime(maxTime)}</span>
                </div>
            </div>
        </div>
    );
}
