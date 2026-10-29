import { useEffect, useRef, useState, useCallback } from 'react';
import { HolographicCardLogo } from './HolographicCardLogo';

interface LoadingScreenProps {
    loaded?: boolean;
    manualDismiss?: boolean;
    onComplete: () => void;
}

// ── Remotion Animation Primitives (Easing, Spring & Interpolation) ──

/**
 * Remotion-standard cubic bezier easing: Easing.bezier(0.16, 1, 0.3, 1)
 * Used by Apple design engineering and Remotion for fluid momentum curves.
 */
function remotionCubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
    const cx = 3 * p1x;
    const bx = 3 * (p2x - p1x) - cx;
    const ax = 1 - cx - bx;

    const cy = 3 * p1y;
    const by = 3 * (p2y - p1y) - cy;
    const ay = 1 - cy - by;

    function sampleCurveX(t: number) {
        return ((ax * t + bx) * t + cx) * t;
    }

    function sampleCurveY(t: number) {
        return ((ay * t + by) * t + cy) * t;
    }

    function solveCurveX(x: number) {
        let t0 = 0;
        let t1 = 1;
        let t2 = x;
        for (let i = 0; i < 8; i++) {
            const x2 = sampleCurveX(t2) - x;
            if (Math.abs(x2) < 1e-4) return t2;
            const d2 = (3 * ax * t2 + 2 * bx) * t2 + cx;
            if (Math.abs(d2) < 1e-5) break;
            t2 = t2 - x2 / d2;
        }
        while (t0 < t1) {
            const x2 = sampleCurveX(t2);
            if (Math.abs(x2 - x) < 1e-4) return t2;
            if (x > x2) t0 = t2;
            else t1 = t2;
            t2 = (t1 - t0) * 0.5 + t0;
        }
        return t2;
    }

    return function (x: number): number {
        return sampleCurveY(solveCurveX(Math.max(0, Math.min(1, x))));
    };
}

const easeAntigravity = remotionCubicBezier(0.16, 1, 0.3, 1);

/**
 * Remotion interpolate implementation
 */
function remotionInterpolate(
    input: number,
    inputRange: [number, number],
    outputRange: [number, number],
    options?: {
        extrapolateLeft?: 'clamp' | 'extend';
        extrapolateRight?: 'clamp' | 'extend';
        easing?: (t: number) => number;
    }
): number {
    const [inMin, inMax] = inputRange;
    const [outMin, outMax] = outputRange;
    if (inMax === inMin) return outMin;
    let t = (input - inMin) / (inMax - inMin);

    if (options?.extrapolateLeft === 'clamp' && t < 0) t = 0;
    if (options?.extrapolateRight === 'clamp' && t > 1) t = 1;

    if (options?.easing) {
        t = options.easing(Math.max(0, Math.min(1, t)));
    }

    return outMin + t * (outMax - outMin);
}

