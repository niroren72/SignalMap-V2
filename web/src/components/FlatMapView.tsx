import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { GlobeThemeConfig, GlobeThemeId } from '../types/globeTheme';
import { getWonderfulLandBitmap } from '../utils/wonderfulGlobe';
import { buildArcLabel, buildPointLabel } from '../utils/globeLabels';
import { loadCountryBorders, getCachedCountryBorders } from '../utils/countryBorders';

/**
 * FlatMapView — 2D equirectangular projection of the globe's connection visualization.
 *
 * Renders with Canvas2D (no extra deps):
 *  - "Black Dots" theme: dot-matrix land built from the same 360x180 land bitmap as the particle globe
 *  - Other themes: the theme's equirectangular texture (e.g. NASA Blue Marble)
 *  - Animated comet arcs (antimeridian-aware), pulsing beacon rings, severity-coloured nodes,
 *    diagnostic traceroute hops with hop badges
 *  - Wheel zoom (cursor anchored), drag pan, hover tooltips, click-to-select
 */

export interface FlatMapHandle {
    zoomBy: (factor: number) => void;
    flyTo: (lat: number, lng: number, zoom?: number) => void;
    fitBounds: (coords: { lat: number; lng: number }[], maxZoom?: number) => void;
    fitAllPointsAndPops: (points: any[], origin?: { lat: number; lng: number }) => void;
    reset: () => void;
}

interface FlatMapViewProps {
    active: boolean;
    themeId: GlobeThemeId;
    theme: GlobeThemeConfig;
    points: any[];
    arcs: any[];
    rings: any[];
    origin: { lat: number; lng: number };
    onArcClick: (arc: any) => void;
    onPointClick: (point: any) => void;
}

interface View {
    cu: number; // view centre, normalised map x (0..1)
    cv: number; // view centre, normalised map y (0..1)
    k: number; // zoom factor (1 = whole world fits)
}

interface Metrics {
    W: number;
    H: number;
    ox: number;
    oy: number;
}

interface PreparedArc {
    u0: number;
    v0: number;
    u1: number;
    v1: number;
    wrapShift: number; // extra copy offset (in world widths) for antimeridian-crossing arcs
    colors: [string, string];
    stroke: number;
    altitude: number;
    phase: number;
    period: number;
    isDiagnostic: boolean;
    isAnomaly: boolean;
    data: any;
}

interface Hit {
    type: 'point' | 'arc';
    data: any;
}

const MIN_K = 1;
const MAX_K = 32;
const MAX_ARCS = 700;
const TAU = Math.PI * 2;
const MONO = 'ui-monospace, "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';

function computeOptimalBounds(coords: { lat: number; lng: number }[]) {
    if (coords.length === 0) return { cu: 0.5, cv: 0.5, du: 1, dv: 1 };

    let minLng = coords[0].lng;
    let maxLng = coords[0].lng;
    let minLat = coords[0].lat;
    let maxLat = coords[0].lat;

    for (const c of coords) {
        if (c.lng < minLng) minLng = c.lng;
        if (c.lng > maxLng) maxLng = c.lng;
        if (c.lat < minLat) minLat = c.lat;
        if (c.lat > maxLat) maxLat = c.lat;
    }

    let spanLng = maxLng - minLng;
    let centerLng = (minLng + maxLng) / 2;

    // Check anti-meridian wrap (e.g. Asia to US West Coast across Pacific)
    const wrappedLngs = coords.map((c) => (c.lng < 0 ? c.lng + 360 : c.lng));
    const minWrapped = Math.min(...wrappedLngs);
    const maxWrapped = Math.max(...wrappedLngs);
    const spanWrapped = maxWrapped - minWrapped;

    if (spanWrapped < spanLng) {
        spanLng = spanWrapped;
        centerLng = ((minWrapped + maxWrapped) / 2) % 360;
        if (centerLng > 180) centerLng -= 360;
    }

    const cu = (centerLng + 180) / 360;
    const cv = (90 - (minLat + maxLat) / 2) / 180;
    const du = Math.max(spanLng / 360, 0.02);
    const dv = Math.max((maxLat - minLat) / 180, 0.02);

    return { cu, cv, du, dv };
}

const FLAT_STYLES: Record<
    GlobeThemeId,
    { land: string; grid: string; gridStrong: string; gridLabel: string; frame: string; tint: string | null; outline: string }
