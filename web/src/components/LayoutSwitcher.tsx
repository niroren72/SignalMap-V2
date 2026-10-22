import { useConnectionStore } from '../stores/connectionStore';
import { Terminal, ShieldAlert } from 'lucide-react';

export function LayoutSwitcher() {
    const { layoutTheme, setLayoutTheme } = useConnectionStore();

    const isOptionA = layoutTheme === 'a';
    const isOptionC = layoutTheme === 'c';

    return (
        <div
            role="radiogroup"
            aria-label="UI Layout Theme Switcher"
            className="flex items-center gap-1 p-0.5 rounded-lg border transition-colors shadow-sm"
            style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
            }}
        >
            {/* Option A Toggle Button */}
            <button
                type="button"
                role="radio"
                aria-checked={isOptionA}
                title="Option A: Plasma Minimal — Hairline borders, slim icon rail, clean 6-card modules"
                onClick={() => setLayoutTheme('a')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-all duration-150 ${
                    isOptionA
                        ? 'shadow-sm font-semibold'
                        : 'hover:opacity-90 opacity-60'
                }`}
                style={{
                    backgroundColor: isOptionA ? 'var(--color-accent)' : 'transparent',
                    color: isOptionA ? '#ffffff' : 'var(--color-text-primary)',
                }}
            >
                <Terminal className="w-3.5 h-3.5" />
                <span className="font-mono font-bold text-[11px]">A</span>
                <span className="text-[11px] hidden sm:inline">Minimal</span>
            </button>

            {/* Option C Toggle Button */}
            <button
                type="button"
                role="radio"
                aria-checked={isOptionC}
                title="Option C: CyFocus Ops Console — High-density telemetry, master-detail drawer, SOC cyber precision"
                onClick={() => setLayoutTheme('c')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-all duration-150 ${
                    isOptionC
                        ? 'shadow-sm font-semibold'
                        : 'hover:opacity-90 opacity-60'
                }`}
                style={{
                    backgroundColor: isOptionC ? 'var(--color-accent)' : 'transparent',
                    color: isOptionC ? '#ffffff' : 'var(--color-text-primary)',
                }}
            >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="font-mono font-bold text-[11px]">C</span>
                <span className="text-[11px] hidden sm:inline">Ops Console</span>
            </button>
        </div>
    );
}

