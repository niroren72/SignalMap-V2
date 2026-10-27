import { useState, useEffect } from 'react';
import {
    X,
    ExternalLink,
    MapPin,
    Satellite,
    Map as MapIcon,
    Radio,
    Link2,
    ZoomIn,
    ShieldAlert,
    Navigation,
    Camera,
    RotateCw,
} from 'lucide-react';

export interface GoogleViewPoint {
    lat: number;
    lng: number;
    label?: string;
    ip?: string;
    hostname?: string;
    city?: string;
    country?: string;
    org?: string;
    isPop?: boolean;
    isOrigin?: boolean;
    isDiagnostic?: boolean;
    hopNum?: number;
    avg_ms?: number | null;
    hasAnomaly?: boolean;
    maxSeverity?: string;
    events?: any[];
    initialMode?: 'streetview' | 'satellite' | 'roadmap';
}

interface GoogleViewModalProps {
    point: GoogleViewPoint | null;
    onClose: () => void;
    onZoomDeep: (lat: number, lng: number) => void;
}

export function GoogleViewModal({ point, onClose, onZoomDeep }: GoogleViewModalProps) {
    const [mapMode, setMapMode] = useState<'streetview' | 'satellite' | 'roadmap'>('streetview');
    const [reloadKey, setReloadKey] = useState(0);

    // Sync initial mode if provided or reset to streetview for a new point
    useEffect(() => {
        if (point?.initialMode) {
            setMapMode(point.initialMode);
        } else {
            setMapMode('streetview');
        }
        setReloadKey((k) => k + 1);
    }, [point?.lat, point?.lng, point?.initialMode]);

    if (!point || point.lat == null || point.lng == null) return null;

    const lat = point.lat;
    const lng = point.lng;
    const isPop = !!point.isPop;
    const isOrigin = !!point.isOrigin;
    const isThreat = !!point.hasAnomaly;

    // Direct Google Maps & Street View URLs
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const googleStreetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

    // Official interactive embed URLs
    const embedUrl =
        mapMode === 'streetview'
            ? `https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0&output=svembed`
            : `https://maps.google.com/maps?q=${lat},${lng}&t=${mapMode === 'satellite' ? 'k' : 'm'}&z=16&output=embed`;

    const title =
        point.label ||
        point.hostname ||
        point.ip ||
        (isOrigin ? 'Local Origin' : isPop ? `PoP #${point.hopNum}` : 'Remote Node');

    const locationText = [point.city, point.country].filter(Boolean).join(', ') || 'Global Transit';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div
                className="relative w-full max-w-3xl overflow-hidden glass-card rounded-2xl border border-cyan-500/50 shadow-[0_0_60px_rgba(6,182,212,0.3)] flex flex-col max-h-[94vh]"
                style={{ backgroundColor: 'rgba(10, 15, 29, 0.96)' }}
            >
                {/* Google Quad-Color Accent Bar */}
                <div className="h-1 w-full flex">
                    <span className="h-full flex-1 bg-[#4285F4]" />
                    <span className="h-full flex-1 bg-[#EA4335]" />
                    <span className="h-full flex-1 bg-[#FBBC05]" />
                    <span className="h-full flex-1 bg-[#34A853]" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                            {mapMode === 'streetview' ? (
                                <Camera className="w-4 h-4 text-cyan-300 animate-pulse" />
                            ) : (
                                <Navigation className="w-4 h-4 text-cyan-400" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold tracking-wider uppercase text-cyan-300">
                                    GOOGLE STREET VIEW & OBSERVABILITY
                                </span>
                                {isPop && (
                                    <span className="px-1.5 py-0.2 rounded bg-violet-900/80 text-violet-300 border border-violet-500/40 font-mono text-[9px] font-bold">
                                        PoP / IXP
                                    </span>
                                )}
                            </div>
                            <h3 className="text-sm sm:text-base font-bold text-white font-mono truncate">
                                {title}
                            </h3>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setReloadKey((k) => k + 1)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition"
                            title="Reload Panorama / Map"
                        >
                            <RotateCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
                            title="Close Google View"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Metadata Strip */}
                <div className="px-5 py-2 bg-slate-900/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        {isPop && (
                            <span className="px-2 py-0.5 rounded-full bg-violet-950/80 border border-violet-500/50 text-violet-200 text-[10px] font-mono font-bold flex items-center gap-1 shadow-sm shrink-0">
                                <Link2 className="w-3 h-3 text-violet-400" />
                                <span>PoP IXP FACILITY</span>
                            </span>
                        )}
                        {isOrigin && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1 shrink-0">
                                <Radio className="w-3 h-3 text-emerald-400" />
                                <span>ORIGIN HOST</span>
                            </span>
                        )}
                        {isThreat && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[10px] font-mono font-bold flex items-center gap-1 shrink-0">
                                <ShieldAlert className="w-3 h-3 text-rose-400" />
                                <span>ANOMALY</span>
                            </span>
                        )}
                        <span className="text-slate-300 font-medium flex items-center gap-1 truncate">
                            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="truncate">{locationText}</span>
                        </span>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-[11px] text-slate-300 shrink-0">
                        {point.avg_ms != null && (
                            <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                <span>RTT:</span>
                                <span>{point.avg_ms}ms</span>
                            </span>
                        )}
                        <span className="text-slate-400 tabular-nums">
                            {lat.toFixed(5)}°, {lng.toFixed(5)}°
                        </span>
                    </div>
                </div>

                {/* Mode Selector Tabs */}
                <div className="px-5 pt-3 pb-1 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800">
                        <button
                            onClick={() => setMapMode('streetview')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                                mapMode === 'streetview'
                                    ? 'bg-gradient-to-r from-cyan-950 to-blue-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <Camera className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Google Street View (360°)</span>
                        </button>
                        <button
                            onClick={() => setMapMode('satellite')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                                mapMode === 'satellite'
                                    ? 'bg-gradient-to-r from-cyan-950 to-blue-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <Satellite className="w-3.5 h-3.5" />
                            <span>Google Satellite</span>
                        </button>
                        <button
                            onClick={() => setMapMode('roadmap')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                                mapMode === 'roadmap'
                                    ? 'bg-gradient-to-r from-cyan-950 to-blue-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <MapIcon className="w-3.5 h-3.5" />
                            <span>Road Map</span>
                        </button>
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                        {mapMode === 'streetview' && (
                            <span className="text-cyan-400/80 text-[10px] hidden sm:inline">
                                ✦ Drag mouse to pan 360° · Click arrows to move
                            </span>
                        )}
                        {point.org && <span className="truncate max-w-[200px]">ORG: {point.org}</span>}
                    </div>
                </div>

                {/* Google Street View / Map Interactive Frame */}
                <div className="p-5 flex-1 min-h-[340px] flex flex-col">
                    <div className="relative w-full h-[360px] rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-inner">
                        <iframe
                            key={`${reloadKey}-${mapMode}`}
                            title={`Google Street View & Map ${title}`}
                            src={embedUrl}
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            allowFullScreen
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            className="w-full h-full"
                        />
                    </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="px-5 py-3 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                    <button
                        onClick={() => {
                            onZoomDeep(lat, lng);
                            onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900/80 border border-cyan-500/50 text-cyan-200 text-xs font-mono font-semibold transition shadow-sm"
                    >
                        <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Zoom In on Flat Globe (Level 18)</span>
                    </button>

                    <div className="flex items-center gap-2">
                        <a
                            href={googleStreetViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-500/50 text-emerald-200 text-xs font-mono font-semibold transition shadow-sm"
                            title="Open Google Street View in new tab with fullscreen panorama controls"
                        >
                            <Camera className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Fullscreen Street View</span>
                            <ExternalLink className="w-3 h-3 text-emerald-400/80" />
                        </a>

                        <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-semibold transition shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                        >
                            <span>Open in Google Maps</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
