import { useWebSocket } from './hooks/useWebSocket';
import { useInitialEvents } from './hooks/useConnections';
import { useConnectionStore } from './stores/connectionStore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { GlobeView } from './components/GlobeView';
import { GraphView } from './components/GraphView';
import { TableView } from './components/TableView';
import { PlaybackView } from './components/PlaybackView';
import { LiveConnectionTable } from './components/LiveConnectionTable';
import { DetailPanel } from './components/DetailPanel';
import { SettingsModal } from './components/SettingsModal';
import { UploadModal } from './components/UploadModal';
import { NetworkUtils } from './components/NetworkUtils';
import { ModulesView } from './components/ModulesView';
import { DashboardView } from './components/DashboardView';

export default function App() {
    const { activeView, showUploadModal, setShowUploadModal, layoutTheme } = useConnectionStore();
    const loaded = useInitialEvents();
    useWebSocket();

    // Show a loading state until initial batch loads
    if (!loaded) {
        return (
            <div
                data-theme={layoutTheme}
                className="flex items-center justify-center min-h-screen w-full bg-[#070b12] text-slate-200"
            >
                <div className="font-mono text-sm font-medium flex items-center gap-3 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    Initializing SignalMap Aerospace Engine...
                </div>
            </div>
        );
    }

    return (
        <div
            data-theme={layoutTheme}
            className="flex min-h-screen w-full bg-[#070b12] text-slate-200 antialiased selection:bg-emerald-500/30 selection:text-emerald-200"
        >
            {/* BEGIN: LeftIconSidebar */}
            <Sidebar />

            {/* Main Content Wrapper */}
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
                {/* Header (MainHeader + SecondaryToolbar) */}
                <Header />

                {/* Filter bar (shown on data telemetry views only) */}
                {activeView !== 'dashboard' && activeView !== 'netutils' && activeView !== 'modules' && (
                    <div className="shrink-0 z-10 px-6 py-2 bg-[#090e18]/80 border-b border-white/5">
                        <FilterBar />
                    </div>
                )}

                {/* Main Viewport Content */}
                <div className="flex-1 min-h-0 relative flex flex-col">
                    {activeView === 'dashboard' && <DashboardView />}
                    {activeView === 'globe' && <GlobeView />}
                    {activeView === 'graph' && <GraphView />}
                    {activeView === 'table' && <TableView />}
                    {activeView === 'playback' && <PlaybackView />}
                    {activeView === 'netutils' && <NetworkUtils />}
                    {activeView === 'modules' && <ModulesView />}
                </div>

                {/* Docked Live Connection Table at bottom of 3D views */}
                {(activeView === 'globe' || activeView === 'graph') && <LiveConnectionTable />}

                {/* Slide-over Forensics & Threat Detail Panel */}
                <DetailPanel />
            </div>

            {/* Settings & Configuration Modal */}
            <SettingsModal />

            {/* Offline Log Importer Modal */}
            {showUploadModal && <UploadModal onClose={() => setShowUploadModal(false)} />}
        </div>
    );
}
