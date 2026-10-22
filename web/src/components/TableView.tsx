import { ConnectionTable } from './ConnectionTable';
import { useConnectionStore } from '../stores/connectionStore';
import { Radio, ShieldAlert, Cpu, Globe } from 'lucide-react';

export function TableView() {
    const { events } = useConnectionStore();
    const anomalies = events.filter((e) => e.anomaly?.is_anomaly);

    const distinctProcesses = new Set(
        events.map((e) => e.local?.process_name).filter((p): p is string => Boolean(p))
    ).size;

    const distinctCountries = new Set(
        events.map((e) => e.geo?.country).filter((c): c is string => Boolean(c))
    ).size;

    return (
        <div
            className="w-full h-full pt-3 pb-3 px-4 flex flex-col gap-3 overflow-hidden animate-fade-in box-border"
            style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
        >
            {/* Quick Metrics Bar at top of Table View */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                <div
                    className="glass-card p-3.5 flex items-center justify-between transition-all hover:border-slate-600/50"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    <div>
                        <span className="text-[11px] font-medium text-slate-400">
                            Active Sockets
                        </span>
                        <div className="text-2xl font-bold font-sans text-white tracking-tight mt-0.5">
                            {events.length}
                        </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-slate-300">
                        <Radio className="w-4 h-4 text-sky-400" />
                    </div>
                </div>

                <div
                    className="glass-card p-3.5 flex items-center justify-between transition-all hover:border-slate-600/50"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    <div>
                        <span className="text-[11px] font-medium text-slate-400">
                            Threat Signals
                        </span>
                        <div className="text-2xl font-bold font-sans text-white tracking-tight mt-0.5">
                            {anomalies.length}
                        </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                    </div>
                </div>

                <div
                    className="glass-card p-3.5 flex items-center justify-between transition-all hover:border-slate-600/50"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    <div>
                        <span className="text-[11px] font-medium text-slate-400">
                            Processes
                        </span>
                        <div className="text-2xl font-bold font-sans text-white tracking-tight mt-0.5">
                            {distinctProcesses}
                        </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <Cpu className="w-4 h-4 text-emerald-400" />
                    </div>
                </div>

                <div
                    className="glass-card p-3.5 flex items-center justify-between transition-all hover:border-slate-600/50"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    <div>
                        <span className="text-[11px] font-medium text-slate-400">
                            Countries
                        </span>
                        <div className="text-2xl font-bold font-sans text-white tracking-tight mt-0.5">
                            {distinctCountries}
                        </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-slate-300">
                        <Globe className="w-4 h-4 text-amber-400" />
                    </div>
                </div>
            </div>

            {/* Embedded Full Data Grid */}
            <div className="flex-1 min-h-0 flex flex-col">
                <ConnectionTable />
            </div>
        </div>
    );
}