> = {
    'black-dots': {
        land: 'rgba(255, 255, 255, 0.42)',
        grid: 'rgba(255, 255, 255, 0.045)',
        gridStrong: 'rgba(255, 255, 255, 0.10)',
        gridLabel: 'rgba(226, 232, 240, 0.32)',
        frame: 'rgba(255, 255, 255, 0.16)',
        tint: null,
        outline: 'rgba(0, 0, 0, 0.85)',
    },
    classic: {
        land: 'rgba(255, 255, 255, 0.4)',
        grid: 'rgba(125, 211, 252, 0.10)',
        gridStrong: 'rgba(125, 211, 252, 0.22)',
        gridLabel: 'rgba(186, 230, 253, 0.55)',
        frame: 'rgba(79, 195, 247, 0.45)',
        tint: 'rgba(2, 6, 23, 0.30)',
        outline: 'rgba(2, 6, 23, 0.85)',
    },
};

// Module-level texture cache so toggling projections never refetches
const textureCache = new Map<string, HTMLImageElement>();
function getTexture(url: string): HTMLImageElement {
    let img = textureCache.get(url);
    if (!img) {
        img = new Image();
        img.decoding = 'async';
        img.src = url;
        textureCache.set(url, img);
    }
    return img;
}

function hash01(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
}

