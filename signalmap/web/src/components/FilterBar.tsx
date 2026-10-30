import { useState } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import type { Protocol, ServiceCategory, Severity } from '@shared/types';
import { Search, X, Download, ChevronDown, ShieldAlert, RotateCcw } from 'lucide-react';

export function FilterBar() {
    const {
        searchQuery,
        setSearchQuery,
        filters,
        setFilter,
        toggleAnomalyOnly,
        clearFilters,
        events,
    } = useConnectionStore();

    const [showExportMenu, setShowExportMenu] = useState(false);

    // Count anomalies in current dataset
    const anomalyCount = events.filter((e) => e.anomaly?.is_anomaly).length;

    const protocols: { label: string; value: Protocol | null; dotColor?: string }[] = [
        { label: 'ALL', value: null },
        { label: 'HTTPS', value: 'https', dotColor: 'var(--color-accent-cyan)' },
        { label: 'HTTP', value: 'http', dotColor: 'var(--color-accent-green)' },
        { label: 'TCP', value: 'tcp', dotColor: 'var(--color-accent-blue)' },
        { label: 'UDP', value: 'udp', dotColor: 'var(--color-accent-purple)' },
        { label: 'QUIC', value: 'quic', dotColor: '#c084fc' },
        { label: 'DNS', value: 'dns', dotColor: '#38bdf8' },
        { label: 'WS', value: 'ws', dotColor: 'var(--color-accent-orange)' },
        { label: 'WSS', value: 'wss', dotColor: 'var(--color-accent-pink)' },
        { label: 'NTP', value: 'ntp', dotColor: '#fbbf24' },
        { label: 'SSH', value: 'ssh', dotColor: '#f43f5e' },
        { label: 'RDP', value: 'rdp', dotColor: '#fb7185' },
        { label: 'SMB', value: 'smb', dotColor: '#f97316' },
    ];

    const getProtocolCount = (val: Protocol | null) => {
        if (val === null) return events.length;
        return events.filter((e) => e.protocol === val).length;
    };

    const categories: { label: string; value: ServiceCategory | null }[] = [
        { label: 'All Categories', value: null },
        { label: 'Developer', value: 'dev' },
        { label: 'Cloud Infra', value: 'cloud' },
        { label: 'CDN / Static', value: 'cdn' },
        { label: 'Comms & Chat', value: 'comms' },
        { label: 'Finance', value: 'finance' },
        { label: 'CRM', value: 'crm' },
        { label: 'Other', value: 'other' },
    ];

    const severities: { label: string; value: Severity | null }[] = [
        { label: 'All Severities', value: null },
        { label: 'Critical', value: 'critical' },
        { label: 'High', value: 'high' },
        { label: 'Medium', value: 'medium' },
        { label: 'Low', value: 'low' },
    ];

    const hasActiveFilters =
        searchQuery !== '' ||
        filters.protocol !== null ||
        filters.category !== null ||
        filters.anomalyOnly ||
        filters.severity !== null ||
        filters.direction !== null;

    const handleExport = (format: 'json' | 'csv') => {
        window.open(`/api/events/export?format=${format}&limit=5000`, '_blank');
        setShowExportMenu(false);
    };

    return (
        <div
            className="glass-card px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 transition-colors"
            style={{
                backgroundColor: 'var(--color-bg-card)',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--radius-card)',
            }}
        >
            {/* Left: Search input */}
            <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
                <div className="relative w-full">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none opacity-50" style={{ color: 'var(--color-text-secondary)' }}>
                        <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search process, IP, domain, city, ASN..."
                        className="w-full pl-9 pr-8 py-1.5 border rounded-lg text-xs font-mono transition-all focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-primary)',
                        }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 flex items-center pr-2.5 opacity-60 hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--color-text-muted)' }}
                            title="Clear search"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Middle: Protocol Pills */}
            <div
                className="flex items-center gap-0.5 p-0.5 rounded-lg border shadow-sm"
                style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                }}
            >
                {protocols.map((p) => {
                    const isSelected = filters.protocol === p.value;
                    const count = getProtocolCount(p.value);
                    return (
                        <button
                            key={p.label}
                            onClick={() => setFilter('protocol', p.value)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded transition-all"
                            style={{
                                backgroundColor: isSelected ? 'var(--color-accent)' : 'transparent',
                                color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                                fontWeight: isSelected ? 600 : 500,
                            }}
                        >
                            {p.dotColor && !isSelected && (
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.dotColor }} />
                            )}
                            <span>{p.label}</span>
                            {count > 0 && (
                                <span
                                    className="text-[9px] px-1 py-0.2 rounded font-mono opacity-80"
                                    style={{
                                        backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                                    }}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Category Dropdown */}
            <div className="flex items-center gap-2">
                <select
                    value={filters.category || ''}
                    onChange={(e) => setFilter('category', e.target.value || null)}
                    className="border text-xs rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer font-mono transition-colors"
                    style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                    }}
                >
                    {categories.map((c) => (
                        <option key={c.label} value={c.value || ''}>
                            {c.label}
                        </option>
                    ))}
                </select>

                {/* Threat / Anomaly Toggle */}
                <button
                    onClick={toggleAnomalyOnly}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        filters.anomalyOnly
                            ? 'bg-rose-500/20 border-rose-500/70 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                            : anomalyCount > 0
                            ? 'border-rose-500/40 text-rose-400 hover:border-rose-500/70'
                            : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{
                        backgroundColor: filters.anomalyOnly ? undefined : 'var(--color-bg-secondary)',
                        borderColor: filters.anomalyOnly ? undefined : anomalyCount > 0 ? undefined : 'var(--color-border)',
                        color: filters.anomalyOnly ? undefined : anomalyCount > 0 ? undefined : 'var(--color-text-secondary)',
                    }}
                >
                    <ShieldAlert className={`w-3.5 h-3.5 ${anomalyCount > 0 ? 'text-rose-400 animate-pulse' : ''}`} />
                    <span>Threats</span>
                    {anomalyCount > 0 && (
                        <span className="ml-1 px-1.5 py-0.2 bg-rose-500/25 text-rose-300 rounded-full text-[10px] font-bold border border-rose-500/40">
                            {anomalyCount}
                        </span>
                    )}
                </button>

                {/* Severity selector (shows when Anomaly filter is active) */}
                {filters.anomalyOnly && (
                    <select
                        value={filters.severity || ''}
                        onChange={(e) => setFilter('severity', e.target.value || null)}
                        className="bg-rose-950/40 border border-rose-500/50 text-xs text-rose-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-rose-400 cursor-pointer"
                    >
                        {severities.map((s) => (
                            <option key={s.label} value={s.value || ''}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Right: Export & Clear Filters */}
            <div className="flex items-center gap-2 ml-auto">
                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 px-2 py-1 transition-colors font-mono"
                    >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                    </button>
                )}

                {/* Export Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-mono font-medium transition-all hover:opacity-90"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-primary)',
                        }}
                        title="Export connection records"
                    >
                        <Download className="w-3.5 h-3.5 opacity-70" />
                        <span>Export</span>
                        <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>

                    {showExportMenu && (
                        <div
                            className="absolute right-0 mt-1 w-36 py-1 z-50 shadow-2xl border rounded-lg backdrop-blur-md animate-fade-in"
                            style={{
                                backgroundColor: 'var(--color-bg-card)',
                                borderColor: 'var(--color-border)',
                            }}
                        >
                            <button
                                onClick={() => handleExport('json')}
                                className="w-full text-left px-3 py-1.5 text-xs font-mono transition-colors opacity-80 hover:opacity-100 hover:bg-white/5"
                                style={{ color: 'var(--color-text-primary)' }}
                            >
                                Export JSON
                            </button>
                            <button
                                onClick={() => handleExport('csv')}
                                className="w-full text-left px-3 py-1.5 text-xs font-mono transition-colors opacity-80 hover:opacity-100 hover:bg-white/5"
                                style={{ color: 'var(--color-text-primary)' }}
                            >
                                Export CSV
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