// ── 2D/3D Simplex Noise (Exact match to Google Antigravity snoise shader) ──
function createAntigravityNoise() {
    const p = new Uint8Array(256);
    const seed = 127;
    let s = seed;
    for (let i = 0; i < 256; i++) {
        s = (s * 16807 + 11) % 2147483647;
        p[i] = s & 255;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
        perm[i] = p[i & 255];
    }

    const grad3 = [
        [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
        [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
        [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
    ];

    return function noise2D(xin: number, yin: number): number {
        const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = xin - X0;
        const y0 = yin - Y0;

        let i1 = 0, j1 = 0;
        if (x0 > y0) { i1 = 1; j1 = 0; }
        else { i1 = 0; j1 = 1; }

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;

        const ii = i & 255;
        const jj = j & 255;

        const gi0 = perm[ii + perm[jj]] % 12;
        const gi1 = perm[ii + i1 + perm[jj + j1]] % 12;
        const gi2 = perm[ii + 1 + perm[jj + 1]] % 12;

        let n0 = 0, n1 = 0, n2 = 0;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 > 0) {
            t0 *= t0;
            n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 > 0) {
            t1 *= t1;
            n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 > 0) {
            t2 *= t2;
            n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2);
        }

        return 70.0 * (n0 + n1 + n2);
    };
}

// ── Particle Data Structures ──

interface FieldParticle {
    baseX: number;           // Normalized reference anchor [0, 1]
    baseY: number;           // Normalized reference anchor [0, 1]
    x: number;               // Current world position (px)
    y: number;
    prevX: number;
    prevY: number;
    size: number;            // Radius / semi-minor axis (px)
    color: string;           // Tri-color blended Google palette
    alpha: number;           // Target opacity
    seed: number;            // Random phase offset
    scale: number;           // Dynamic scale [0..1]
    velocity: number;        // Inertial velocity from shockwave
}

interface OrbitalSatellite {
    angle: number;           // Radial orbital angle
    speed: number;           // Angular velocity
    orbitRadius: number;     // Distance from gravity center
    radiusVariation: number; // Harmonic breath scale
    size: number;
    color: string;
    alpha: number;
    pulsePhase: number;
    pulseSpeed: number;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    trailDelay: number;
}

// Google Antigravity Brand Palette
const ANTIGRAVITY_COLORS = {
    blue: '#3186FF',    // Electric Cobalt Blue
    royal: '#4285F4',   // Google Royal Blue
    coral: '#FC413D',   // Crimson Coral Red
    red: '#EA4335',     // Google Bright Red
    amber: '#FBBC04',   // Solar Warm Gold
    yellow: '#FFEE48',  // Radiant Yellow
    emerald: '#00B95C',  // Emerald Green
    mint: '#34A853',    // Mint Green
    periwinkle: '#7189FF', // Antigravity Lavender / Violet
    sky: '#8AB4F8',     // Starlight Sky Blue
    white: '#FFFFFF',   // Starlight White
};

const COLOR_SWATCHES = [
    ANTIGRAVITY_COLORS.blue,
    ANTIGRAVITY_COLORS.periwinkle,
    ANTIGRAVITY_COLORS.sky,
    ANTIGRAVITY_COLORS.coral,
    ANTIGRAVITY_COLORS.emerald,
    ANTIGRAVITY_COLORS.white,
];

// Helper: smoothstep equivalent
function smoothstep(min: number, max: number, value: number): number {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}

// Helper: color interpolator matching the Antigravity shader mix (Electric Blue -> Periwinkle -> Starlight Sky)
function interpolateTriColor(t: number): string {
    const clamped = Math.max(0, Math.min(1, t));
    const h = 0.5;
    if (clamped < h) {
        // Mix Google Electric Blue (#3186FF) to Periwinkle (#7189FF)
        const p = clamped / h;
        const r = Math.round(49 + (113 - 49) * p);
        const g = Math.round(134 + (137 - 134) * p);
        const b = Math.round(255 + (255 - 255) * p);
        return `rgb(${r}, ${g}, ${b})`;
    } else {
        // Mix Periwinkle (#7189FF) to Starlight Sky Blue (#8AB4F8)
        const p = (clamped - h) / (1 - h);
        const r = Math.round(113 + (138 - 113) * p);
        const g = Math.round(137 + (180 - 137) * p);
        const b = Math.round(255 + (248 - 255) * p);
        return `rgb(${r}, ${g}, ${b})`;
    }
}

export function LoadingScreen({ onComplete, manualDismiss = false }: LoadingScreenProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [progress, setProgress] = useState(0);
    const [statusIndex, setStatusIndex] = useState(0);
    const [isExiting, setIsExiting] = useState(false);

    // 5 telemetry initialization milestones
    const statusSteps = [
        'INITIALIZING SIGNALMAP AEROSPACE ENGINE...',
        'CONNECTING ANTIGRAVITY TELEMETRY FIELD...',
        'CALIBRATING 3D ORBITAL TOPOLOGY...',
        'SYNCHRONIZING REALTIME WEBSOCKET FEED...',
        'READY // ORBITAL LOCK CONFIRMED',
    ];

    // Dismiss trigger for manual dismiss mode
    const handleDismiss = useCallback(() => {
        if (isExiting) return;
        setIsExiting(true);
        setTimeout(() => {
            onComplete();
        }, 700);
    }, [isExiting, onComplete]);

    // ── Enforce Duration with Remotion-Smooth Interpolation ──
    useEffect(() => {
        const TOTAL_DURATION_MS = manualDismiss ? 3200 : 5000;
        const startTime = performance.now();

        const timer = setInterval(() => {
            const now = performance.now();
            const elapsed = now - startTime;
            const rawProgress = Math.min(1, elapsed / TOTAL_DURATION_MS);

            // Remotion cubic bezier ease for realistic physics momentum
            const smoothPct = Math.floor(
                remotionInterpolate(rawProgress, [0, 1], [0, 100], {
                    easing: easeAntigravity,
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                })
            );

            setProgress(smoothPct);

            const step = Math.min(
                statusSteps.length - 1,
                Math.floor(rawProgress * statusSteps.length)
            );
            setStatusIndex(step);

            if (elapsed >= TOTAL_DURATION_MS) {
                clearInterval(timer);
                setProgress(100);
                setStatusIndex(statusSteps.length - 1);

                // If not manual dismiss, automatically exit
                if (!manualDismiss) {
                    setTimeout(() => {
                        setIsExiting(true);
                        setTimeout(() => {
                            onComplete();
                        }, 700);
                    }, 120);
                }
            }
        }, 20);

        return () => clearInterval(timer);
    }, [onComplete, manualDismiss, statusSteps.length]);

    // ── Exact Antigravity Warp Field & Orbital Satellite Canvas Simulation ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        let animationFrameId: number;
        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);

        const handleResize = () => {
            if (!canvas) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.scale(dpr, dpr);
        };

        handleResize();
        window.addEventListener('resize', handleResize);

        const noise2D = createAntigravityNoise();

        // Gravitational ring center & mouse tracking state
        let targetX = width * 0.5;
        let targetY = height * 0.44;
        let ringX = targetX;
        let ringY = targetY;
        let isMouseActive = false;

        const handleMouseMove = (e: MouseEvent) => {
            targetX = e.clientX;
            targetY = e.clientY;
            isMouseActive = true;
        };

        window.addEventListener('mousemove', handleMouseMove);

        // 1. Generate Ambient Antigravity Field Particles (Hexagonal/organic field distribution)
        const fieldParticles: FieldParticle[] = [];
        const cols = 16;
        const rows = 10;
        const totalField = cols * rows;

        for (let i = 0; i < totalField; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);

            // Jittered grid positions across viewport
            const jitterX = (Math.random() - 0.5) * 0.05;
            const jitterY = (Math.random() - 0.5) * 0.06;
            const baseX = (col + 0.5) / cols + jitterX;
            const baseY = (row + 0.5) / rows + jitterY;

            const initialX = baseX * width;
            const initialY = baseY * height;

            fieldParticles.push({
                baseX,
                baseY,
                x: initialX,
                y: initialY,
                prevX: initialX,
                prevY: initialY,
                size: Math.random() < 0.15 ? Math.random() * 0.4 + 1.2 : Math.random() * 0.4 + 0.75,
                color: COLOR_SWATCHES[i % COLOR_SWATCHES.length],
                alpha: Math.random() * 0.25 + 0.35,
                seed: Math.random() * 100,
                scale: 0.2,
                velocity: 0,
            });
        }

        // 2. Generate Focused Orbital Satellites circling the Antigravity core
        const orbitalSatellites: OrbitalSatellite[] = [];
        const orbitalCount = 42;

        for (let i = 0; i < orbitalCount; i++) {
            const shell = i % 4;
            const minR = 34 + shell * 22;
            const maxR = minR + 20;
            const orbitRadius = Math.random() * (maxR - minR) + minR;

            // Slower, elegant orbital velocities with dual spin directions
            const speed = (Math.random() * 0.7 + 0.5) * (shell % 2 === 0 ? 1 : -1);
            const initialAngle = Math.random() * Math.PI * 2;
            const initialX = ringX + Math.cos(initialAngle) * orbitRadius;
            const initialY = ringY + Math.sin(initialAngle) * orbitRadius;

            orbitalSatellites.push({
                angle: initialAngle,
                speed,
                orbitRadius,
                radiusVariation: Math.random() * 14 + 6,
                size: Math.random() < 0.2 ? Math.random() * 0.4 + 1.2 : Math.random() * 0.4 + 0.8,
                color: COLOR_SWATCHES[i % COLOR_SWATCHES.length],
                alpha: Math.random() * 0.3 + 0.45,
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: Math.random() * 0.03 + 0.015,
                x: initialX,
                y: initialY,
                prevX: initialX,
                prevY: initialY,
                trailDelay: Math.random() * 0.08 + 0.14,
            });
        }

        let time = 0;

        // ── Main Simulation Loop Matching Google Antigravity Shaders ──
        const render = () => {
            time += 0.014;
            ctx.clearRect(0, 0, width, height);

            // Remotion-like spring follow for gravitational ring center
            const springStiffness = isMouseActive ? 0.08 : 0.025;
            ringX += (targetX - ringX) * springStiffness;
            ringY += (targetY - ringY) * springStiffness;

            // Natural floating idle sway when mouse is stationary
            const idleDriftX = Math.sin(time * 0.8) * 12 + Math.cos(time * 1.6) * 6;
            const idleDriftY = Math.cos(time * 0.7) * 8 + Math.sin(time * 1.4) * 5;
            const currentCoreX = ringX + idleDriftX;
            const currentCoreY = ringY + idleDriftY;

            // ── Exact Antigravity Ring Parameters ──
            // uRingRadius = 0.175 + sin(time * 1.0) * 0.03 + cos(time * 3.0) * 0.02
            const maxDim = Math.max(width, height);
            const normRingRadius = 0.18 + Math.sin(time * 1.0) * 0.035 + Math.cos(time * 2.8) * 0.02;
            const pixelRingRadius = normRingRadius * maxDim;
            const pixelRingWidth = 0.012 * maxDim;
            const pixelRingWidth2 = 0.09 * maxDim;
            const ringDisplacement = 0.55;

            // Soft radial gravitational glow centered on ring
            const haloGrad = ctx.createRadialGradient(
                currentCoreX, currentCoreY, 0,
                currentCoreX, currentCoreY, pixelRingRadius * 1.3
            );
            haloGrad.addColorStop(0, 'rgba(49, 134, 255, 0.09)');
            haloGrad.addColorStop(0.35, 'rgba(113, 137, 255, 0.04)');
            haloGrad.addColorStop(0.8, 'rgba(252, 65, 61, 0.015)');
            haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(currentCoreX, currentCoreY, pixelRingRadius * 1.3, 0, Math.PI * 2);
            ctx.fill();

            // ── Pass 1: Render Field Particles with Warp Shockwave & Capsule Rotation ──
            for (let i = 0; i < fieldParticles.length; i++) {
                const p = fieldParticles[i];

                const refX = p.baseX * width;
                const refY = p.baseY * height;

                // 1. Distance from expanding warp ring
                const dx = refX - currentCoreX;
                const dy = refY - currentCoreY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 2. Multi-scale noise displacement (Shader match)
                const noise1 = noise2D(p.baseX * 4.0 + 88.494, p.baseY * 4.0 + time * 0.35);
                const noise2 = noise2D(p.baseX * 4.0 + 50.904, p.baseY * 4.0 + time * 0.35);
                const noise3 = noise2D(p.baseX * 18.0 + 18.492, p.baseY * 18.0 + time * 0.5);
                const noise4 = noise2D(p.baseX * 18.0 + 50.904, p.baseY * 18.0 + time * 0.5);

                let dispX = (noise1 * 0.03 + noise3 * 0.006) * width;
                let dispY = (noise2 * 0.03 + noise4 * 0.006) * height;

                // Harmonic sine drift
                const distClamp = Math.min(1, Math.max(0, dist / (maxDim * 0.5)));
                dispX += Math.sin(p.baseX * 20.0 + time * 3.5) * 14 * distClamp;
                dispY += Math.cos(p.baseY * 20.0 + time * 2.8) * 14 * distClamp;

                // 3. Shockwave impulse from ring wave:
                // float t = smoothstep(uRingRadius - uRingWidth*2, uRingRadius, dist) - smoothstep(uRingRadius, uRingRadius + uRingWidth, dist)
                const tWave =
                    smoothstep(pixelRingRadius - pixelRingWidth * 2, pixelRingRadius, dist) -
                    smoothstep(pixelRingRadius, pixelRingRadius + pixelRingWidth, dist);
                const tWave2 =
                    smoothstep(pixelRingRadius - pixelRingWidth2 * 2, pixelRingRadius, dist) -
                    smoothstep(pixelRingRadius, pixelRingRadius + pixelRingWidth2, dist);

                const waveScale = Math.pow(Math.max(0, tWave), 2) + Math.pow(Math.max(0, tWave2), 3) * 2.8;

                // Radial shockwave push/pull
                const ringPush = Math.pow(Math.max(0, tWave2), 0.75) * ringDisplacement * 45;
                const pushAngle = Math.atan2(dy, dx);
                const pushX = Math.cos(pushAngle) * ringPush;
                const pushY = Math.sin(pushAngle) * ringPush;

                const targetWorldX = refX + dispX + pushX;
                const targetWorldY = refY + dispY + pushY;

                // Smooth momentum interpolation
                p.prevX = p.x;
                p.prevY = p.y;
                p.x += (targetWorldX - p.x) * 0.12;
                p.y += (targetWorldY - p.y) * 0.12;

                const curVx = p.x - p.prevX;
                const curVy = p.y - p.prevY;
                const speedMag = Math.sqrt(curVx * curVx + curVy * curVy);

                // 4. Orientation: align capsule radially + local turbulence
                const baseAngle = Math.atan2(p.y - currentCoreY, p.x - currentCoreX);
                const noiseAngle = noise2D(p.baseX * 10.0, p.baseY * 10.0 + time * 0.85);
                const rotation = baseAngle + noiseAngle * 0.45;

                // 5. Dynamic scale & capsule elongation (refined, delicate starlight scale)
                p.scale += (waveScale - p.scale) * 0.18;
                const stretch = Math.min(1.7, 1.0 + speedMag * 0.16 + waveScale * 0.35);
                const rx = p.size * (1 + p.scale * 0.25) * stretch;
                const ry = p.size * (1 + p.scale * 0.15);

                // 6. Tri-color blend based on local noise and ring wave
                const noiseColorVal = (noise2D(p.baseX * 3.0 + 74.6, p.baseY * 3.0 + time * 0.4) + 1) * 0.5;
                const colorProg = Math.max(0, Math.min(1, Math.pow(noiseColorVal, 1.8) + waveScale * 0.35));
                const activeColor = interpolateTriColor(colorProg);

                const finalAlpha = Math.max(0.15, Math.min(0.85, p.alpha + waveScale * 0.35));

                // Draw oriented capsule
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(rotation);

                ctx.shadowColor = activeColor;
                ctx.shadowBlur = waveScale > 0.3 ? 5 : 2;
                ctx.fillStyle = activeColor;
                ctx.globalAlpha = finalAlpha;

                ctx.beginPath();
                ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();

                // Gentle starlight glint for particles undergoing high wave displacement
                if (waveScale > 0.4) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.globalAlpha = finalAlpha * 0.6;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, rx * 0.45, ry * 0.45, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }

            // ── Pass 2: Render High-Speed Orbital Satellites around Gravity Core ──
            for (let i = 0; i < orbitalSatellites.length; i++) {
                const s = orbitalSatellites[i];

                // Advance orbit
                s.angle += s.speed * 0.016;

                // Breathing variation + local swirl turbulence
                const swirlNoise = noise2D(
                    Math.cos(s.angle) * 1.5 + time * 0.35,
                    Math.sin(s.angle) * 1.5 + i * 0.15
                );
                const currentRadius =
                    s.orbitRadius +
                    Math.sin(time * 2.2 + s.pulsePhase) * s.radiusVariation +
                    swirlNoise * 14;

                const destX = currentCoreX + Math.cos(s.angle) * currentRadius;
                const destY = currentCoreY + Math.sin(s.angle) * currentRadius;

                // Inertial fluid trail
                s.prevX = s.x;
                s.prevY = s.y;
                s.x += (destX - s.x) * s.trailDelay;
                s.y += (destY - s.y) * s.trailDelay;

                const svx = s.x - s.prevX;
                const svy = s.y - s.prevY;
                const sSpeed = Math.sqrt(svx * svx + svy * svy);
                const flowAngle = Math.atan2(svy, svx);

                s.pulsePhase += s.pulseSpeed;
                const pulseA = s.alpha + Math.sin(s.pulsePhase) * 0.12;
                const finalA = Math.max(0.2, Math.min(0.85, pulseA));

                const stretch = Math.min(1.7, 1.0 + sSpeed * 0.16);
                const srx = s.size * stretch;
                const sry = s.size;

                ctx.save();
                ctx.translate(s.x, s.y);
                ctx.rotate(flowAngle);

                ctx.shadowColor = s.color;
                ctx.shadowBlur = sSpeed > 1.5 ? 6 : 3;
                ctx.fillStyle = s.color;
                ctx.globalAlpha = finalA;

                ctx.beginPath();
                ctx.ellipse(0, 0, srx, sry, 0, 0, Math.PI * 2);
                ctx.fill();

                if (s.size > 1.3) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.globalAlpha = finalA * 0.45;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, srx * 0.4, sry * 0.4, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    return (
        <div
            onClick={manualDismiss ? handleDismiss : undefined}
            className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070b12] text-slate-200 select-none overflow-hidden transition-all duration-700 ease-out ${
                isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
            } ${manualDismiss ? 'cursor-pointer' : ''}`}
        >
            {/* ── Antigravity Warp Canvas: Expanding Shockwave Field + Orbital Satellites ── */}
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-20" />

            {/* ── Ambient Antigravity Nebula Atmosphere ── */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-gradient-to-tr from-[#3186FF]/12 via-[#7189FF]/8 to-transparent rounded-full blur-[140px] pointer-events-none z-0" />

            {/* ── Central SignalMap Hero Branding Container ── */}
            <div className="relative z-10 flex flex-col items-center max-w-lg px-6 text-center animate-fade-in pointer-events-auto">
                {/* Precision Aerospace Logo Holographic Card */}
                <div className="relative flex items-center justify-center mb-7">
                    {/* Outer Rotating Dashed Gravitational Ring */}
                    <div className="absolute w-72 h-72 rounded-full border border-dashed border-[#7189FF]/30 animate-[spin_28s_linear_infinite] pointer-events-none" />

                    {/* Counter-Rotating Inner Field Ring */}
                    <div className="absolute w-60 h-60 rounded-full border border-[#3186FF]/25 animate-[spin_20s_linear_infinite_reverse] pointer-events-none" />

                    {/* Concentric Pulsing Radar Blip Wave */}
                    <span className="absolute w-52 h-52 rounded-full bg-[#7189FF]/10 animate-ping pointer-events-none" />

                    {/* Central Holographic Keycard Emblem (vgpu.sh holographic card shader effect) */}
                    <HolographicCardLogo onCardClick={manualDismiss ? handleDismiss : undefined} />
                </div>

                {/* Brand Typography */}
                <div className="flex flex-col items-center gap-1.5 mb-6">
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl md:text-4xl font-extrabold tracking-[0.22em] font-mono uppercase text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.25)]">
                            SIGNAL<span className="bg-gradient-to-r from-[#7189FF] via-[#8AB4F8] to-[#00B95C] bg-clip-text text-transparent">MAP</span>
                        </h1>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#3186FF]/20 border border-[#7189FF]/40 text-[#8AB4F8] shadow-sm">
                            v4.8-aero
                        </span>
                    </div>
                    <p className="text-[11px] md:text-xs font-mono uppercase tracking-[0.25em] text-slate-400 font-medium">
                        Aerospace Telemetry &amp; Threat Observability
                    </p>
                </div>

                {/* Precision Progress Track with Remotion Easing */}
                <div className="w-64 md:w-80 flex flex-col gap-2.5 mb-5">
                    <div className="relative w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden border border-slate-700/60 p-[1px]">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-[#3186FF] via-[#7189FF] to-[#00B95C] transition-all duration-75 ease-linear shadow-[0_0_18px_rgba(113,137,255,0.9)] relative"
                            style={{ width: `${progress}%` }}
                        >
                            {/* High-speed scanline shimmer */}
                            <div className="absolute inset-0 bg-white/40 animate-pulse" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                        <span className="text-[#8AB4F8] font-semibold truncate max-w-[210px] text-left">
                            {manualDismiss && progress >= 100
                                ? 'READY // CLICK ANYWHERE TO DISMISS'
                                : statusSteps[statusIndex]}
                        </span>
                        <span className="font-bold text-slate-200">{progress}%</span>
                    </div>
                </div>

                {/* Dismiss Button Badge when opened from Settings */}
                {manualDismiss && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss();
                        }}
                        className="mb-4 px-4 py-1.5 rounded-full border border-cyan-500/40 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 font-mono text-[11px] tracking-widest flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition cursor-pointer animate-pulse"
                    >
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>CLICK ANYWHERE TO DISMISS</span>
                    </div>
                )}

                {/* Aerospace Telemetry Metadata Footer */}
                <div className="flex items-center justify-center gap-3 text-[10px] font-mono text-slate-500 border-t border-slate-800/80 pt-3">
                    <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00B95C] animate-pulse" />
                        <span className="text-slate-400">STREAM: ACTIVE</span>
                    </div>
                    <span className="text-slate-700">&bull;</span>
                    <span className="text-slate-400">ENCRYPTION: AIRGAP VERIFIED</span>
                    <span className="text-slate-700">&bull;</span>
                    <span className="text-slate-400">LATENCY: &lt;1MS</span>
                </div>
            </div>
        </div>
    );
}
