import { useConnectionStore, type ActiveViewType } from '../stores/connectionStore';

export function Sidebar() {
    const {
        activeView,
        setActiveView,
        setShowSettingsModal,
        events,
    } = useConnectionStore();

    const threatCount = events.filter((e) => e.anomaly?.is_anomaly).length;

    const navItems: Array<{
        id: ActiveViewType;
        title: string;
        renderIcon: (active: boolean) => React.ReactNode;
    }> = [
        {
            id: 'dashboard',
            title: 'Dashboard Overview',
            renderIcon: () => (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect height="7" rx="1.5" width="7" x="3" y="3" />
                    <rect height="7" rx="1.5" width="7" x="14" y="3" />
                    <rect height="7" rx="1.5" width="7" x="14" y="14" />
                    <rect height="7" rx="1.5" width="7" x="3" y="14" />
                </svg>
            ),
        },
        {
            id: 'globe',
            title: 'Global Orbit',
            renderIcon: () => (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" strokeLinecap="round" />
                </svg>
            ),
        },
        {
            id: 'graph',
            title: 'Topology Graph',
            renderIcon: () => (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="12" cy="18" r="3" />
                    <path d="M8.5 7.5L10 16m5.5-8.5L14 16" strokeLinecap="round" />
                </svg>
            ),
        },
        {
            id: 'table',
            title: 'Telemetry Stream',
            renderIcon: () => (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
        {
            id: 'playback',
            title: 'Audit Log Playback',
            renderIcon: () => (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
        {
            id: 'netutils',
            title: 'Security Diagnostics',
            renderIcon: () => (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
        {
            id: 'modules',
            title: 'Modules',
            renderIcon: () => (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
    ];

    return (
        <aside
            className="w-14 border-r border-white/5 bg-[#080d16] flex flex-col items-center py-3.5 justify-between z-30 shrink-0 h-screen sticky top-0"
            data-purpose="sidebar-nav"
        >
            <div className="flex flex-col items-center gap-5">
                {/* Brand Star Glyph */}
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-cyan-500 p-[1px] flex items-center justify-center shadow-lg shadow-emerald-500/20 group cursor-pointer"
                    title="SignalMap Telemetry & Observability"
                >
                    <div className="h-full w-full bg-[#090e18] rounded-[11px] flex items-center justify-center group-hover:bg-transparent transition-all duration-300">
                        <svg className="w-4.5 h-4.5 text-emerald-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                            <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </button>

                {/* Main Workspace Icons */}
                <nav className="flex flex-col items-center gap-2.5">
                    {navItems.map((item) => {
                        const isActive = activeView === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveView(item.id)}
                                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors relative cursor-pointer ${
                                    isActive
                                        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                }`}
                                title={item.title}
                            >
                                {item.renderIcon(isActive)}
                                {item.id === 'table' && threatCount > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Lower Utilities */}
            <div className="flex flex-col items-center gap-2.5">
                {/* Settings Button */}
                <button
                    onClick={() => setShowSettingsModal(true)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors cursor-pointer"
                    title="Settings"
                >
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                </button>

                {/* User Avatar */}
                <div
                    onClick={() => setShowSettingsModal(true)}
                    className="h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 p-[1px] cursor-pointer hover:scale-105 transition-transform"
                    title="User Session: Flight Engineer T"
                >
                    <div className="h-full w-full rounded-full bg-[#0a101b] flex items-center justify-center font-bold text-[11px] text-cyan-300">
                        T
                    </div>
                </div>
            </div>
        </aside>
    );
}