function toColors(c: any): [string, string] {
    if (Array.isArray(c)) return [c[0], c[1] ?? c[0]];
    return [c, c];
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function prepareArcs(arcs: any[]): PreparedArc[] {
    // Many events share a route — collapse identical routes so the canvas stays fast
    const grouped = new Map<string, { arc: any; count: number }>();
    const diag: any[] = [];
    for (const a of arcs) {
        if (a.isDiagnostic) {
            diag.push(a);
            continue;
        }
        const key = `${a.startLat.toFixed(2)},${a.startLng.toFixed(2)},${a.endLat.toFixed(2)},${a.endLng.toFixed(2)}`;
        const g = grouped.get(key);
        if (!g) {
            grouped.set(key, { arc: a, count: 1 });
        } else {
            g.count++;
            if (a.event?.anomaly?.is_anomaly && !g.arc.event?.anomaly?.is_anomaly) g.arc = a;
        }
    }

    const regular = Array.from(grouped.entries())
        .sort(
            ([, a], [, b]) =>
                Number(!!b.arc.event?.anomaly?.is_anomaly) - Number(!!a.arc.event?.anomaly?.is_anomaly)
        )
        .slice(0, MAX_ARCS);

    const out: PreparedArc[] = [];
    const push = (a: any, key: string, isDiagnostic: boolean, data: any) => {
        let endLng = a.endLng;
        const d = endLng - a.startLng;
        if (d > 180) endLng -= 360;
        else if (d < -180) endLng += 360;
        const u0 = (a.startLng + 180) / 360;
        const u1 = (endLng + 180) / 360;
        let wrapShift = 0;
        if (u1 < 0) wrapShift = 1;
        else if (u1 > 1) wrapShift = -1;
        out.push({
            u0,
            v0: (90 - a.startLat) / 180,
            u1,
            v1: (90 - a.endLat) / 180,
            wrapShift,
            colors: toColors(a.color),
            stroke: a.stroke ?? 0.6,
            altitude: a.altitude ?? 0.2,
            phase: hash01(key),
            period: isDiagnostic ? 1400 : 1500 + hash01(key + 'p') * 900,
            isDiagnostic,
            isAnomaly: !!a.event?.anomaly?.is_anomaly,
            data,
        });
    };

    for (const [key, { arc, count }] of regular) {
        push(arc, key, false, count > 1 ? { ...arc, count } : arc);
    }
    diag.forEach((a, i) => push(a, `diag-${i}-${a.toHop}`, true, a));
    return out;
}

function pointRadius(p: any, k: number): number {
    const zoomBoost = Math.min(1.8, Math.sqrt(k));
    return (1.5 + (p.radius ?? 0.5) * 1.5) * zoomBoost;
}

export const FlatMapView = forwardRef<FlatMapHandle, FlatMapViewProps>(function FlatMapView(
    { active, themeId, theme, points, arcs, rings, origin, onArcClick, onPointClick },
    ref
) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const readoutRef = useRef<HTMLDivElement>(null);

    const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
    const viewRef = useRef<View>({ cu: 0.5, cv: 0.5, k: 1 });
    const animRef = useRef<{ from: View; to: View; start: number; dur: number } | null>(null);
    const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const baseKeyRef = useRef('');
    const hoverRef = useRef<Hit | null>(null);
    const frameFnRef = useRef<((now: number) => void) | null>(null);

    // Latest props for the render loop (avoids re-binding listeners on every data tick)
    const dataRef = useRef<{
        points: any[];
        arcs: PreparedArc[];
        rings: any[];
        origin: { lat: number; lng: number };
        theme: GlobeThemeConfig;
        themeId: GlobeThemeId;
    }>(null as never);
    if (!dataRef.current) {
        dataRef.current = { points, arcs: prepareArcs(arcs), rings, origin, theme, themeId };
    }
    const callbacksRef = useRef({ onArcClick, onPointClick });
    callbacksRef.current = { onArcClick, onPointClick };

    useEffect(() => {
        dataRef.current = { ...dataRef.current, arcs: prepareArcs(arcs) };
    }, [arcs]);
    useEffect(() => {
        dataRef.current = { ...dataRef.current, points, rings, origin, theme, themeId };
        baseKeyRef.current = ''; // force base layer redraw on theme change
        const img = getTexture(theme.textureUrl);
        if (!img.complete) img.onload = () => (baseKeyRef.current = '');
    }, [points, rings, origin, theme, themeId]);

    // Preload geopolitical country borders
    useEffect(() => {
        loadCountryBorders().then(() => {
            baseKeyRef.current = '';
        });
    }, []);

    // ── View math ──
    const getMetrics = (v: View): Metrics => {
        const { w, h } = sizeRef.current;
        const baseW = Math.min(w * 0.96, h * 2 * 0.92);
        const W = baseW * v.k;
        const H = W / 2;
        return { W, H, ox: w / 2 - v.cu * W, oy: h / 2 - v.cv * H };
    };

    const clampView = (v: View): View => {
        const { w, h } = sizeRef.current;
        const k = Math.max(MIN_K, Math.min(MAX_K, v.k));
        const baseW = Math.min(w * 0.96, h * 2 * 0.92);
        const W = baseW * k;
        const H = W / 2;
        const clampAxis = (c: number, span: number, viewport: number) => {
            if (span <= viewport) return 0.5;
            const half = viewport / 2 / span;
            return Math.max(half, Math.min(1 - half, c));
        };
        return { k, cu: clampAxis(v.cu, W, w), cv: clampAxis(v.cv, H, h) };
    };

    const animateTo = (target: View, dur = 800) => {
        animRef.current = {
            from: { ...viewRef.current },
            to: clampView(target),
            start: performance.now(),
            dur,
        };
    };

    useImperativeHandle(ref, () => ({
        zoomBy: (factor: number) => {
            const base = animRef.current?.to ?? viewRef.current;
            animateTo({ ...base, k: base.k * factor }, 350);
        },
        flyTo: (lat: number, lng: number, zoom = 4) => {
            animateTo({ cu: (lng + 180) / 360, cv: (90 - lat) / 180, k: Math.min(zoom, MAX_K) });
        },
        fitBounds: (coords, maxZoom = 14) => {
            if (!coords.length) return;
            const { cu, cv, du, dv } = computeOptimalBounds(coords);
            const { w, h } = sizeRef.current;
            const baseW = Math.min(w * 0.96, h * 2 * 0.92);
            const k = Math.max(1, Math.min((w * 0.65) / (du * baseW), (h * 0.65) / ((dv * baseW) / 2), maxZoom));
            animateTo({ cu, cv: cv - 0.02, k }, 1000);
        },
        fitAllPointsAndPops: (pts, org) => {
            const list: { lat: number; lng: number }[] = [];
            if (org?.lat != null && org?.lng != null) list.push(org);
            for (const p of pts) {
                if (p.lat != null && p.lng != null) {
                    list.push({ lat: p.lat, lng: p.lng });
                }
            }
            if (list.length > 0) {
                const { cu, cv, du, dv } = computeOptimalBounds(list);
                const { w, h } = sizeRef.current;
                const baseW = Math.min(w * 0.96, h * 2 * 0.92);
                const k = Math.max(1, Math.min((w * 0.68) / (du * baseW), (h * 0.68) / ((dv * baseW) / 2), 16));
                animateTo({ cu, cv: cv - 0.015, k }, 1100);
            }
        },
        reset: () => animateTo({ cu: 0.5, cv: 0.5, k: 1 }),
    }));

    // ── Setup: canvas sizing, input handling, render function ──
    useEffect(() => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            const rect = wrap.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            sizeRef.current = { w: rect.width, h: rect.height, dpr };
            canvas.width = Math.max(1, Math.round(rect.width * dpr));
            canvas.height = Math.max(1, Math.round(rect.height * dpr));
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            viewRef.current = clampView(viewRef.current);
            baseKeyRef.current = '';
        };
        const ro = new ResizeObserver(resize);
        ro.observe(wrap);
        resize();

        const project = (lat: number, lng: number, m: Metrics): [number, number] => [
            m.ox + ((lng + 180) / 360) * m.W,
            m.oy + ((90 - lat) / 180) * m.H,
        ];

        const arcGeom = (a: PreparedArc, m: Metrics, shift: number) => {
            const x0 = m.ox + (a.u0 + shift) * m.W;
            const y0 = m.oy + a.v0 * m.H;
            const x1 = m.ox + (a.u1 + shift) * m.W;
            const y1 = m.oy + a.v1 * m.H;
            const dx = x1 - x0;
            const dy = y1 - y0;
            const len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len;
            let ny = dx / len;
            if (ny > 0) {
                nx = -nx;
                ny = -ny;
            }
            const lift = len * (0.25 + a.altitude * 0.6);
            const cx = (x0 + x1) / 2 + nx * lift;
            const cy = (y0 + y1) / 2 + ny * lift;
            const L = (len + Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) / 2;
            return { x0, y0, cx, cy, x1, y1, L };
        };

        const arcShifts = (a: PreparedArc) => (a.wrapShift ? [0, a.wrapShift] : [0]);

        // ── Base layer (land + graticule), cached until the view/theme/size changes ──
        const renderBase = (m: Metrics) => {
            const { w, h, dpr } = sizeRef.current;
            const { themeId: tid, theme: th } = dataRef.current;
            const style = FLAT_STYLES[tid] ?? FLAT_STYLES['black-dots'];
            const img = getTexture(th.textureUrl);
            const imgReady = !!img && img.complete && img.naturalWidth > 0;
            const v = viewRef.current;
            const borders = getCachedCountryBorders();
            const key = `${tid}|${w}|${h}|${dpr}|${v.k.toFixed(4)}|${v.cu.toFixed(5)}|${v.cv.toFixed(5)}|${imgReady}|${borders.length}`;
            if (key === baseKeyRef.current && baseCanvasRef.current) return baseCanvasRef.current;

            let base = baseCanvasRef.current;
            if (!base) {
                base = document.createElement('canvas');
                baseCanvasRef.current = base;
            }
            if (base.width !== canvas.width || base.height !== canvas.height) {
                base.width = canvas.width;
                base.height = canvas.height;
            }
            const g = base.getContext('2d')!;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, base.width, base.height);
            g.setTransform(dpr, 0, 0, dpr, 0, 0);

            if (img) {
                if (imgReady) {
                    g.imageSmoothingQuality = 'high';
                    g.drawImage(img, m.ox, m.oy, m.W, m.H);
                } else {
                    g.fillStyle = '#05070f';
                    g.fillRect(m.ox, m.oy, m.W, m.H);
                }
                if (style.tint) {
                    g.fillStyle = style.tint;
                    g.fillRect(m.ox, m.oy, m.W, m.H);
                }
            } else {
                // Dot-matrix land fallback from the 1-bit 360x180 land bitmap
                const bm = getWonderfulLandBitmap();
                const cell = m.W / 360;
                const c0 = Math.max(0, Math.floor(-m.ox / cell));
                const c1 = Math.min(359, Math.ceil((w - m.ox) / cell));
                const r0 = Math.max(0, Math.floor(-m.oy / cell));
                const r1 = Math.min(179, Math.ceil((h - m.oy) / cell));
                const rad = Math.max(0.55, Math.min(cell * 0.34, 1 + cell * 0.2));
                g.fillStyle = style.land;
                g.beginPath();
                for (let r = r0; r <= r1; r++) {
                    const y = m.oy + (r + 0.5) * cell;
                    for (let c = c0; c <= c1; c++) {
                        const a = r * 360 + c;
                        if (((bm[a >> 3] >> (a & 7)) & 1) === 1) {
                            const x = m.ox + (c + 0.5) * cell;
                            g.moveTo(x + rad, y);
                            g.arc(x, y, rad, 0, TAU);
                        }
                    }
                }
                g.fill();
            }

            // Country borders (ultra-thin, high-definition geopolitical boundaries)
            if (borders.length > 0) {
                g.save();
                g.lineWidth = Math.max(0.65, Math.min(1.4, (th.borderWidth || 0.6) * Math.pow(v.k, 0.08)));
                g.strokeStyle = th.borderColor || 'rgba(255, 255, 255, 0.42)';
                g.lineCap = 'round';
                g.lineJoin = 'round';

                for (let r = 0; r < borders.length; r++) {
                    const ring = borders[r];
                    if (!ring || ring.length < 2) continue;
                    g.beginPath();
                    let penDown = false;
                    for (let i = 0; i < ring.length; i++) {
                        const [lng, lat] = ring[i];
                        const x = m.ox + ((lng + 180) / 360) * m.W;
                        const y = m.oy + ((90 - lat) / 180) * m.H;

                        if (!penDown) {
                            g.moveTo(x, y);
                            penDown = true;
                        } else {
                            const prevLng = ring[i - 1][0];
                            if (Math.abs(lng - prevLng) > 180) {
                                g.moveTo(x, y);
                            } else {
                                g.lineTo(x, y);
                            }
                        }
                    }
                    g.stroke();
                }
                g.restore();
            }

            // Graticule
            g.lineWidth = 1;
            for (let lng = -150; lng <= 150; lng += 30) {
                const x = Math.round(m.ox + ((lng + 180) / 360) * m.W) + 0.5;
                g.strokeStyle = lng === 0 ? style.gridStrong : style.grid;
                g.beginPath();
                g.moveTo(x, m.oy);
                g.lineTo(x, m.oy + m.H);
                g.stroke();
            }
            for (let lat = -60; lat <= 60; lat += 30) {
                const y = Math.round(m.oy + ((90 - lat) / 180) * m.H) + 0.5;
                g.strokeStyle = lat === 0 ? style.gridStrong : style.grid;
                g.beginPath();
                g.moveTo(m.ox, y);
                g.lineTo(m.ox + m.W, y);
                g.stroke();
            }

            // Graticule labels (pinned to the visible edge of the map)
            g.font = `500 9px ${MONO}`;
            g.fillStyle = style.gridLabel;
            const labelY = Math.min(m.oy + m.H, h) - 6;
            g.textAlign = 'center';
            g.textBaseline = 'alphabetic';
            for (let lng = -150; lng <= 150; lng += 30) {
                const x = m.ox + ((lng + 180) / 360) * m.W;
                const txt = lng === 0 ? '0°' : `${Math.abs(lng)}°${lng < 0 ? 'W' : 'E'}`;
                g.fillText(txt, x, labelY);
            }
            const labelX = Math.max(m.ox, 0) + 6;
            g.textAlign = 'left';
            g.textBaseline = 'middle';
            for (let lat = -60; lat <= 60; lat += 30) {
                const y = m.oy + ((90 - lat) / 180) * m.H;
                const txt = lat === 0 ? 'EQ' : `${Math.abs(lat)}°${lat < 0 ? 'S' : 'N'}`;
                g.fillText(txt, labelX, y - 7);
            }

            // Hairline frame
            g.strokeStyle = style.frame;
            g.strokeRect(Math.round(m.ox) + 0.5, Math.round(m.oy) + 0.5, Math.round(m.W) - 1, Math.round(m.H) - 1);

            baseKeyRef.current = key;
            return base;
        };

        // ── Per-frame render ──
        const frame = (now: number) => {
            const { w, h, dpr } = sizeRef.current;
            if (!w || !h) return;

            const anim = animRef.current;
            if (anim) {
                const t = Math.min(1, (now - anim.start) / anim.dur);
                const e = easeInOutCubic(t);
                const lk = Math.log(anim.from.k) + (Math.log(anim.to.k) - Math.log(anim.from.k)) * e;
                viewRef.current = {
                    k: Math.exp(lk),
                    cu: anim.from.cu + (anim.to.cu - anim.from.cu) * e,
                    cv: anim.from.cv + (anim.to.cv - anim.from.cv) * e,
                };
                if (t >= 1) animRef.current = null;
            }
            viewRef.current = clampView(viewRef.current);
            const view = viewRef.current;
            const m = getMetrics(view);
            const { points: pts, arcs: arcList, rings: ringList, origin: org, theme: th, themeId: tid } = dataRef.current;
            const style = FLAT_STYLES[tid] ?? FLAT_STYLES['black-dots'];
            const hover = hoverRef.current;
            const pxPerDeg = m.W / 360;

            const base = renderBase(m);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(base, 0, 0);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            ctx.save();
            ctx.beginPath();
            ctx.rect(m.ox, m.oy, m.W, m.H);
            ctx.clip();

            // Beacon rings
            ctx.lineWidth = 1.2;
            for (const r of ringList) {
                const [x, y] = project(r.lat, r.lng, m);
                const duration = (r.maxRadius / (r.propagationSpeed || 1)) * 1000;
                const period = r.repeatPeriod || 2000;
                const maxPx = Math.min(80, Math.max(16, r.maxRadius * pxPerDeg));
                for (let n = 0; n * period < duration; n++) {
                    const age = (now % period) + n * period;
                    if (age >= duration) continue;
                    const t = age / duration;
                    ctx.strokeStyle = typeof r.color === 'function' ? r.color(t) : r.color;
                    ctx.beginPath();
                    ctx.arc(x, y, Math.max(0.5, t * maxPx), 0, TAU);
                    ctx.stroke();
                }
            }

            // Connection arcs
            ctx.lineCap = 'round';
            for (const a of arcList) {
                const hovered = hover?.type === 'arc' && hover.data === a.data;
                for (const shift of arcShifts(a)) {
                    const g = arcGeom(a, m, shift);
                    if (g.L < 3) continue;
                    const grad = ctx.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
                    grad.addColorStop(0, a.colors[0]);
                    grad.addColorStop(1, a.colors[1]);
                    ctx.strokeStyle = grad;

                    // Faint full trail
                    ctx.setLineDash([]);
                    ctx.globalAlpha = hovered ? 0.9 : a.isDiagnostic ? 0.5 : a.isAnomaly ? 0.32 : 0.16;
                    ctx.lineWidth = 0.6 + a.stroke * 0.6 + (hovered ? 1 : 0);
                    ctx.beginPath();
                    ctx.moveTo(g.x0, g.y0);
                    ctx.quadraticCurveTo(g.cx, g.cy, g.x1, g.y1);
                    ctx.stroke();

                    // Travelling comet dash
                    const progress = (now / a.period + a.phase) % 1;
                    const dash = g.L * (a.isDiagnostic ? 0.45 : 0.32);
                    ctx.globalAlpha = 1;
                    ctx.lineWidth = 0.8 + a.stroke * 1.1 + (hovered ? 0.8 : 0);
                    ctx.setLineDash([dash, g.L + dash]);
                    ctx.lineDashOffset = dash - progress * (g.L + dash);
                    ctx.beginPath();
                    ctx.moveTo(g.x0, g.y0);
                    ctx.quadraticCurveTo(g.cx, g.cy, g.x1, g.y1);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Glowing comet head
                    const head = (progress * (g.L + dash)) / g.L;
                    if (head > 0 && head < 1) {
                        const it = 1 - head;
                        const hx = it * it * g.x0 + 2 * it * head * g.cx + head * head * g.x1;
                        const hy = it * it * g.y0 + 2 * it * head * g.cy + head * head * g.y1;
                        const hr = 0.9 + a.stroke * 0.9;
                        ctx.fillStyle = a.colors[1];
                        ctx.globalAlpha = 0.22;
                        ctx.beginPath();
                        ctx.arc(hx, hy, hr * 2.8, 0, TAU);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                        ctx.beginPath();
                        ctx.arc(hx, hy, hr, 0, TAU);
                        ctx.fill();
                    }
                }
            }
            ctx.globalAlpha = 1;
            ctx.restore();

            // Nodes
            const pulse = 0.5 + 0.5 * Math.sin(now / 320);
            for (const p of pts) {
                const [x, y] = project(p.lat, p.lng, m);
                if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
                const r = pointRadius(p, view.k);
                // PoP specific pulsating radar ring
                if (p.isPop) {
                    ctx.strokeStyle = '#c084fc';
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    ctx.arc(x, y, r + 4 + 3 * pulse, 0, TAU);
                    ctx.stroke();
                }

                if (p.hasAnomaly || p.isDestination) {
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = 0.1 + 0.14 * pulse;
                    ctx.beginPath();
                    ctx.arc(x, y, r * 2.6, 0, TAU);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.beginPath();
                ctx.arc(x, y, r, 0, TAU);
                ctx.fillStyle = p.color;
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = style.outline;
                ctx.stroke();

                if (hover?.type === 'point' && hover.data === p) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(x, y, r + 4, 0, TAU);
                    ctx.stroke();
                }

                // Hop number & PoP badges
                if (p.isDiagnostic && !p.isOrigin) {
                    const isPoP = !!p.isPop;
                    const label = isPoP
                        ? `PoP #${p.hopNum}${view.k >= 2 && p.city ? ' · ' + p.city : ''}`
                        : `#${p.hopNum}`;
                    ctx.font = `700 9px ${MONO}`;
                    const tw = ctx.measureText(label).width + 8;
                    const bx = x + r + 4;
                    const by = y - r - 12;
                    ctx.fillStyle = isPoP ? 'rgba(76, 29, 149, 0.94)' : 'rgba(8, 47, 73, 0.94)';
                    ctx.strokeStyle = isPoP ? '#c084fc' : p.color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.roundRect(bx, by, tw, 13, 3);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = isPoP ? '#f3e8ff' : '#e0f2fe';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, bx + 4, by + 7);
                } else if (!p.isDiagnostic && view.k >= 2.4) {
                    // Zoomed-in city & threat labels on regular connections
                    const city = p.events?.[0]?.geo?.city || p.city || '';
                    if (city) {
                        ctx.font = `600 9px ${MONO}`;
                        ctx.fillStyle = p.hasAnomaly ? '#fca5a5' : 'rgba(226, 232, 240, 0.85)';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(city, x + r + 4, y);
                    }
                }
            }

            // Origin marker (local host)
            {
                const [x, y] = project(org.lat, org.lng, m);
                ctx.strokeStyle = th.originColor;
                ctx.globalAlpha = 0.75;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, y, 7, 0, TAU);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x - 11, y);
                ctx.lineTo(x - 8, y);
                ctx.moveTo(x + 8, y);
                ctx.lineTo(x + 11, y);
                ctx.moveTo(x, y - 11);
                ctx.lineTo(x, y - 8);
                ctx.moveTo(x, y + 8);
                ctx.lineTo(x, y + 11);
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.fillStyle = th.originColor;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, TAU);
                ctx.fill();
                ctx.font = `600 9px ${MONO}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.globalAlpha = 0.8;
                ctx.fillText('ORIGIN', x, y - 15);
                ctx.globalAlpha = 1;
            }
        };
        frameFnRef.current = frame;

        // ── Hit testing ──
        const hitTest = (mx: number, my: number): Hit | null => {
            const view = viewRef.current;
            const m = getMetrics(view);
            const { points: pts, arcs: arcList } = dataRef.current;
            let best: any = null;
            let bestD = Infinity;
            for (const p of pts) {
                const [x, y] = project(p.lat, p.lng, m);
                const d = Math.hypot(x - mx, y - my);
                if (d < pointRadius(p, view.k) + 5 && d < bestD) {
                    best = p;
                    bestD = d;
                }
            }
            if (best) return { type: 'point', data: best };

            for (let i = arcList.length - 1; i >= 0; i--) {
                const a = arcList[i];
                for (const shift of arcShifts(a)) {
                    const g = arcGeom(a, m, shift);
                    if (g.L < 3) continue;
                    let px = g.x0;
                    let py = g.y0;
                    for (let s = 1; s <= 20; s++) {
                        const t = s / 20;
                        const it = 1 - t;
                        const x = it * it * g.x0 + 2 * it * t * g.cx + t * t * g.x1;
                        const y = it * it * g.y0 + 2 * it * t * g.cy + t * t * g.y1;
                        const sx = x - px;
                        const sy = y - py;
                        const l2 = sx * sx + sy * sy || 1;
                        const u = Math.max(0, Math.min(1, ((mx - px) * sx + (my - py) * sy) / l2));
                        if (Math.hypot(px + u * sx - mx, py + u * sy - my) < 5) return { type: 'arc', data: a.data };
                        px = x;
                        py = y;
                    }
                }
            }
            return null;
        };

        const updateTooltip = (hit: Hit | null, mx: number, my: number) => {
            const tip = tooltipRef.current;
            if (!tip) return;
            if (!hit) {
                tip.style.opacity = '0';
                return;
            }
            if (hoverRef.current?.data !== hit.data || tip.style.opacity !== '1') {
                tip.innerHTML = hit.type === 'arc' ? buildArcLabel(hit.data) : buildPointLabel(hit.data);
            }
            const { w, h } = sizeRef.current;
            const tw = tip.offsetWidth;
            const th = tip.offsetHeight;
            const x = mx + 16 + tw > w - 8 ? mx - tw - 16 : mx + 16;
            const y = Math.max(8, Math.min(h - th - 8, my - th / 2));
            tip.style.transform = `translate(${x}px, ${y}px)`;
            tip.style.opacity = '1';
        };

        const updateReadout = (mx: number, my: number) => {
            const el = readoutRef.current;
            if (!el) return;
            const m = getMetrics(viewRef.current);
            const lng = ((mx - m.ox) / m.W) * 360 - 180;
            const lat = 90 - ((my - m.oy) / m.H) * 180;
            const zoom = `${viewRef.current.k.toFixed(1)}×`;
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                el.textContent = `EQUIRECTANGULAR · ${zoom}`;
                return;
            }
            el.textContent = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lng).toFixed(2)}°${
                lng >= 0 ? 'E' : 'W'
            } · ${zoom}`;
        };

        // ── Input ──
        let drag: { x: number; y: number; cu: number; cv: number; moved: boolean; id: number } | null = null;

        const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            return [e.clientX - rect.left, e.clientY - rect.top] as const;
        };

        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            const [mx, my] = local(e);
            animRef.current = null;
            drag = { x: mx, y: my, cu: viewRef.current.cu, cv: viewRef.current.cv, moved: false, id: e.pointerId };
            canvas.setPointerCapture(e.pointerId);
        };

        const onPointerMove = (e: PointerEvent) => {
            const [mx, my] = local(e);
            updateReadout(mx, my);
            if (drag) {
                const dx = mx - drag.x;
                const dy = my - drag.y;
                if (!drag.moved && Math.hypot(dx, dy) > 4) {
                    drag.moved = true;
                    canvas.style.cursor = 'grabbing';
                    updateTooltip(null, 0, 0);
                    hoverRef.current = null;
                }
                if (drag.moved) {
                    const m = getMetrics(viewRef.current);
                    viewRef.current = clampView({
                        ...viewRef.current,
                        cu: drag.cu - dx / m.W,
                        cv: drag.cv - dy / m.H,
                    });
                }
                return;
            }
            const hit = hitTest(mx, my);
            updateTooltip(hit, mx, my);
            hoverRef.current = hit;
            canvas.style.cursor = hit ? 'pointer' : 'grab';
        };

        const onPointerUp = (e: PointerEvent) => {
            if (!drag) return;
            const wasDrag = drag.moved;
            if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
            drag = null;
            canvas.style.cursor = 'grab';
            if (wasDrag) return;
            const [mx, my] = local(e);
            const hit = hitTest(mx, my);
            if (hit?.type === 'arc') callbacksRef.current.onArcClick(hit.data);
            else if (hit?.type === 'point') callbacksRef.current.onPointClick(hit.data);
        };

        const onPointerLeave = () => {
            if (drag) return;
            hoverRef.current = null;
            updateTooltip(null, 0, 0);
            if (readoutRef.current) readoutRef.current.textContent = `EQUIRECTANGULAR · ${viewRef.current.k.toFixed(1)}×`;
        };

        const zoomAt = (mx: number, my: number, factor: number) => {
            const v = viewRef.current;
            const m = getMetrics(v);
            const u = (mx - m.ox) / m.W;
            const vv = (my - m.oy) / m.H;
            const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
            const { w, h } = sizeRef.current;
            const W2 = (m.W / v.k) * k;
            const H2 = W2 / 2;
            viewRef.current = clampView({ k, cu: (w / 2 - (mx - u * W2)) / W2, cv: (h / 2 - (my - vv * H2)) / H2 });
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            animRef.current = null;
            const [mx, my] = local(e);
            zoomAt(mx, my, Math.exp(-e.deltaY * 0.0015));
            updateReadout(mx, my);
        };

        const onDblClick = (e: MouseEvent) => {
            const [mx, my] = local(e);
            const m = getMetrics(viewRef.current);
            const v = viewRef.current;
            animateTo({ k: v.k * 2, cu: (mx - m.ox) / m.W, cv: (my - m.oy) / m.H }, 450);
        };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerLeave);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('dblclick', onDblClick);

        return () => {
            ro.disconnect();
            frameFnRef.current = null;
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('dblclick', onDblClick);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Render loop only runs while the flat projection is visible ──
    useEffect(() => {
        if (!active) return;
        let raf = 0;
        const loop = (now: number) => {
            frameFnRef.current?.(now);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [active]);

    return (
        <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
            <canvas
                ref={canvasRef}
                id="flat-map-canvas"
                aria-label="Flat world map of network connections"
                role="img"
                className="absolute inset-0 block"
                style={{ cursor: 'grab', touchAction: 'none' }}
            />
            <div
                ref={tooltipRef}
                className="pointer-events-none absolute left-0 top-0 z-30 transition-opacity duration-150"
                style={{ opacity: 0 }}
            />
            <div
                ref={readoutRef}
                className="pointer-events-none absolute bottom-32 left-6 z-10 px-2.5 py-1 rounded-lg glass-card border border-slate-700/70 text-[10px] font-mono tracking-wider text-slate-400 tabular-nums"
            >
                EQUIRECTANGULAR · 1.0×
            </div>
        </div>
    );
});
