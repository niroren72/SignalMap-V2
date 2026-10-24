import { useConnectionStore } from '../stores/connectionStore';
import {
    Settings,
    X,
    Radio,
    ShieldAlert,
    Sparkles,
    Activity,
    Palette,
    Check,
    Rocket,
} from 'lucide-react';
import { GLOBE_THEMES } from '../types/globeTheme';

export function SettingsModal() {
    const {
        showSettingsModal,
        setShowSettingsModal,
        settings,
        updateSettings,
        events,
        setEvents,
        isLive,
        setIsLive,
        globeTheme,
        setGlobeTheme,
        setShowLoadingScreen,
    } = useConnectionStore();

    if (!showSettingsModal) return null;

    const handleClearEvents = () => {
        if (confirm('Clear all in-memory events from the visualizer?')) {
            setEvents([]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in p-4">
            <div
                className="relative w-full max-w-2xl glass-card border shadow-2xl p-6 flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-modal-in"
                style={{
                    backgroundColor: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                            <Settings className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                                System & Engine Settings
                            </h2>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                Configure telemetry stream, threat thresholds, and visualization preferences
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowSettingsModal(false)}
                        className="w-8 h-8 rounded-lg border flex items-center justify-center opacity-70 hover:opacity-100 transition-colors"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-secondary)',
                        }}
                        title="Close Settings"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Section 1: Telemetry Stream & Polling */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-accent)' }}>
                        <Radio className="w-3.5 h-3.5" />
                        <span>Real-Time Stream & WebSocket</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Stream status */}
                        <div className="p-3.5 rounded-xl border flex flex-col gap-2" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>WebSocket Connection</span>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5 font-bold">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                    ws://localhost:8765/api/ws
                                </span>
                                <button
                                    onClick={() => setIsLive(!isLive)}
                                    className={`px-2.5 py-1 rounded text-xs font-semibold border transition ${
                                        isLive
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                    }`}
                                >
                                    {isLive ? 'Pause Stream' : 'Resume Stream'}
                                </button>
                            </div>
                        </div>

                        {/* Polling / Refresh rate selector */}
                        <div className="p-3.5 rounded-xl border flex flex-col gap-2" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Socket Polling Frequency</span>
                            <div className="flex items-center gap-1.5">
                                {[500, 1000, 2000, 5000].map((ms) => (
                                    <button
                                        key={ms}
                                        onClick={() => updateSettings({ refreshRateMs: ms })}
                                        className={`flex-1 py-1 rounded text-xs font-mono transition-all border ${
                                            settings.refreshRateMs === ms
                                                ? 'bg-cyan-600 text-white font-bold border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                                                : 'text-slate-400 hover:text-white border-transparent'
                                        }`}
                                        style={{
                                            backgroundColor: settings.refreshRateMs === ms ? undefined : 'var(--color-bg-tertiary)',
                                        }}
                                    >
                                        {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 2: Threat Detection & Anomaly Rules */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-mono font-bold uppercase text-rose-400 tracking-wider flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Security & Anomaly Thresholds</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Bandwidth Spike Alert Threshold */}
                        <div className="p-3.5 rounded-xl border flex flex-col gap-2" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                    Bandwidth Spike Alert
                                </span>
                                <span className="text-xs font-mono text-cyan-400 font-bold">
                                    &gt; {settings.alertBandwidthThresholdMB} MB
                                </span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={500}
                                step={10}
                                value={settings.alertBandwidthThresholdMB}
                                onChange={(e) =>
                                    updateSettings({
                                        alertBandwidthThresholdMB: Number(e.target.value),
                                    })
                                }
                                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                                style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                            />
                            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                Single connection transfers exceeding this trigger an anomaly alert.
                            </span>
                        </div>

                        {/* In-Memory Event Retention Buffer */}
                        <div className="p-3.5 rounded-xl border flex flex-col gap-2" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                    Event Buffer Retention
                                </span>
                                <span className="text-xs font-mono text-cyan-400 font-bold">
                                    {settings.maxEventsRetention} Sockets
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {[1000, 3000, 5000, 10000].map((count) => (
                                    <button
                                        key={count}
                                        onClick={() => updateSettings({ maxEventsRetention: count })}
                                        className={`flex-1 py-1 rounded text-xs font-mono transition-all border ${
                                            settings.maxEventsRetention === count
                                                ? 'bg-cyan-600 text-white font-bold border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                                                : 'text-slate-400 hover:text-white border-transparent'
                                        }`}
                                        style={{
                                            backgroundColor: settings.maxEventsRetention === count ? undefined : 'var(--color-bg-tertiary)',
                                        }}
                                    >
                                        {count >= 1000 ? `${count / 1000}k` : count}
                                    </button>
                                ))}
                            </div>
                            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                Bounded ring buffer protects browser heap memory.
                            </span>
                        </div>
                    </div>
                </div>

                {/* Section 3: Visual & 3D Render Preferences */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-mono font-bold uppercase text-teal-400 tracking-wider flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Visualizer & 3D Globe Theme</span>
                    </h3>

                    {/* Globe Themes Gallery */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            <span className="flex items-center gap-1.5">
                                <Palette className="w-3.5 h-3.5 text-cyan-400" />
                                <span>3D Globe Visual Style</span>
                            </span>
                            <span className="text-[10px] font-mono text-cyan-400">
                                {GLOBE_THEMES[globeTheme]?.name || 'Black Dots'} Active
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {Object.values(GLOBE_THEMES).map((theme) => {
                                const isSelected = theme.id === globeTheme;
                                return (
                                    <button
                                        key={theme.id}
                                        type="button"
                                        onClick={() => setGlobeTheme(theme.id)}
                                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                                            isSelected
                                                ? 'bg-cyan-950/60 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500'
                                                : 'hover:border-slate-600 border-transparent hover:opacity-95'
                                        }`}
                                        style={{
                                            backgroundColor: isSelected ? undefined : 'var(--color-bg-secondary)',
                                            borderColor: isSelected ? undefined : 'var(--color-border)',
                                        }}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex -space-x-1">
                                                <span
                                                    className="w-3.5 h-3.5 rounded-full ring-1 ring-black/40"
                                                    style={{ backgroundColor: theme.previewSwatches.dots }}
                                                    title="Land dots"
                                                />
                                                <span
                                                    className="w-3.5 h-3.5 rounded-full ring-1 ring-black/40"
                                                    style={{ backgroundColor: theme.previewSwatches.atmosphere }}
                                                    title="Atmosphere"
                                                />
                                                <span
                                                    className="w-3.5 h-3.5 rounded-full ring-1 ring-black/40"
                                                    style={{ backgroundColor: theme.previewSwatches.arc }}
                                                    title="Arc"
                                                />
                                            </div>
                                            {theme.badge && (
                                                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                                    {theme.badge}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-100">
                                                    {theme.name}
                                                </span>
                                                {isSelected && (
                                                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                                )}
                                            </div>
                                            <span className="text-[10px] leading-tight text-slate-400">
                                                {theme.description}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                        {/* Atmospheric Glow Toggle */}
                        <label className="p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition hover:opacity-95" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                            <div className="flex flex-col">
                                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                    Atmosphere Glow FX
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                    Render glowing atmospheric rim on 3D Globe
                                </span>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.enableAtmosphereGlow}
                                onChange={(e) =>
                                    updateSettings({ enableAtmosphereGlow: e.target.checked })
                                }
                                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 cursor-pointer"
                            />
                        </label>

                        {/* Globe Auto Rotation Toggle */}
                        <label className="p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition hover:opacity-95" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                            <div className="flex flex-col">
                                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                    Auto-Rotate 3D Globe
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                    Slowly spin Earth when idle
                                </span>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.autoRotateGlobe}
                                onChange={(e) =>
                                    updateSettings({ autoRotateGlobe: e.target.checked })
                                }
                                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 cursor-pointer"
                            />
                        </label>
                    </div>
                </div>

                {/* Section 4: Engine Health & Storage Diagnostics */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                        <Activity className="w-3.5 h-3.5" />
                        <span>Diagnostics & Buffer Controls</span>
                    </h3>
                    <div className="p-3.5 rounded-xl border flex items-center justify-between" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                In-Memory Events: <span className="text-cyan-400 font-mono font-bold">{events.length}</span>
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                Persistent SQLite database: <code className="opacity-80">data/events.db</code> (WAL Mode)
                            </span>
                        </div>
                        <button
                            onClick={handleClearEvents}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 text-xs font-semibold transition"
                        >
                            Flush Active Buffer
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t flex-wrap gap-2" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                            SignalMap Telemetry Engine • v0.3.0
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setShowSettingsModal(false);
                                setShowLoadingScreen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg border text-[11px] font-mono text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10 flex items-center gap-1.5 transition"
                            title="Replay the SignalMap Antigravity Launch Experience"
                        >
                            <Rocket className="w-3 h-3 text-cyan-400" />
                            <span>Replay Launch Screen</span>
                        </button>
                    </div>
                    <button
                        onClick={() => setShowSettingsModal(false)}
                        className="btn btn-active px-5 py-2 text-xs font-bold"
                    >
                        Save & Close
                    </button>
                </div>
            </div>
        </div>
    );
}
