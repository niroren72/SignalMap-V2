import { useMemo, useState, useEffect } from 'react';
import { useConnectionStore, type ActiveViewType } from '../stores/connectionStore';
import { SYSTEM_MODULES } from '../types/modules';
import { getEventModuleId, matchesModule } from '../utils/nestedConnections';
import { sfApiFetch } from './SalesforceConfigModal';
import { Binary } from 'lucide-react';

export function Header() {
    const {
        activeView,
        setActiveView,
        isLive,
        setIsLive,
        events,
        selectedId,
        setSelectedId,
        searchQuery,
        setSearchQuery,
        setShowUploadModal,
        setShowSettingsModal,
        activeModule,
        setActiveModule,
        sampleLoadedModules,
    } = useConnectionStore();

    const [isModuleDropdownOpen, setIsModuleDropdownOpen] = useState(false);
    const [copiedShare, setCopiedShare] = useState(false);
    const [sfConnected, setSfConnected] = useState(false);

    useEffect(() => {
        sfApiFetch('/api/connectors/salesforce/status')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data) setSfConnected(Boolean(data.connected));
            })
            .catch(() => {});
    }, [events.length, isModuleDropdownOpen]);

    // Count events per module and filter to ONLY connected / active modules
    const { connectedModules, moduleCounts } = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const e of events) {
            const modId = getEventModuleId(e);
            counts[modId] = (counts[modId] || 0) + 1;
        }

        const connected = SYSTEM_MODULES.filter((mod) => {
            if (mod.id === 'windows') return true; // Local Windows host collector is always connected
            if (mod.id === 'salesforce' && sfConnected) return true;
            if (sampleLoadedModules[mod.id]) return true;
            if ((counts[mod.id] || 0) > 0) return true;
            return false;
        });

        return { connectedModules: connected, moduleCounts: counts };
    }, [events, sfConnected, sampleLoadedModules]);

    // Calculate bandwidth in MB and anomalies scoped to the active module
    const { totalBytesIn, totalBytesOut, anomalyCount } = useMemo(() => {
        let inBytes = 0;
        let outBytes = 0;
        let anomalies = 0;

        for (const e of events) {
            if (!matchesModule(e, activeModule)) continue;
            inBytes += e.metrics?.bytes_in || 0;
            outBytes += e.metrics?.bytes_out || 0;
            if (e.anomaly?.is_anomaly) anomalies += 1;
        }

        return {
            totalBytesIn: (inBytes / (1024 * 1024)).toFixed(1),
            totalBytesOut: (outBytes / (1024 * 1024)).toFixed(1),
            anomalyCount: anomalies,
        };
    }, [events, activeModule]);

    const activeModObj = SYSTEM_MODULES.find((m) => m.id === activeModule);

    const handleShare = () => {
        navigator.clipboard?.writeText(window.location.href);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2000);
    };

    // Keyboard shortcut handler for ⌘K / Ctrl+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                const searchInput = document.querySelector<HTMLInputElement>('input[data-purpose="omnibar-search"]');
                if (searchInput) searchInput.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const viewTabs: Array<{
        id: ActiveViewType;
        label: string;
        renderIcon: (active: boolean) => React.ReactNode;
    }> = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            renderIcon: () => (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect height="7" width="7" x="3" y="3" />
                    <rect height="7" width="7" x="14" y="3" />
                    <rect height="7" width="7" x="14" y="14" />
                    <rect height="7" width="7" x="3" y="14" />
                </svg>
            ),
        },
        {
            id: 'globe',
            label: '3D Globe',
            renderIcon: () => (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                </svg>
            ),
        },
        {
            id: 'graph',
            label: 'Topology',
            renderIcon: () => (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="12" cy="18" r="3" />
                </svg>
            ),
        },
        {
            id: 'table',
            label: 'Telemetry Grid',
            renderIcon: () => (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
            ),
        },
        {
            id: 'playback',
            label: 'Playback',
            renderIcon: () => (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
        {
            id: 'netutils',
            label: 'Diagnostics',
            renderIcon: () => (
                <span className="font-mono text-xs">&gt;_</span>
            ),
        },
        {
            id: 'modules',
            label: 'Modules',
            renderIcon: () => (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
            ),
        },
    ];

    return (
        <div className="w-full shrink-0 select-none z-20">
            {/* ── BEGIN: MainHeader ──────────────────────────────────────── */}
            <header className="sticky top-0 z-20 border-b border-white/5 bg-[#080d16]/90 backdrop-blur-md px-5 py-2" data-purpose="primary-header">
                <div className="flex items-center justify-between gap-3">
                    {/* Left: Brand, Breadcrumb & Context */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveView('dashboard')}>
                            <span className="text-[15px] font-bold tracking-tight text-white flex items-center gap-1.5">
                                <span className="text-emerald-400">⚡</span> SignalMap
                            </span>
                        </div>

                        {/* Workspace breadcrumb dropdown (Connected Modules Only) */}
                        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 pl-2.5 border-l border-white/10 relative">
                            <button
                                onClick={() => setIsModuleDropdownOpen(!isModuleDropdownOpen)}
                                className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-md border border-white/10 hover:border-cyan-500/40 cursor-pointer transition-colors text-[11px]"
                                title="Switch Connected Telemetry Cluster"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                <span className="text-slate-200 font-medium">
                                    {activeModObj?.name
                                        ? `${activeModObj.name} Cluster`
                                        : `All Connected Clusters (${connectedModules.length})`}
                                </span>
                                <svg className="w-3 h-3 text-slate-400 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                                </svg>
                            </button>

                            {isModuleDropdownOpen && (
                                <div className="absolute left-2.5 top-7 mt-1 w-64 p-1.5 rounded-xl border border-white/10 bg-[#090f1a] shadow-2xl z-50 flex flex-col gap-0.5 backdrop-blur-xl">
                                    <div className="px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider text-slate-400 border-b border-white/5 mb-0.5 flex items-center justify-between">
                                        <span>Connected Clusters ({connectedModules.length})</span>
                                        <span className="text-emerald-400">● Online</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setActiveModule('all');
                                            if (activeView === 'modules' || activeView === 'netutils') {
                                                setActiveView('dashboard');
                                            }
                                            setIsModuleDropdownOpen(false);
                                        }}
                                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                                            activeModule === 'all'
                                                ? 'bg-emerald-500/15 text-emerald-400 font-semibold'
                                                : 'text-slate-300 hover:bg-white/5'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2 truncate">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                            <span className="truncate">All Connected Clusters</span>
                                        </span>
                                        <span className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                                {events.length}
                                            </span>
                                            {activeModule === 'all' && (
                                                <span className="text-emerald-400 font-bold">✓</span>
                                            )}
                                        </span>
                                    </button>
                                    {connectedModules.map((mod) => {
                                        const count = moduleCounts[mod.id] || 0;
                                        return (
                                            <button
                                                key={mod.id}
                                                onClick={() => {
                                                    setActiveModule(mod.id);
                                                    if (activeView === 'modules' || activeView === 'netutils') {
                                                        setActiveView('dashboard');
                                                    }
                                                    setIsModuleDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                                                    activeModule === mod.id
                                                        ? 'bg-emerald-500/15 text-emerald-400 font-semibold'
                                                        : 'text-slate-300 hover:bg-white/5'
                                                }`}
                                            >
                                                <span className="flex items-center gap-2 truncate">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                                                    <span className="truncate">{mod.name}</span>
                                                </span>
                                                <span className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                                                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                                        {count}
                                                    </span>
                                                    {activeModule === mod.id && (
                                                        <span className="text-emerald-400 font-bold">✓</span>
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    <div className="pt-1 mt-0.5 border-t border-white/5">
                                        <button
                                            onClick={() => {
                                                setActiveView('modules');
                                                setIsModuleDropdownOpen(false);
                                            }}
                                            className="w-full text-left px-2.5 py-1 rounded-lg text-[10.5px] font-mono text-cyan-400 hover:bg-cyan-500/10 transition-colors flex items-center justify-between"
                                        >
                                            <span>+ Manage / Connect Modules</span>
                                            <span>→</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center: Omnibar Search with Shortcut */}
                    <div className="flex-1 max-w-sm hidden lg:block">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                                </svg>
                            </div>
                            <input
                                data-purpose="omnibar-search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#0d1524] border border-white/10 text-[11px] rounded-lg pl-8 pr-12 py-1.5 text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                                placeholder="Search telemetry, IPs, processes, components, or ports..."
                                type="text"
                            />
                            <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                                <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded">
                                    ⌘K
                                </kbd>
                            </div>
                        </div>
                    </div>

                    {/* Right: System Live Stats & Global Actions */}
                    <div className="flex items-center gap-2.5">
                        {/* Realtime Telemetry Pulse Badge */}
                        <button
                            onClick={() => setIsLive(!isLive)}
                            className="flex items-center gap-1.5 bg-[#0c1626] border border-emerald-500/30 px-2.5 py-1 rounded-lg shadow-sm hover:border-emerald-500/50 transition-colors cursor-pointer"
                            title={isLive ? 'Live Streaming Active (Click to Pause)' : 'Paused (Click to Resume)'}
                        >
                            <span className="relative flex h-1.5 w-1.5">
                                {isLive && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                )}
                                <span
                                    className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                                        isLive ? 'bg-emerald-500' : 'bg-amber-400'
                                    }`}
                                />
                            </span>
                            <span className="text-[10px] font-bold text-emerald-400 tracking-wider font-mono">
                                {isLive ? 'LIVE' : 'PAUSED'}
                            </span>
                            {/* Bandwidth In/Out */}
                            <div className="hidden sm:flex items-center gap-2 border-l border-white/10 pl-2 text-[10px] font-mono text-slate-400">
                                <span className="flex items-center gap-0.5 text-slate-300">
                                    <span className="text-cyan-400">↓</span> {totalBytesIn} MB/s
                                </span>
                                <span className="flex items-center gap-0.5 text-slate-300">
                                    <span className="text-emerald-400">↑</span> {totalBytesOut} MB/s
                                </span>
                            </div>
                        </button>

                        {/* Notifications */}
                        <button
                            onClick={() => setActiveView('table')}
                            className="relative p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                            title={anomalyCount > 0 ? `${anomalyCount} Security Threat Signals Detected` : 'Zero Threat Signals Detected'}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            </svg>
                            <span
                                className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                                    anomalyCount > 0 ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
                                }`}
                            />
                        </button>

                        {/* Quick Export / Share */}
                        <button
                            onClick={handleShare}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors hidden sm:block cursor-pointer"
                            title={copiedShare ? 'Copied link to clipboard!' : 'Export telemetry stream'}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>
            {/* ── END: MainHeader ────────────────────────────────────────── */}

            {/* ── BEGIN: SecondaryToolbar ────────────────────────────────── */}
            <section className="border-b border-white/5 bg-[#0a101b] px-5 py-1.5" data-purpose="secondary-nav-toolbar">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* View Navigation Tabs */}
                    <nav className="flex items-center gap-1 text-[11px] font-medium overflow-x-auto pb-1 sm:pb-0" role="tablist">
                        {viewTabs.map((tab) => {
                            const isActive = activeView === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setActiveView(tab.id)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                                        isActive
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                                    }`}
                                >
                                    {tab.renderIcon(isActive)}
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </nav>

                    {/* Action Controls Group */}
                    <div className="flex items-center gap-2.5 ml-auto">
                        {/* Import Logs Button */}
                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-900 border border-white/10 rounded-lg hover:border-slate-600 transition-colors cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            </svg>
                            <span>Import Logs</span>
                        </button>

                        {/* Source Filter Dropdown */}
                        <div className="flex items-center bg-slate-900 border border-white/10 rounded-lg px-2 py-0.5 text-[11px] text-slate-300">
                            <span className="text-slate-400 uppercase text-[9.5px] tracking-wider font-semibold mr-1.5">Source:</span>
                            <select
                                value={activeModule}
                                onChange={(e) => setActiveModule(e.target.value)}
                                className="bg-transparent text-slate-200 font-medium border-0 p-0 text-[11px] focus:ring-0 cursor-pointer outline-none"
                            >
                                <option value="all" className="bg-slate-900 text-slate-200">All Sources</option>
                                <option value="windows" className="bg-slate-900 text-slate-200">Aerospace Sat-Link 01</option>
                                <option value="cloud" className="bg-slate-900 text-slate-200">Ground Station Node</option>
                                <option value="salesforce" className="bg-slate-900 text-slate-200">Edge Gateway</option>
                            </select>
                        </div>

                        {/* Deep Inspection Suite CTA */}
                        <button
                            onClick={() => {
                                if (selectedId) {
                                    setSelectedId(null);
                                } else {
                                    const pick = events[0]?.id || 'default-inspect-1';
                                    setSelectedId(pick);
                                }
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-sm ${
                                selectedId
                                    ? 'bg-cyan-500 text-white border-cyan-400 ring-2 ring-cyan-400/50 shadow-cyan-500/30'
                                    : 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/40 text-cyan-300'
                            }`}
                            title="Open Deep Data Inspection & Payload Suite"
                        >
                            <Binary className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{selectedId ? 'Close Inspect' : 'Inspect Suite'}</span>
                        </button>

                        {/* Primary Add Component CTA */}
                        <button
                            onClick={() => setShowSettingsModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 rounded-lg shadow-sm shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>Add Component</span>
                        </button>
                    </div>
                </div>
            </section>
            {/* ── END: SecondaryToolbar ──────────────────────────────────── */}
        </div>
    );
}
