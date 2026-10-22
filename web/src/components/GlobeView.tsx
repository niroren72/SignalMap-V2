import { useEffect, useRef, useState, useMemo } from 'react';
import Globe from 'globe.gl';
import { useFilteredEvents } from '../hooks/useConnections';
import { useConnectionStore } from '../stores/connectionStore';
import {
    Radio,
    X,
    Laptop,
    Link2,
    MapPin,
    Terminal,
    Plus,
    Minus,
    Compass,
    Palette,
    Check,
    ChevronDown,
} from 'lucide-react';
import { GLOBE_THEMES } from '../types/globeTheme';

export function GlobeView() {
    const containerRef = useRef<HTMLDivElement>(null);
    const globeRef = useRef<any>(null);
    const events = useFilteredEvents();
    const setSelectedId = useConnectionStore((s) => s.setSelectedId);
    const diagnosticOverlay = useConnectionStore((s) => s.diagnosticOverlay);
    const clearDiagnosticOverlay = useConnectionStore((s) => s.clearDiagnosticOverlay);
    const setActiveView = useConnectionStore((s) => s.setActiveView);
    const globeTheme = useConnectionStore((s) => s.globeTheme);
    const setGlobeTheme = useConnectionStore((s) => s.setGlobeTheme);
    const autoRotate = useConnectionStore((s) => s.settings.autoRotateGlobe);
    const enableAtmosphere = useConnectionStore((s) => s.settings.enableAtmosphereGlow);
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
    const [zoom, setZoom] = useState(2.5);
    const [themeMenuOpen, setThemeMenuOpen] = useState(false);

    const currentTheme = useMemo(
        () => GLOBE_THEMES[globeTheme] || GLOBE_THEMES['wonderful-ai'],
        [globeTheme]
    );

    // Fetch origin coordinates from local backend (airgap-safe, zero external privacy leaks)
    const [origin, setOrigin] = useState({ lat: 39.8283, lng: -98.5795 });
    useEffect(() => {
        const apiBase =
            window.location.port === '5173' || window.location.port === '5174'
                ? 'http://localhost:8765'
                : '';
        fetch(`${apiBase}/api/system/origin`)
            .then((res) => res.json())
            .then((data) => {
                if (data.latitude && data.longitude) {
                    setOrigin({ lat: data.latitude, lng: data.longitude });
                }
            })
            .catch(() => {
                // Safe fallback to default coordinates if offline
                setOrigin({ lat: 37.7749, lng: -122.4194 });
            });
    }, []);

    // Filter events that have valid remote geo data
    const geoEvents = useMemo(
        () => events.filter((e) => e.geo?.lat != null && e.geo?.lon != null),
        [events]
    );

    // Group events by remote coordinate
    const points = useMemo(() => {
        const grouped = geoEvents.reduce((acc, e) => {
            const geo = e.geo!;
            const key = `${geo.lat},${geo.lon}`;
            if (!acc[key]) {
                acc[key] = {
                    lat: geo.lat,
                    lng: geo.lon,
                    size: 0,
                    hasAnomaly: false,
                    maxSeverity: 'low',
                    events: [],
                };
            }
            acc[key].size += 1;
            if (e.anomaly?.is_anomaly) {
                acc[key].hasAnomaly = true;
                if (e.anomaly.severity === 'critical') acc[key].maxSeverity = 'critical';
                else if (e.anomaly.severity === 'high' && acc[key].maxSeverity !== 'critical')
                    acc[key].maxSeverity = 'high';
            }
            acc[key].events.push(e);
            return acc;
        }, {} as Record<string, any>);

        return Object.values(grouped).map((p: any) => ({
            ...p,
            radius: Math.min(Math.max(p.size * 0.15, 0.3), 2.5),
            color: currentTheme.pointColor(p),
        }));
    }, [geoEvents, currentTheme]);

    const arcs = useMemo(() => {
        return geoEvents.map((e) => ({
            startLat: origin.lat,
            startLng: origin.lng,
            endLat: e.geo!.lat,
            endLng: e.geo!.lon,
            color: currentTheme.arcColors(e),
            stroke: e.anomaly?.is_anomaly ? 1.2 : 0.6,
            altitude: e.anomaly?.is_anomaly ? 0.3 : 0.2,
            event: e,
        }));
    }, [geoEvents, origin, currentTheme]);

    // ── Diagnostic Overlay Route Arcs & Hop Points ──
    function getHopArcColor(latencyMs: number | null | undefined): string {
        if (latencyMs == null) return '#ec4899';
        if (latencyMs < 35) return '#10b981';
        if (latencyMs < 80) return '#06b6d4';
        if (latencyMs < 180) return '#f59e0b';
        return '#f43f5e';
    }

    const diagSequentialHops = useMemo(() => {
        if (!diagnosticOverlay || !diagnosticOverlay.hops) return [];
        return diagnosticOverlay.hops.filter(
            (h) => h.geo && h.geo.lat != null && h.geo.lon != null
        );
    }, [diagnosticOverlay]);

    const diagArcs = useMemo(() => {
        if (!diagnosticOverlay || !diagnosticOverlay.hops || diagnosticOverlay.hops.length === 0) return [];

        const seqPoints: any[] = [
            {
                lat: origin.lat,
                lng: origin.lng,
                hopNum: 0,
                ip: 'Local Host',
                label: 'Local Origin (You)',
                city: 'Local',
                country: 'Origin',
                avg_ms: 0,
                isOrigin: true,
            },
            ...diagSequentialHops.map((h, idx) => ({
                lat: h.geo!.lat!,
                lng: h.geo!.lon!,
                hopNum: h.hop,
                ip: h.ip || 'Unknown',
                hostname: h.hostname,
                city: h.geo?.city || 'Transit',
                country: h.geo?.country || '',
                org: h.geo?.org,
                is_pop: h.geo?.is_pop,
                avg_ms: h.avg_ms,
                timeout: h.timeout,
                isDestination: idx === diagSequentialHops.length - 1,
            })),
        ];

        const resultArcs: any[] = [];
        for (let i = 0; i < seqPoints.length - 1; i++) {
            const from = seqPoints[i];
            const to = seqPoints[i + 1];
            resultArcs.push({
                startLat: from.lat,
                startLng: from.lng,
                endLat: to.lat,
                endLng: to.lng,
                color: getHopArcColor(to.avg_ms),
                stroke: 2.2,
                altitude: 0.34 + i * 0.02,
                isDiagnostic: true,
                fromHop: from.hopNum,
                toHop: to.hopNum,
                fromLabel: from.ip,
                toLabel: to.ip,
                toCity: to.city,
                toCountry: to.country,
                toOrg: to.org,
                isPop: to.is_pop,
                latency: to.avg_ms,
            });
        }
        return resultArcs;
    }, [diagnosticOverlay, diagSequentialHops, origin]);

    const diagPoints = useMemo(() => {
        if (!diagnosticOverlay || !diagnosticOverlay.hops) return [];

        const pointsList: any[] = [
            {
                lat: origin.lat,
                lng: origin.lng,
                radius: 1.8,
                color: '#10b981',
                isDiagnostic: true,
                isOrigin: true,
                label: 'Origin (You)',
                ip: 'Local Host',
                city: 'Your Location',
                country: '',
                hopNum: 0,
                avg_ms: 0,
            },
        ];

        diagSequentialHops.forEach((h, idx) => {
            const isDest = idx === diagSequentialHops.length - 1;
            pointsList.push({
                lat: h.geo!.lat!,
                lng: h.geo!.lon!,
                radius: isDest ? 2.4 : h.geo?.is_pop ? 2.0 : 1.4,
                color: isDest
                    ? '#38bdf8'
                    : h.geo?.is_pop
                    ? '#a855f7'
                    : h.avg_ms != null && h.avg_ms > 150
                    ? '#f43f5e'
                    : '#fbbf24',
                isDiagnostic: true,
                isDestination: isDest,
                isPop: h.geo?.is_pop,
                label: h.hostname || h.ip || `Hop ${h.hop}`,
                ip: h.ip,
                hostname: h.hostname,
                city: h.geo?.city || 'Transit',
                country: h.geo?.country || '',
                org: h.geo?.org,
                hopNum: h.hop,
                avg_ms: h.avg_ms,
            });
        });

        return pointsList;
    }, [diagnosticOverlay, diagSequentialHops, origin]);

    // Combined points and arcs for Globe rendering
    const allArcs = useMemo(() => [...arcs, ...diagArcs], [arcs, diagArcs]);
    const allPoints = useMemo(() => [...points, ...diagPoints], [points, diagPoints]);

    // Concentric pulsating beacon radar rings (Wonderful AI starlight radar effect)
    const rings = useMemo(() => {
        const list: any[] = [
            {
                lat: origin.lat,
                lng: origin.lng,
                maxRadius: 5.5,
                propagationSpeed: 1.8,
                repeatPeriod: 2200,
                color: currentTheme.ringColor,
            },
        ];

        // Active traffic and security anomaly nodes get pulsating beacon rings
        const activeNodes = points
            .filter((p: any) => p.hasAnomaly || p.size > 2)
            .slice(0, 5);

        activeNodes.forEach((p: any) => {
            list.push({
                lat: p.lat,
                lng: p.lng,
                maxRadius: p.hasAnomaly ? 6.5 : 4.0,
                propagationSpeed: p.hasAnomaly ? 2.8 : 1.4,
                repeatPeriod: p.hasAnomaly ? 1400 : 2600,
                color: p.hasAnomaly
                    ? (t: number) => `rgba(244, 63, 94, ${Math.max(0, 1 - t) * 0.85})`
                    : currentTheme.ringColor,
            });
        });

        return list;
    }, [origin, points, currentTheme]);

    // Init globe
    useEffect(() => {
        if (!containerRef.current) return;

        const globe = (Globe as any)()(containerRef.current)
            .globeImageUrl(currentTheme.textureUrl)
            .bumpImageUrl(currentTheme.bumpUrl || '')
            .atmosphereColor(enableAtmosphere ? currentTheme.atmosphereColor : 'rgba(0,0,0,0)')
            .atmosphereAltitude(enableAtmosphere ? currentTheme.atmosphereAltitude : 0)
            .backgroundColor(currentTheme.backgroundColor)
            .width(dimensions.width)
            .height(dimensions.height)
            .pointLat('lat')
            .pointLng('lng')
            .pointColor('color')
            .pointAltitude(0.02)
            .pointRadius('radius')
            .pointsMerge(false)
            .arcStartLat('startLat')
            .arcStartLng('startLng')
            .arcEndLat('endLat')
            .arcEndLng('endLng')
            .arcColor('color')
            .arcDashLength(0.4)
            .arcDashGap(0.1)
            .arcDashInitialGap(() => Math.random())
            .arcDashAnimateTime(1500)
            .arcAltitude('altitude')
            .arcStroke('stroke')
            .ringsData(rings)
            .ringLat('lat')
            .ringLng('lng')
            .ringColor('color')
            .ringMaxRadius('maxRadius')
            .ringPropagationSpeed('propagationSpeed')
            .ringRepeatPeriod('repeatPeriod')
            .onArcClick((arc: any) => {
                if (!arc.isDiagnostic && arc.event) {
                    setSelectedId(arc.event.id);
                }
            })
            .onPointClick((pt: any) => {
                if (pt.isDiagnostic) {
                    globe.pointOfView({ lat: pt.lat, lng: pt.lng, altitude: 1.2 }, 800);
                } else if (pt.events && pt.events.length > 0) {
                    setSelectedId(pt.events[0].id);
                }
            })
            .arcLabel((arc: any) => {
                if (arc.isDiagnostic) {
                    return `
          <div class="glass-card p-2.5 text-xs border border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.3)]" style="min-width: 200px;">
            <div class="bg-gradient-to-r from-cyan-950/80 to-blue-950/80 text-cyan-300 font-bold px-1.5 py-0.5 rounded text-[10px] mb-1.5 border border-cyan-500/40 flex items-center justify-between font-mono">
              <span>HOP #${arc.fromHop} &rarr; #${arc.toHop}</span>
              ${arc.isPop ? '<span class="bg-violet-900/80 text-violet-300 px-1 py-0.2 rounded text-[9px]">PoP / IXP</span>' : ''}
            </div>
            <div class="font-bold text-gray-100 mb-0.5">${arc.toLabel || arc.toCity}</div>
            <div class="text-slate-300 text-[11px]">${arc.toCity}${arc.toCountry ? ', ' + arc.toCountry : ''}</div>
            ${arc.toOrg ? `<div class="text-slate-400 text-[10px] truncate"><span class="opacity-70">ORG:</span> ${arc.toOrg}</div>` : ''}
            <div class="text-emerald-400 font-mono font-bold text-xs mt-1 border-t border-slate-700/60 pt-1">
              RTT: ${arc.latency != null ? arc.latency + ' ms' : 'Timeout'}
            </div>
          </div>
        `;
                }

                const e = arc.event;
                const proc = e.local?.process_name || 'System';
                const isThreat = e.anomaly?.is_anomaly;
                return `
          <div class="glass-card p-2.5 text-xs border ${
              isThreat ? 'border-rose-500/80' : 'border-slate-700'
          }" style="min-width: 180px;">
            ${
                isThreat
                    ? `<div class="bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded text-[10px] mb-1.5 border border-rose-500/40 flex items-center gap-1 font-mono"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>${
                          e.anomaly.title || 'SECURITY ALERT'
                      }</div>`
                    : ''
            }
            <div class="font-bold text-gray-200 border-b border-gray-700/60 mb-1 pb-1 font-mono">${proc} <span class="text-slate-500">(PID ${e.local?.pid ?? 'N/A'})</span></div>
            <div class="font-semibold text-cyan-300 font-mono">${e.remote?.hostname || e.remote?.ip || 'Unknown'}</div>
            <div class="text-slate-300 text-[11px]">${e.service?.name || 'Unclassified'} &bull; <span class="uppercase text-slate-400 font-mono">${e.protocol}</span></div>
            <div class="text-slate-400 text-[10px] mt-0.5">${e.geo?.city || 'Transit'}, ${e.geo?.country || 'Global'}</div>
          </div>
        `;
            });

        globe.controls().autoRotate = autoRotate;
        globe.controls().autoRotateSpeed = 0.5;
        globe.controls().enableZoom = true;
        globe.controls().zoomSpeed = 1.2;
        globe.controls().minDistance = 120;
        globe.controls().maxDistance = 480;
        globe.pointOfView({ lat: 20, lng: 0, altitude: zoom });

        globeRef.current = globe;

        return () => {
            globe._destructor();
        };
    }, []);

    // Reactive theme & atmosphere updates
    useEffect(() => {
        if (!globeRef.current) return;
        globeRef.current
            .globeImageUrl(currentTheme.textureUrl)
            .bumpImageUrl(currentTheme.bumpUrl || '')
            .atmosphereColor(enableAtmosphere ? currentTheme.atmosphereColor : 'rgba(0,0,0,0)')
            .atmosphereAltitude(enableAtmosphere ? currentTheme.atmosphereAltitude : 0)
            .backgroundColor(currentTheme.backgroundColor);
    }, [currentTheme, enableAtmosphere]);

    // Reactive autoRotate update
    useEffect(() => {
        if (!globeRef.current) return;
        const controls = globeRef.current.controls();
        if (controls) {
            controls.autoRotate = autoRotate;
        }
    }, [autoRotate]);

    // Update data reactively
    useEffect(() => {
        if (globeRef.current) {
            globeRef.current.pointsData(allPoints);
            globeRef.current.arcsData(allArcs);
            globeRef.current.ringsData(rings);
        }
    }, [allPoints, allArcs, rings]);

    // Auto-focus camera when a new diagnostic route is projected
    useEffect(() => {
        if (!diagnosticOverlay || !globeRef.current) return;
        if (diagSequentialHops.length > 0) {
            const midHop = diagSequentialHops[Math.floor(diagSequentialHops.length / 2)];
            globeRef.current.pointOfView(
                {
                    lat: midHop.geo!.lat,
                    lng: midHop.geo!.lon,
                    altitude: 2.2,
                },
                1200
            );
        }
    }, [diagnosticOverlay?.timestamp]);

    // Sync zoom button → globe camera
    const handleZoom = (delta: number) => {
        if (!globeRef.current) return;
        const pov = globeRef.current.pointOfView();
        const newAlt = Math.max(0.5, Math.min(8, (pov.altitude ?? zoom) + delta));
        setZoom(newAlt);
        globeRef.current.pointOfView({ ...pov, altitude: newAlt }, 300);
    };

    // Smoothly focus on a specific hop
    const flyToHop = (lat: number, lng: number) => {
        if (!globeRef.current) return;
        globeRef.current.pointOfView({ lat, lng, altitude: 1.1 }, 800);
    };

    // Reset view to origin
    const flyToOrigin = () => {
        if (!globeRef.current) return;
        globeRef.current.pointOfView({ lat: origin.lat, lng: origin.lng, altitude: 1.6 }, 800);
    };

    // Handle resize via ResizeObserver on container
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ width, height });
                if (globeRef.current) {
                    globeRef.current.width(width).height(height);
                }
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div className="relative w-full h-full">
            {/* Globe canvas */}
            <div ref={containerRef} className="absolute inset-0 z-0" />

            {/* Diagnostic Route Overlay HUD (rendered when traceroute or path is mapped) */}
            {diagnosticOverlay && (
                <div className="absolute top-4 left-4 z-20 max-w-lg glass-card border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.2)] rounded-xl p-3.5 backdrop-blur-xl animate-fade-in">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                            <Radio className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="font-mono font-bold text-cyan-300 text-xs tracking-wider uppercase">
                                {diagnosticOverlay.tool.toUpperCase()} ROUTE OVERLAY
                            </span>
                        </div>
                        <button
                            onClick={clearDiagnosticOverlay}
                            className="flex items-center gap-1 text-slate-400 hover:text-rose-400 text-xs px-2 py-0.5 rounded-md hover:bg-slate-800/80 transition"
                            title="Dismiss Route Overlay"
                        >
                            <X className="w-3.5 h-3.5" />
                            <span>Close</span>
                        </button>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between">
                            <div className="font-mono font-bold text-white text-sm truncate max-w-[280px]">
                                {diagnosticOverlay.target}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300">
                                <span>Mapped:</span>
                                <span className="text-cyan-400 font-bold">
                                    {diagSequentialHops.length}/{diagnosticOverlay.totalHops} hops
                                </span>
                                {diagnosticOverlay.avgLatencyMs != null && (
                                    <>
                                        <span className="text-slate-600">|</span>
                                        <span>Avg:</span>
                                        <span className="text-emerald-400 font-bold">
                                            {diagnosticOverlay.avgLatencyMs}ms
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Hop Pills Stepper: Clickable to fly camera directly to hop */}
                        <div className="flex flex-col gap-1 mt-1">
                            <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">
                                HOP TRAJECTORY (CLICK TO FLY CAMERA)
                            </span>
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                                <button
                                    onClick={flyToOrigin}
                                    className="px-2 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold hover:bg-emerald-800/80 transition flex items-center gap-1.5 shadow-sm"
                                >
                                    <Laptop className="w-3 h-3 text-emerald-400" />
                                    <span>#0 Origin</span>
                                </button>
                                {diagSequentialHops.map((h) => (
                                    <button
                                        key={h.hop}
                                        onClick={() => flyToHop(h.geo!.lat!, h.geo!.lon!)}
                                        className={`px-2 py-1 rounded-lg border text-[10px] font-mono transition flex items-center gap-1.5 shadow-sm ${
                                            h.geo?.is_pop
                                                ? 'bg-violet-950/70 border-violet-500/50 text-violet-200 hover:bg-violet-800/80'
                                                : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-300'
                                        }`}
                                    >
                                        {h.geo?.is_pop ? (
                                            <Link2 className="w-3 h-3 text-violet-400" />
                                        ) : (
                                            <MapPin className="w-3 h-3 text-cyan-400" />
                                        )}
                                        <span>#{h.hop} {h.geo?.city || h.ip}</span>
                                        {h.avg_ms != null && (
                                            <span className="text-slate-500 text-[9px]">({h.avg_ms}ms)</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50 mt-1">
                            <button
                                onClick={() => setActiveView('netutils')}
                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition flex items-center justify-center gap-1.5 border border-slate-700"
                            >
                                <Terminal className="w-3 h-3 text-cyan-400" />
                                <span>Open Diagnostics</span>
                            </button>
                            <button
                                onClick={flyToOrigin}
                                className="py-1.5 px-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition flex items-center gap-1.5 border border-slate-700"
                            >
                                <MapPin className="w-3 h-3 text-emerald-400" />
                                <span>Focus Origin</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Diagnostic Launcher on Globe */}
            {!diagnosticOverlay && (
                <div className="absolute top-4 left-4 z-10">
                    <button
                        onClick={() => setActiveView('netutils')}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-card border border-cyan-500/30 hover:border-cyan-500/70 text-slate-200 hover:text-cyan-300 text-xs font-mono font-medium shadow-xl backdrop-blur-xl transition-all group"
                        title="Run Traceroute, Ping or Path Diagnostics"
                    >
                        <Terminal className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                        <span>Run Diagnostics</span>
                    </button>
                </div>
            )}

            {/* Floating Theme Selector HUD */}
            <div className="absolute top-4 right-4 z-20">
                <div className="relative">
                    <button
                        id="globe-theme-menu-btn"
                        onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl glass-card border border-slate-700/80 hover:border-cyan-500/60 text-slate-200 hover:text-white text-xs font-mono font-medium shadow-xl backdrop-blur-xl transition-all group"
                        title="Switch 3D Globe Visual Theme"
                    >
                        <div className="flex items-center gap-1.5">
                            <span
                                className="w-2.5 h-2.5 rounded-full ring-1 ring-white/30"
                                style={{ backgroundColor: currentTheme.previewSwatches.atmosphere }}
                            />
                            <Palette className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-12 transition-transform" />
                        </div>
                        <span className="font-semibold">{currentTheme.name}</span>
                        <ChevronDown
                            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                                themeMenuOpen ? 'rotate-180' : ''
                            }`}
                        />
                    </button>

                    {themeMenuOpen && (
                        <div
                            className="absolute right-0 top-full mt-2 w-72 rounded-2xl glass-card border border-slate-700/80 shadow-2xl p-2 z-30 backdrop-blur-2xl animate-fade-in flex flex-col gap-1"
                            style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)' }}
                        >
                            <div className="px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                                <span>3D Globe Themes</span>
                                <span className="text-cyan-400 font-mono text-[9px]">{Object.keys(GLOBE_THEMES).length} Available</span>
                            </div>
                            <div className="flex flex-col gap-1 max-h-80 overflow-y-auto pt-1">
                                {Object.values(GLOBE_THEMES).map((theme) => {
                                    const isSelected = theme.id === globeTheme;
                                    return (
                                        <button
                                            key={theme.id}
                                            onClick={() => {
                                                setGlobeTheme(theme.id);
                                                setThemeMenuOpen(false);
                                            }}
                                            className={`flex items-center justify-between p-2 rounded-xl text-left transition-all ${
                                                isSelected
                                                    ? 'bg-cyan-950/70 border border-cyan-500/50 text-white shadow-sm'
                                                    : 'hover:bg-slate-800/60 text-slate-300 hover:text-white border border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="flex -space-x-1 shrink-0">
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
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-semibold truncate">{theme.name}</span>
                                                        {theme.badge && (
                                                            <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                                                                {theme.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[170px]">
                                                        {theme.description}
                                                    </span>
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <Check className="w-4 h-4 text-cyan-400 shrink-0 ml-1.5" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-32 right-6 z-10 flex flex-col gap-1.5">
                <button
                    id="globe-zoom-in"
                    onClick={() => handleZoom(-0.4)}
                    title="Zoom in"
                    className="w-8 h-8 rounded-lg glass-card border border-slate-700 text-slate-200 hover:border-cyan-500 hover:text-cyan-400 transition flex items-center justify-center select-none shadow-lg"
                >
                    <Plus className="w-4 h-4" />
                </button>
                <button
                    id="globe-zoom-out"
                    onClick={() => handleZoom(0.4)}
                    title="Zoom out"
                    className="w-8 h-8 rounded-lg glass-card border border-slate-700 text-slate-200 hover:border-cyan-500 hover:text-cyan-400 transition flex items-center justify-center select-none shadow-lg"
                >
                    <Minus className="w-4 h-4" />
                </button>
                <button
                    id="globe-zoom-reset"
                    onClick={() => handleZoom(2.5 - (globeRef.current?.pointOfView()?.altitude ?? 2.5))}
                    title="Reset perspective"
                    className="w-8 h-8 rounded-lg glass-card border border-slate-700 text-slate-400 hover:border-cyan-500 hover:text-cyan-400 transition flex items-center justify-center select-none shadow-lg"
                >
                    <Compass className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
