import { useState, useEffect } from 'react';
import { SYSTEM_MODULES } from '../types/modules';
import { useConnectionStore } from '../stores/connectionStore';
import { getEventModuleId, isSampleEvent } from '../utils/nestedConnections';
import {
    SalesforceConfigModal,
    sfApiFetch,
    type SalesforceConnectorStatus,
} from './SalesforceConfigModal';
import {
    Monitor,
    Cloud,
    Users,
    Laptop,
    Server,
    Layers,
    Globe,
    Table,
    Download,
    Trash2,
    Database,
    Settings,
    RefreshCw,
} from 'lucide-react';

function getModuleIcon(id: string) {
    switch (id) {
        case 'windows': return Monitor;
        case 'macos': return Laptop;
        case 'salesforce': return Cloud;
        case 'hris': return Users;
        case 'cloud': return Server;
        case 'aws': return Server;
        default: return Layers;
    }
}

function ModuleIcon({ id, className }: { id: string; className?: string }) {
    const Icon = getModuleIcon(id);
    return <Icon className={className} />;
}

export function ModulesView() {
    const {
        activeModule,
        setActiveModule,
        setActiveView,
        events,
        layoutTheme,
        sampleLoadedModules,
        ingestSampleModule,
        clearSampleModule,
    } = useConnectionStore();

    const [selectedTab, setSelectedTab] = useState<'all' | 'installed' | 'available' | 'coming_soon'>('all');
    const [selectedModuleId, setSelectedModuleId] = useState<string>('windows');
    const [sfModalOpen, setSfModalOpen] = useState(false);
    const [sfStatus, setSfStatus] = useState<SalesforceConnectorStatus | null>(null);

    useEffect(() => {
        sfApiFetch('/api/connectors/salesforce/status')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data) setSfStatus(data);
            })
            .catch(() => {});
    }, []);

    // Interactive module configuration toggles
    const [configToggles, setConfigToggles] = useState<Record<string, { socketPolling: boolean; remediation: boolean; dnsCapture: boolean; auditLog: boolean }>>({
        windows: { socketPolling: true, remediation: true, dnsCapture: true, auditLog: true },
        salesforce: { socketPolling: false, remediation: false, dnsCapture: true, auditLog: true },
        hris: { socketPolling: false, remediation: false, dnsCapture: false, auditLog: true },
        aws: { socketPolling: true, remediation: false, dnsCapture: true, auditLog: true },
        macos: { socketPolling: false, remediation: false, dnsCapture: false, auditLog: false },
        okta: { socketPolling: false, remediation: false, dnsCapture: true, auditLog: true },
    });

    const toggleConfig = (modId: string, key: 'socketPolling' | 'remediation' | 'dnsCapture' | 'auditLog') => {
        setConfigToggles(prev => ({
            ...prev,
            [modId]: {
                ...prev[modId],
                [key]: !prev[modId]?.[key],
            },
        }));
    };

    // Filter modules based on tab
    const filteredModules = SYSTEM_MODULES.filter(m => {
        if (selectedTab === 'installed') return m.status === 'active' || m.status === 'connected';
        if (selectedTab === 'available') return m.status === 'standby';
        if (selectedTab === 'coming_soon') return m.status === 'preview';
        return true;
    });

    // Compute live event counts per module
    const getModuleEventCount = (modId: string) => {
        const normId = modId === 'aws' ? 'cloud' : modId;
        return events.filter((e) => getEventModuleId(e) === normId).length;
    };

    const getModuleSampleCount = (modId: string) => {
        const normId = modId === 'aws' ? 'cloud' : modId;
        return events.filter((e) => isSampleEvent(e, normId)).length;
    };

    // Helper to ingest or clear sample telemetry for any module
    const handleLoadSampleEvents = (moduleId: string) => {
        ingestSampleModule(moduleId);
    };

    const handleClearSampleEvents = (moduleId: string) => {
        const normId = moduleId === 'aws' ? 'cloud' : moduleId;
        clearSampleModule(normId);
        if (activeModule === normId && normId !== 'windows' && !(normId === 'salesforce' && sfStatus?.connected)) {
            setActiveModule('all');
        }
    };

    const selectedMod = SYSTEM_MODULES.find(m => m.id === selectedModuleId) || SYSTEM_MODULES[0];
    const currentToggles = configToggles[selectedMod.id] || { socketPolling: true, remediation: true, dnsCapture: true, auditLog: true };

    // ─── OPTION A: 6-CARD FLAT HAIRLINE GRID (Exact Match to Option A Mockup) ───
    if (layoutTheme === 'a') {
        const optionAModules = [
            {
                id: 'windows',
                title: 'Windows',
                statusBadge: 'Installed',
                statusColor: 'var(--color-status-ok)',
                description: 'Collect and analyze native Windows Event Logs',
                meta: 'v1.4 | 1,284 events/min',
                actionLabel: activeModule === 'windows' ? 'Active' : 'Configure',
                icon: Monitor,
            },
            {
                id: 'macos',
                title: 'macOS',
                statusBadge: 'Coming soon',
                statusColor: 'var(--color-text-muted)',
                description: 'Native support for macOS system and audit trails',
                meta: 'v0.9 | Standby',
                actionLabel: 'Preview',
                icon: Laptop,
            },
            {
                id: 'salesforce',
                title: 'Salesforce',
                statusBadge: sfStatus?.connected ? 'Installed' : 'Available',
                statusColor: 'var(--color-status-ok)',
                description: sfStatus?.connected
                    ? `Connected to ${sfStatus.org_name || 'Tenant'} (${sfStatus.instance_url})`
                    : 'Pull critical CRM security, LoginHistory, and Event Monitoring logs',
                meta: sfStatus?.connected
                    ? `v1.1 | ${sfStatus.total_ingested} events`
                    : 'v1.1 | Ready',
                actionLabel: sfStatus?.connected ? 'Configure / Sync' : 'Connect Tenant',
                icon: Cloud,
            },
            {
                id: 'hris',
                title: 'HRIS - Workday',
                statusBadge: 'Available',
                statusColor: 'var(--color-status-ok)',
                description: 'Integrate employee lifecycle events with security',
                meta: 'v1.0 | Ready',
                actionLabel: sampleLoadedModules['hris'] ? 'Ingested' : 'Connect',
                icon: Users,
            },
            {
                id: 'cloud',
                title: 'AWS Cloud',
                statusBadge: 'Available',
                statusColor: 'var(--color-status-ok)',
                description: 'Continuous integration of CloudTrail events',
                meta: 'v0.8 | Ready',
                actionLabel: 'Connect',
                icon: Server,
            },
            {
                id: 'okta',
                title: 'Okta Identity',
                statusBadge: 'Coming soon',
                statusColor: 'var(--color-text-muted)',
                description: 'Aggregate and monitor Okta user authentication events',
                meta: 'Planned',
                actionLabel: 'Soon',
                icon: Layers,
            },
        ];

        return (
            <div className="w-full h-full flex flex-col overflow-y-auto p-4 gap-4">
                {/* Header Row: Title & Filter */}
                <div className="flex items-center justify-between shrink-0">
                    <h2 className="text-base font-bold font-mono tracking-wider" style={{ color: 'var(--color-text-primary)' }}>
                        Plugin Modules
                    </h2>

                    <div
                        role="tablist"
                        className="flex items-center gap-1 p-1 rounded-lg border text-xs font-mono"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            borderColor: 'var(--color-border)',
                        }}
                    >
                        {['all', 'installed', 'available'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setSelectedTab(tab as any)}
                                className="px-3 py-1 rounded capitalize transition"
                                style={{
                                    backgroundColor: selectedTab === tab ? 'var(--color-accent)' : 'transparent',
                                    color: selectedTab === tab ? '#ffffff' : 'var(--color-text-secondary)',
                                    fontWeight: selectedTab === tab ? 600 : 400,
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 6-Card Grid matching Mockup A */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {optionAModules.map(mod => {
                        const Icon = mod.icon;
                        const isInstalled = mod.statusBadge === 'Installed';
                        const isComingSoon = mod.statusBadge === 'Coming soon';

                        return (
                            <div
                                key={mod.id}
                                className="rounded-xl border p-4 flex flex-col justify-between transition-all hover:border-zinc-700 min-h-[170px]"
                                style={{
                                    backgroundColor: 'var(--color-bg-card)',
                                    borderColor: 'var(--color-border)',
                                }}
                            >
                                {/* Top: Icon & Status Badge */}
                                <div className="flex items-start justify-between">
                                    <div
                                        className="w-10 h-10 rounded-lg border flex items-center justify-center shrink-0"
                                        style={{
                                            backgroundColor: 'var(--color-bg-secondary)',
                                            borderColor: 'var(--color-border)',
                                            color: 'var(--color-text-primary)',
                                        }}
                                    >
                                        <Icon className="w-5 h-5 opacity-90" />
                                    </div>

                                    <span
                                        className="text-[10px] font-mono px-2 py-0.5 rounded-full border font-semibold"
                                        style={{
                                            backgroundColor: isInstalled ? 'rgba(34, 197, 94, 0.12)' : 'var(--color-bg-secondary)',
                                            borderColor: isInstalled ? 'var(--color-status-ok)' : 'var(--color-border)',
                                            color: mod.statusColor,
                                        }}
                                    >
                                        {mod.statusBadge}
                                    </span>
                                </div>

                                {/* Title & Description */}
                                <div className="flex flex-col gap-1 my-3">
                                    <h3 className="font-bold text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>
                                        {mod.title}
                                    </h3>
                                    <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
                                        {mod.description}
                                    </p>
                                </div>

                                {/* Footer Row */}
                                <div className="flex items-center justify-between pt-3 border-t text-xs font-mono gap-2" style={{ borderColor: 'var(--color-border-hairline)' }}>
                                    <span className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                                        {mod.meta}
                                    </span>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            onClick={() => handleLoadSampleEvents(mod.id)}
                                            className="px-2 py-1 rounded text-[10px] font-mono font-medium border transition hover:opacity-90 flex items-center gap-1"
                                            style={{
                                                backgroundColor: 'var(--color-accent-subtle)',
                                                borderColor: 'var(--color-accent-border)',
                                                color: 'var(--color-accent)',
                                            }}
                                            title="Ingest Sample Telemetry"
                                        >
                                            <Download className="w-3 h-3" />
                                            <span>{getModuleSampleCount(mod.id) > 0 ? 'Re-Ingest' : 'Ingest Sample'}</span>
                                        </button>
                                        {getModuleSampleCount(mod.id) > 0 && (
                                            <button
                                                onClick={() => handleClearSampleEvents(mod.id)}
                                                className="px-2 py-1 rounded text-[10px] font-mono font-medium border border-rose-500/40 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20 flex items-center gap-1"
                                                title="Clear Sample Telemetry"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                <span>Clear</span>
                                            </button>
                                        )}
                                        {!isComingSoon && (
                                            <button
                                                onClick={() => {
                                                    if (mod.id === 'salesforce') {
                                                        setSfModalOpen(true);
                                                        setActiveModule('salesforce');
                                                        return;
                                                    }
                                                    setActiveModule(mod.id);
                                                }}
                                                className="px-2.5 py-1 rounded text-[10px] font-mono font-medium border transition hover:opacity-90"
                                                style={{
                                                    backgroundColor: 'var(--color-bg-secondary)',
                                                    borderColor: 'var(--color-border)',
                                                    color: 'var(--color-text-primary)',
                                                }}
                                            >
                                                {mod.actionLabel}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <SalesforceConfigModal
                    isOpen={sfModalOpen}
                    onClose={() => setSfModalOpen(false)}
                    onStatusUpdate={setSfStatus}
                />
            </div>
        );
    }

    // ─── OPTION B & C: MASTER-DETAIL CONSOLE TABLE + DRAWER ───────────────────
    return (
        <div className="w-full h-full flex flex-col overflow-hidden p-4 gap-3">
            {/* Top Bar: Header & Segmented Filter Tabs */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-sm font-bold font-mono uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>
                        Sources &amp; Modules
                    </h2>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                        Modular Telemetry Plugins &amp; Connectors
                    </span>
                </div>

                {/* Filter Tabs */}
                <div
                    role="tablist"
                    aria-label="Module Filter Tabs"
                    className="flex items-center gap-1 p-1 rounded-lg border"
                    style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    {[
                        { id: 'installed' as const, label: 'Installed (2)' },
                        { id: 'available' as const, label: 'Available (4)' },
                        { id: 'coming_soon' as const, label: 'Coming soon' },
                        { id: 'all' as const, label: 'All Sources' },
                    ].map(tab => {
                        const isSelected = selectedTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                role="tab"
                                aria-selected={isSelected}
                                onClick={() => setSelectedTab(tab.id)}
                                className="px-3 py-1 text-xs font-mono font-medium rounded transition-all"
                                style={{
                                    backgroundColor: isSelected ? 'var(--color-accent)' : 'transparent',
                                    color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                                    fontWeight: isSelected ? 600 : 500,
                                }}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Master-Detail Split Screen */}
            <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
                {/* Left Column: Sources Table */}
                <div
                    className="flex-1 min-w-0 h-full overflow-y-auto rounded-xl border flex flex-col"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    <div
                        className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_4rem_5rem] px-4 py-2.5 text-[10px] font-mono uppercase font-semibold border-b shrink-0"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-muted)',
                        }}
                    >
                        <span>Module</span>
                        <span>Type</span>
                        <span>Status</span>
                        <span>Events</span>
                        <span>Last Sync</span>
                        <span>Version</span>
                        <span className="text-right">Action</span>
                    </div>

                    <div className="divide-y overflow-y-auto" style={{ borderColor: 'var(--color-border-hairline)' }}>
                        {filteredModules.map((mod) => {
                            const isSelected = selectedModuleId === mod.id;
                            const isActiveScope = activeModule === mod.id;
                            const Icon = getModuleIcon(mod.id);
                            const eventCount = getModuleEventCount(mod.id);

                            return (
                                <div
                                    key={mod.id}
                                    onClick={() => setSelectedModuleId(mod.id)}
                                    className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_4rem_5rem] items-center px-4 py-3 text-xs font-mono cursor-pointer transition-colors"
                                    style={{
                                        backgroundColor: isSelected ? 'var(--color-accent-subtle)' : 'transparent',
                                        borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
                                    }}
                                >
                                    <div className="flex items-center gap-2.5 truncate pr-2">
                                        <div
                                            className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0"
                                            style={{
                                                backgroundColor: 'var(--color-bg-secondary)',
                                                borderColor: 'var(--color-border)',
                                                color: 'var(--color-accent)',
                                            }}
                                        >
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col truncate">
                                            <span className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                                                {mod.name}
                                            </span>
                                            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                {mod.shortName}
                                            </span>
                                        </div>
                                    </div>

                                    <span className="capitalize" style={{ color: 'var(--color-text-secondary)' }}>
                                        {mod.category}
                                    </span>

                                    <div className="flex items-center gap-1.5">
                                        <span
                                            className="w-2 h-2 rounded-full"
                                            style={{
                                                backgroundColor:
                                                    mod.status === 'active'
                                                        ? 'var(--color-status-ok)'
                                                        : mod.status === 'connected'
                                                        ? 'var(--color-accent)'
                                                        : mod.status === 'standby'
                                                        ? 'var(--color-status-warn)'
                                                        : 'var(--color-text-muted)',
                                            }}
                                        />
                                        <span
                                            className="capitalize text-[11px]"
                                            style={{
                                                color: mod.status === 'active' ? 'var(--color-status-ok)' : 'var(--color-text-secondary)',
                                            }}
                                        >
                                            {mod.status === 'active' ? 'Healthy' : mod.status}
                                        </span>
                                    </div>

                                    <span style={{ color: 'var(--color-text-primary)' }}>
                                        {eventCount.toLocaleString()}
                                    </span>

                                    <span style={{ color: 'var(--color-text-muted)' }}>
                                        {mod.id === 'salesforce' && sfStatus?.connected
                                            ? sfStatus.polling
                                                ? `Live (${sfStatus.poll_interval}s)`
                                                : 'Connected'
                                            : mod.status === 'active'
                                            ? 'Live (2s)'
                                            : '—'}
                                    </span>

                                    <span style={{ color: 'var(--color-text-muted)' }}>
                                        {mod.version}
                                    </span>

                                    <div className="text-right">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveModule(isActiveScope ? 'all' : mod.id);
                                            }}
                                            className="px-2.5 py-1 rounded text-[10px] font-mono border transition"
                                            style={{
                                                backgroundColor: isActiveScope ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                                                borderColor: 'var(--color-border)',
                                                color: isActiveScope ? '#ffffff' : 'var(--color-accent-text)',
                                            }}
                                        >
                                            {isActiveScope ? 'Active' : 'Scope'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right Column: Selected Module Details & Configuration Drawer */}
                <div
                    className="w-80 shrink-0 rounded-xl border p-4 flex flex-col gap-4 overflow-y-auto"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <div
                            className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
                            style={{
                                backgroundColor: 'var(--color-accent-subtle)',
                                borderColor: 'var(--color-accent-border)',
                                color: 'var(--color-accent)',
                            }}
                        >
                            <ModuleIcon id={selectedMod.id} className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-mono uppercase" style={{ color: 'var(--color-text-muted)' }}>
                                Selected Module
                            </span>
                            <h3 className="text-sm font-bold font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>
                                {selectedMod.name}
                            </h3>
                        </div>
                    </div>

                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {selectedMod.description}
                    </p>

                    {/* Live Salesforce Tenant Connection Card */}
                    {selectedMod.id === 'salesforce' && (
                        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-mono uppercase font-bold text-sky-300 flex items-center gap-1.5">
                                    <Cloud className="w-3.5 h-3.5" />
                                    {sfStatus?.connected ? sfStatus.org_name || 'Connected Tenant' : 'Salesforce Tenant Auth'}
                                </span>
                                <span
                                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border font-semibold ${
                                        sfStatus?.connected
                                            ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}
                                >
                                    {sfStatus?.connected ? (sfStatus.polling ? 'LIVE POLLING' : 'CONNECTED') : 'NOT CONFIGURED'}
                                </span>
                            </div>

                            {sfStatus?.connected ? (
                                <div className="text-[10.5px] font-mono text-slate-300 space-y-0.5">
                                    <div className="truncate text-sky-200">{sfStatus.instance_url}</div>
                                    <div className="text-slate-400">
                                        User: <span className="text-slate-200">{sfStatus.username}</span> ·{' '}
                                        <span className="text-emerald-300">{sfStatus.total_ingested} evts</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[10.5px] font-mono text-slate-400 leading-snug">
                                    Connect your live Salesforce org via Username/Password (SOAP/OAuth), Access Token, or Salesforce CLI.
                                </p>
                            )}

                            <button
                                onClick={() => setSfModalOpen(true)}
                                className="w-full py-1.5 px-3 rounded-lg text-xs font-mono font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40 flex items-center justify-center gap-1.5 transition"
                            >
                                <Settings className="w-3.5 h-3.5" />
                                <span>{sfStatus?.connected ? 'Tenant Settings & Sync' : 'Connect Salesforce Tenant'}</span>
                            </button>
                        </div>
                    )}

                    {/* Data Sources In Use */}
                    <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase font-semibold tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                <Database className="w-3 h-3 text-cyan-400" />
                                Data Sources ({selectedMod.dataSources?.length || 0})
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-800/40">
                                Ingest Stream
                            </span>
                        </div>

                        <div className="flex flex-col gap-2">
                            {(selectedMod.dataSources || []).map((ds) => {
                                const isDsActive = ds.status === 'active';
                                const isDsConnected = ds.status === 'connected';
                                return (
                                    <div
                                        key={ds.id}
                                        className="p-2.5 rounded-lg border flex flex-col gap-1.5 transition-all hover:border-slate-600/60"
                                        style={{
                                            backgroundColor: 'var(--color-bg-secondary)',
                                            borderColor: 'var(--color-border)',
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-1.5">
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[11px] font-mono font-bold truncate text-slate-100" title={ds.name}>
                                                    {ds.name}
                                                </span>
                                                <span className="text-[9.5px] font-mono text-cyan-400/90 truncate">
                                                    {ds.type} {ds.protocol ? `· ${ds.protocol}` : ''}
                                                </span>
                                            </div>
                                            <span
                                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border shrink-0 font-semibold uppercase flex items-center gap-1 ${
                                                    isDsActive
                                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                                        : isDsConnected
                                                        ? 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                                                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                                }`}
                                            >
                                                <span
                                                    className={`w-1.5 h-1.5 rounded-full ${
                                                        isDsActive
                                                            ? 'bg-emerald-400 animate-pulse'
                                                            : isDsConnected
                                                            ? 'bg-sky-400'
                                                            : 'bg-amber-400'
                                                    }`}
                                                />
                                                {ds.status}
                                            </span>
                                        </div>

                                        <p className="text-[10.5px] leading-relaxed font-sans" style={{ color: 'var(--color-text-secondary)' }}>
                                            {ds.description}
                                        </p>

                                        {ds.frequency && (
                                            <div className="flex items-center justify-between text-[9px] font-mono pt-1 border-t" style={{ borderColor: 'var(--color-border-hairline)', color: 'var(--color-text-muted)' }}>
                                                <span>Cadence:</span>
                                                <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{ds.frequency}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Configuration Toggles */}
                    <div className="flex flex-col gap-2.5 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="text-[10px] font-mono uppercase font-semibold tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                            Configuration Toggles
                        </span>

                        {[
                            { key: 'socketPolling' as const, label: 'Socket Polling' },
                            { key: 'remediation' as const, label: 'Remediation Actions' },
                            { key: 'dnsCapture' as const, label: 'DNS Capture' },
                            { key: 'auditLog' as const, label: 'Audit Logging' },
                        ].map(toggle => {
                            const isEnabled = currentToggles[toggle.key];
                            return (
                                <div key={toggle.key} className="flex items-center justify-between text-xs font-mono">
                                    <span style={{ color: 'var(--color-text-secondary)' }}>{toggle.label}</span>
                                    <button
                                        onClick={() => toggleConfig(selectedMod.id, toggle.key)}
                                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold transition"
                                        style={{
                                            backgroundColor: isEnabled ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                                            borderColor: isEnabled ? 'var(--color-accent)' : 'var(--color-border)',
                                            color: isEnabled ? '#ffffff' : 'var(--color-text-muted)',
                                        }}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-white' : 'bg-slate-500'}`} />
                                        <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 pt-3 border-t mt-auto" style={{ borderColor: 'var(--color-border)' }}>
                        {selectedMod.id === 'salesforce' && (
                            <button
                                onClick={() => setSfModalOpen(true)}
                                className="w-full py-1.5 px-3 rounded-lg text-xs font-mono font-semibold border flex items-center justify-center gap-1.5 transition bg-sky-500/15 border-sky-400/40 text-sky-300 hover:bg-sky-500/25"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>{sfStatus?.connected ? 'Configure & Sync Tenant' : 'Connect Live Salesforce Tenant'}</span>
                            </button>
                        )}

                        {/* Sample Data Controls available on ALL modules */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => handleLoadSampleEvents(selectedMod.id)}
                                className="py-1.5 px-2.5 rounded-lg text-[11px] font-mono font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90 cursor-pointer"
                                style={{
                                    backgroundColor: 'var(--color-accent-subtle)',
                                    borderColor: 'var(--color-accent-border)',
                                    color: 'var(--color-accent)',
                                }}
                                title={`Ingest sample events for ${selectedMod.name}`}
                            >
                                <Download className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">
                                    {getModuleSampleCount(selectedMod.id) > 0
                                        ? `Ingested (${getModuleSampleCount(selectedMod.id)})`
                                        : 'Ingest Sample'}
                                </span>
                            </button>

                            <button
                                onClick={() => handleClearSampleEvents(selectedMod.id)}
                                disabled={getModuleSampleCount(selectedMod.id) === 0}
                                className="py-1.5 px-2.5 rounded-lg text-[11px] font-mono font-semibold border flex items-center justify-center gap-1.5 transition border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                                title={`Clear sample events for ${selectedMod.name}`}
                            >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Clear Sample</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => {
                                    setActiveModule(selectedMod.id);
                                    setActiveView('globe');
                                }}
                                className="py-1.5 px-2 rounded-lg text-xs font-mono border flex items-center justify-center gap-1.5 hover:opacity-90 transition"
                                style={{
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                }}
                            >
                                <Globe className="w-3.5 h-3.5" />
                                <span>Globe</span>
                            </button>
                            <button
                                onClick={() => {
                                    setActiveModule(selectedMod.id);
                                    setActiveView('table');
                                }}
                                className="py-1.5 px-2 rounded-lg text-xs font-mono border flex items-center justify-center gap-1.5 hover:opacity-90 transition"
                                style={{
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                }}
                            >
                                <Table className="w-3.5 h-3.5" />
                                <span>Grid</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <SalesforceConfigModal
                isOpen={sfModalOpen}
                onClose={() => setSfModalOpen(false)}
                onStatusUpdate={setSfStatus}
            />
        </div>
    );
}
