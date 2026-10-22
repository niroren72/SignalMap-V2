import { useRef, useState, useCallback } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { UploadCloud, X, AlertTriangle, FileCode, CheckCircle2 } from 'lucide-react';

interface UploadResult {
    imported: number;
    skipped: number;
    duration_s: number;
    filename: string;
    parser: string;
}

interface UploadModalProps {
    onClose: () => void;
}

export function UploadModal({ onClose }: UploadModalProps) {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const setEvents = useConnectionStore((s) => s.setEvents);

    const handleFile = useCallback(async (file: File) => {
        setError(null);
        setResult(null);
        setUploading(true);
        setProgress(10);

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Animate progress while upload runs
            const ticker = setInterval(() => {
                setProgress((p) => Math.min(p + 8, 85));
            }, 200);

            const res = await fetch('http://localhost:8765/api/upload-log', {
                method: 'POST',
                body: formData,
            });

            clearInterval(ticker);
            setProgress(100);

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }

            const data: UploadResult = await res.json();
            setResult(data);

            // Refresh the event list from the backend
            const eventsRes = await fetch('http://localhost:8765/api/events?limit=500');
            if (eventsRes.ok) {
                const eventsData = await eventsRes.json();
                setEvents(eventsData.events);
            }
        } catch (err: unknown) {
            setError((err as Error).message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    }, [setEvents]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="w-full max-w-lg glass-card border shadow-2xl p-6 flex flex-col gap-5 animate-modal-in"
                style={{
                    backgroundColor: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold font-mono tracking-tight" style={{ color: 'var(--color-accent)' }}>
                            Import Telemetry Log File
                        </h2>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Nginx / Apache · JSON Lines · Windows Event Log (.evtx / .xml)
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg opacity-60 hover:opacity-100 transition"
                        style={{ backgroundColor: 'var(--color-bg-secondary)' }}
                        title="Close Modal"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Drop zone */}
                {!result && (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            relative flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed
                            cursor-pointer transition-all duration-200 p-8
                            ${dragging
                                ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                                : 'border-slate-700 hover:border-cyan-500/60 hover:bg-white/[0.02]'
                            }
                        `}
                    >
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-cyan-500/10 text-cyan-400 mb-1">
                            <UploadCloud className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            {dragging ? 'Drop file to parse' : 'Drag & drop a log file here'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            or click to browse filesystem
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".log,.txt,.jsonl,.ndjson,.json,.evtx,.xml,.access"
                            onChange={onInputChange}
                            className="hidden"
                        />
                    </div>
                )}

                {/* Progress bar */}
                {uploading && (
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            <span>Parsing & enriching telemetry...</span>
                            <span className="font-mono">{progress}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-200"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="rounded-lg bg-red-950/60 border border-red-500/50 px-4 py-3 text-xs text-red-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Success result */}
                {result && (
                    <div className="flex flex-col gap-4">
                        <div className="rounded-xl bg-emerald-950/50 border border-emerald-500/50 px-5 py-4 flex flex-col gap-2">
                            <div className="text-emerald-400 font-bold text-sm flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Import Complete & Synchronized
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs mt-1">
                                <span style={{ color: 'var(--color-text-muted)' }}>Imported</span>
                                <span className="font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{result.imported.toLocaleString()} events</span>
                                <span style={{ color: 'var(--color-text-muted)' }}>Skipped</span>
                                <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{result.skipped}</span>
                                <span style={{ color: 'var(--color-text-muted)' }}>Duration</span>
                                <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{result.duration_s}s</span>
                                <span style={{ color: 'var(--color-text-muted)' }}>Parser</span>
                                <span className="text-cyan-400 font-mono font-bold text-[11px]">{result.parser}</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setResult(null); setProgress(0); }}
                                className="flex-1 py-2 rounded-lg border text-xs font-semibold transition hover:opacity-90"
                                style={{
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-text-secondary)',
                                }}
                            >
                                Import Another
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition text-xs shadow-md"
                            >
                                View on Globe →
                            </button>
                        </div>
                    </div>
                )}

                {/* Supported sources info */}
                {!result && !uploading && (
                    <div className="rounded-lg border p-3.5 text-xs space-y-1.5" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        <div className="flex items-center gap-1.5 font-semibold text-xs mb-1" style={{ color: 'var(--color-text-primary)' }}>
                            <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Supported Telemetry Formats</span>
                        </div>
                        <p>• <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Event Viewer:</span> Security log → Event ID 5156 (WFP) → Export XML</p>
                        <p>• <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Sysmon:</span> Microsoft-Windows-Sysmon/Operational → Event ID 3 → Export XML</p>
                        <p>• <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Web Servers:</span> Standard Nginx / Apache access.log or JSON Lines (.jsonl)</p>
                    </div>
                )}
            </div>
        </div>
    );
}
