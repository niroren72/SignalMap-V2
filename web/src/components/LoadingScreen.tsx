import { useEffect, useRef, useState } from 'react';

interface LoadingScreenProps {
    loaded?: boolean;
    onComplete: () => void;
}

// ── Fast 2D Simplex Noise for Organic Fluid Swirl (Matches Google Antigravity snoise) ──
function createNoise() {
    const p = new Uint8Array(256);
    const seed = 99;
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
        [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
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

interface CirclingDot {
    angle: number;          // Current angular position around mouse
    speed: number;          // Orbit angular velocity
    direction: 1 | -1;      // Orbit direction
    orbitRadius: number;    // Base distance from mouse pointer
    radiusVariation: number;// Sine breathing scale
    size: number;           // Dot radius (px)
    color: string;          // Vivid Google / Antigravity color
    alpha: number;          // Opacity
    pulsePhase: number;
    pulseSpeed: number;
    x: number;              // Current interpolated world position
    y: number;
    prevX: number;
    prevY: number;
    trailDelay: number;     // Inertia drag factor
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [progress, setProgress] = useState(0);
    const [statusIndex, setStatusIndex] = useState(0);
    const [isExiting, setIsExiting] = useState(false);

    // 5 distinct 1-second initialization status steps
    const statusSteps = [
        'INITIALIZING SIGNALMAP AEROSPACE ENGINE...',
        'CONNECTING ANTIGRAVITY TELEMETRY FIELD...',
        'CALIBRATING 3D ORBITAL TOPOLOGY...',
        'SYNCHRONIZING REALTIME WEBSOCKET FEED...',
        'READY // ORBITAL LOCK CONFIRMED',
    ];

    // ── Enforce Exact 5.0 Seconds Loading Duration ──
    useEffect(() => {
        const TOTAL_DURATION_MS = 5000;
        const startTime = performance.now();

        const timer = setInterval(() => {
            const now = performance.now();
            const elapsed = now - startTime;
            const currentPct = Math.min(100, (elapsed / TOTAL_DURATION_MS) * 100);

            setProgress(Math.floor(currentPct));

            const step = Math.min(
                statusSteps.length - 1,
                Math.floor((elapsed / TOTAL_DURATION_MS) * statusSteps.length)
            );
            setStatusIndex(step);

            if (elapsed >= TOTAL_DURATION_MS) {
                clearInterval(timer);
                setProgress(100);
                setStatusIndex(statusSteps.length - 1);

                // Trigger smooth 700ms exit fade
                setTimeout(() => {
                    setIsExiting(true);
                    setTimeout(() => {
                        onComplete();
                    }, 700);
                }, 100);
            }
        }, 30);

        return () => clearInterval(timer);
    }, [onComplete, statusSteps.length]);

    // ── Flying Dots Circling ONLY Around Mouse Pointer (Exact antigravity.google match) ──
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
            const dpr = window.devicePixelRatio || 1;
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

        const noise2D = createNoise();

        // Exact Google Antigravity Multicolored Palette
        const antigravityColors = [
            '#3186FF', // Google Electric Blue
            '#4285F4', // Google Royal Blue
            '#FC413D', // Google Crimson Red
            '#EA4335', // Google Coral Red
            '#FBBC04', // Google Warm Gold
            '#FFEE48', // Google Bright Yellow
            '#00B95C', // Google Emerald Green
            '#34A853', // Google Mint Green
            '#7189FF', // Antigravity Lilac / Periwinkle
            '#8AB4F8', // Starlight Sky Blue
            '#FFFFFF', // Pure Starlight White
        ];

        // Anchor mouse initially to screen center where the logo resides
        let mouseX = width * 0.5;
        let mouseY = height * 0.44;
        let targetX = mouseX;
        let targetY = mouseY;
        let hasUserMovedMouse = false;

        const handleMouseMove = (e: MouseEvent) => {
            targetX = e.clientX;
            targetY = e.clientY;
            hasUserMovedMouse = true;
        };

        window.addEventListener('mousemove', handleMouseMove);

        // Populate ~55-60 vibrant dots clustered ONLY around the pointer
        const dotCount = 58;
        const dots: CirclingDot[] = [];

        for (let i = 0; i < dotCount; i++) {
            // Wider concentric orbit shells around the mouse (from 36px to 155px)
            const shellTier = i % 5;
            const minR = 36 + shellTier * 24;
            const maxR = minR + 22;
            const orbitRadius = Math.random() * (maxR - minR) + minR;

            // Slower, calmer orbital velocities and bidirectional drift
            const speed = (Math.random() * 0.8 + 0.6) * (shellTier % 2 === 0 ? 1 : -1);
            const color = antigravityColors[i % antigravityColors.length];

            const initialAngle = Math.random() * Math.PI * 2;
            const initialX = targetX + Math.cos(initialAngle) * orbitRadius;
            const initialY = targetY + Math.sin(initialAngle) * orbitRadius;

            dots.push({
                angle: initialAngle,
                speed,
                direction: speed >= 0 ? 1 : -1,
                orbitRadius,
                radiusVariation: Math.random() * 16 + 8,
                size: Math.random() < 0.25 ? Math.random() * 1.2 + 2.4 : Math.random() * 0.9 + 1.3,
                color,
                alpha: Math.random() * 0.25 + 0.35, // Softer, less glaring brightness
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: Math.random() * 0.03 + 0.015,
                x: initialX,
                y: initialY,
                prevX: initialX,
                prevY: initialY,
                trailDelay: Math.random() * 0.10 + 0.14, // Fluid organic lag
            });
        }

        let time = 0;

        // ── Main Render Loop ──
        const render = () => {
            time += 0.012; // Calmer noise and breathing frequency
            ctx.clearRect(0, 0, width, height);

            // Smooth pointer tracking with soft inertia
            const followSpeed = hasUserMovedMouse ? 0.20 : 0.04;
            mouseX += (targetX - mouseX) * followSpeed;
            mouseY += (targetY - mouseY) * followSpeed;

            // Soft, gentle mouse halo illumination matched to wider radius
            const haloGrad = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 190);
            haloGrad.addColorStop(0, 'rgba(113, 137, 255, 0.08)');
            haloGrad.addColorStop(0.5, 'rgba(49, 134, 255, 0.02)');
            haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(mouseX, mouseY, 190, 0, Math.PI * 2);
            ctx.fill();

            // Render each circling dot ONLY around mouse pointer
            for (let i = 0; i < dots.length; i++) {
                const dot = dots[i];

                // 1. Advance angular orbit around pointer (slower float)
                dot.angle += dot.speed * 0.015;

                // 2. Organic fluid swirl displacement (Simplex Noise radial turbulence)
                const noiseVal = noise2D(
                    Math.cos(dot.angle) * 1.6 + time * 0.3,
                    Math.sin(dot.angle) * 1.6 + (i * 0.1)
                );
                const currentOrbitR = dot.orbitRadius + Math.sin(time * 2.0 + dot.pulsePhase) * dot.radiusVariation + (noiseVal * 12);

                // 3. Compute target orbit coordinate centered on mouseX, mouseY
                const destX = mouseX + Math.cos(dot.angle) * currentOrbitR;
                const destY = mouseY + Math.sin(dot.angle) * currentOrbitR;

                // 4. Smooth momentum interpolation (fluid trail when mouse moves)
                dot.prevX = dot.x;
                dot.prevY = dot.y;
                dot.x += (destX - dot.x) * dot.trailDelay;
                dot.y += (destY - dot.y) * dot.trailDelay;

                // 5. Velocity vector & flow orientation
                const curVx = dot.x - dot.prevX;
                const curVy = dot.y - dot.prevY;
                const speedMag = Math.sqrt(curVx * curVx + curVy * curVy);
                const flowAngle = Math.atan2(curVy, curVx);

                // 6. Dot stretch factor (elongates into fluid orbiting capsule when moving)
                const stretch = Math.min(2.6, 1 + speedMag * 0.30);

                // 7. Soft pulsing breathing glow (calm, less bright)
                dot.pulsePhase += dot.pulseSpeed;
                const pulseAlpha = dot.alpha + Math.sin(dot.pulsePhase) * 0.10;
                const finalAlpha = Math.max(0.18, Math.min(0.65, pulseAlpha));

                // 8. Draw oriented colored dot circling the mouse pointer
                ctx.save();
                ctx.translate(dot.x, dot.y);
                ctx.rotate(flowAngle);

                // Softer neon glow (subtle aura rather than harsh blinding glare)
                ctx.shadowColor = dot.color;
                ctx.shadowBlur = speedMag > 1.8 ? 6 : 3;
                ctx.fillStyle = dot.color;
                ctx.globalAlpha = finalAlpha;

                // Draw capsule / circular dot
                const rx = dot.size * stretch;
                const ry = dot.size;
                ctx.beginPath();
                ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();

                // Gentle core highlight only on largest particles
                if (dot.size > 2.5) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.globalAlpha = finalAlpha * 0.3;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, rx * 0.4, ry * 0.4, 0, 0, Math.PI * 2);
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
            className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070b12] text-slate-200 select-none overflow-hidden transition-all duration-700 ease-out ${
                isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
            }`}
        >
            {/* ── Canvas: Flying Dots Circling ONLY Around Mouse Pointer ── */}
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-20" />

            {/* ── Soft Ambient Background Atmosphere ── */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-[#3186FF]/10 via-[#7189FF]/8 to-transparent rounded-full blur-[130px] pointer-events-none z-0" />

            {/* ── Central SignalMap Hero Branding Container ── */}
            <div className="relative z-10 flex flex-col items-center max-w-lg px-6 text-center animate-fade-in pointer-events-auto">
                {/* Precision Aerospace Logo Emblem */}
                <div className="relative flex items-center justify-center mb-8">
                    {/* Outer Rotating Dashed Ring */}
                    <div className="absolute w-28 h-28 rounded-full border border-dashed border-[#7189FF]/40 animate-[spin_24s_linear_infinite]" />

                    {/* Counter-Rotating Inner Ring */}
                    <div className="absolute w-24 h-24 rounded-full border border-[#3186FF]/35 animate-[spin_16s_linear_infinite_reverse]" />

                    {/* Concentric Pulsing Radar Blip Wave */}
                    <span className="absolute w-20 h-20 rounded-full bg-[#7189FF]/20 animate-ping" />

                    {/* Central Glowing Shield / Beacon Container */}
                    <div className="relative w-16 h-16 rounded-2xl glass-card bg-slate-900/90 border border-[#7189FF]/50 shadow-[0_0_35px_rgba(113,137,255,0.4)] flex items-center justify-center backdrop-blur-xl group">
                        <svg
                            className="w-9 h-9 text-[#7189FF] drop-shadow-[0_0_14px_rgba(113,137,255,0.8)]"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <defs>
                                <linearGradient id="sm-antigravity-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#8AB4F8" />
                                    <stop offset="50%" stopColor="#7189FF" />
                                    <stop offset="100%" stopColor="#3186FF" />
                                </linearGradient>
                            </defs>
                            {/* Diamond Aerospace Radar Shield */}
                            <path
                                d="M12 2L20.5 7V17L12 22L3.5 17V7L12 2Z"
                                stroke="url(#sm-antigravity-gradient)"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            {/* Inner Orbital Signal Waves */}
                            <path
                                d="M12 6.5L16.5 9.5V14.5L12 17.5L7.5 14.5V9.5L12 6.5Z"
                                stroke="#00B95C"
                                strokeWidth="1.2"
                                strokeOpacity="0.85"
                            />
                            {/* Concentric Center Radar Beacon Node */}
                            <circle cx="12" cy="12" r="2.5" fill="#8AB4F8" className="animate-pulse" />
                            <circle cx="12" cy="12" r="4.5" stroke="#7189FF" strokeWidth="0.8" strokeDasharray="2 2" />
                        </svg>
                    </div>
                </div>

                {/* Brand Typography */}
                <div className="flex flex-col items-center gap-1.5 mb-7">
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

                {/* 5-Second Precision Progress Track with Shimmer */}
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
                            {statusSteps[statusIndex]}
                        </span>
                        <span className="font-bold text-slate-200">{progress}%</span>
                    </div>
                </div>

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
