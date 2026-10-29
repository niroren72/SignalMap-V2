import { useEffect, useRef, useState, useCallback } from 'react';

interface HolographicCardLogoProps {
    className?: string;
    onCardClick?: () => void;
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec2 u_tilt;
uniform float u_hover;
uniform float u_time;

// Approximate visible wavelengths in micrometers with smooth display RGB responses
vec3 wavelengthColor(float wavelength) {
    vec3 response = (vec3(wavelength) - vec3(0.610, 0.545, 0.460)) / vec3(0.045, 0.038, 0.032);
    float visible = smoothstep(0.380, 0.410, wavelength) * (1.0 - smoothstep(0.700, 0.780, wavelength));
    return exp(-0.5 * response * response) * visible;
}

// Reflection grating approximation: Jos Stam GPU Gems Ch 8
vec3 diffraction(vec2 across, vec2 lightAndView, float spacing) {
    float pathDifference = spacing * abs(dot(lightAndView, across));
    float along = dot(lightAndView, vec2(-across.y, across.x));
    float envelope = exp(-along * along / 0.36);
    vec3 reflected = vec3(0.0);
    for (int order = 1; order <= 3; order++) {
        float m = float(order);
        reflected += wavelengthColor(pathDifference / m) / (m * m);
    }
    return reflected * envelope;
}

// Broad pearlescence cosine palette
vec3 pearlColor(float phase) {
    return vec3(0.55, 0.52, 0.64) + vec3(0.43, 0.40, 0.34)
        * cos(6.2831853 * (phase + vec3(0.05, 0.38, 0.63)));
}

// Fast hash noise for metallic surface grain
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float grain(vec2 p) {
    vec2 ip = floor(p * 450.0);
    return hash(ip) - 0.5;
}

// Wavy foil engravings
float etchedPhase(vec2 p) {
    vec2 warp = vec2(
        sin(p.y * 7.0 + sin(p.x * 4.0)) * 0.085,
        sin(p.x * 6.0 - p.y * 3.0) * 0.07
    );
    vec2 q = p + warp - vec2(0.10, 0.06);
    float radius = length(q * vec2(1.0, 0.76));
    return radius * 128.0 + sin(atan(q.y, q.x) * 3.0 + radius * 8.0) * 1.7;
}

float roundedBox(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - b + vec2(r);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

float stroke(float distance, float width, float aa) {
    return 1.0 - smoothstep(width, width + aa, abs(distance));
}

// Diamond aerospace shield SDF
float sdDiamond(vec2 p, float w, float h) {
    vec2 q = abs(p);
    float d = (q.x * h + q.y * w - w * h) / sqrt(w * w + h * h);
    return d;
}

void main() {
    // Standard card aspect ratio
    vec2 res = max(u_resolution, vec2(1.0));
    float scale = min(res.y, res.x * 1.4);
    vec2 screen = (v_uv - 0.5) * res / scale * 2.5;

    // 3D card plane ray casting
    float sx = sin(u_tilt.y);
    float cx = cos(u_tilt.y);
    float sy = sin(u_tilt.x);
    float cy = cos(u_tilt.x);

    vec3 right = vec3(cy, 0.0, -sy);
    vec3 down = vec3(sy * sx, cx, cy * sx);
    vec3 normal = cross(right, down);

    vec3 eye = vec3(0.0, 0.0, 4.5);
    vec3 ray = normalize(vec3(screen, -4.5));
    float denom = dot(ray, normal);
    vec3 hit = (abs(denom) > 0.0001) ? eye - ray * (dot(eye, normal) / denom) : vec3(screen, 0.0);

    vec2 p = vec2(dot(hit, right), dot(hit, down));
    float aa = 0.007;

    // Card border shape
    float edge = roundedBox(p, vec2(0.64, 0.92), 0.065);
    float silhouette = 1.0 - smoothstep(-aa, aa, edge);

    // If outside card silhouette, transparent
    if (silhouette <= 0.001) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Interactive lighting parameters
    float hover = clamp(u_hover, 0.0, 1.0);
    // Subtle idle ambient light position breathing
    vec2 idleLight = vec2(sin(u_time * 0.8) * 0.25, cos(u_time * 0.6) * 0.3);
    vec2 lightCenter = mix(idleLight, u_pointer * vec2(0.64, 0.92), hover);

    vec2 delta = p - lightCenter;
    float sweepDistance = delta.x * 0.72 + delta.y * 0.52 + sin(p.y * 4.0 + p.x * 3.0) * 0.08;
    float bandDistance = sweepDistance / 0.36;
    float lightBand = exp(-bandDistance * bandDistance);

    float glintDistance = sweepDistance / 0.085;
    float glint = exp(-glintDistance * glintDistance);

    float spotlight = exp(-dot(delta * vec2(1.05, 0.72), delta * vec2(1.05, 0.72)) * 2.6);
    float effectiveHover = max(0.12, hover);
    float light = lightBand * spotlight * effectiveHover;

    vec3 lightDirection = normalize(vec3(lightCenter, 1.2) - hit);
    vec3 viewDirection = normalize(eye - hit);
    vec2 lightAndView = vec2(dot(lightDirection + viewDirection, right), dot(lightDirection + viewDirection, down));
    float illumination = max(dot(normal, lightDirection), 0.0) * max(dot(normal, viewDirection), 0.0);

    // Deep matte obsidian/graphite card background
    float noise = grain(p + vec2(1.7, 3.2));
    vec3 baseColor = vec3(0.055, 0.062, 0.078) + 0.015 * (0.9 - p.y);
    baseColor += noise * (0.025 + light * 0.08);

    // Ambient tint & flare
    vec3 tint = vec3(0.70, 0.78, 0.95);
    baseColor += light * (vec3(0.05) + tint * 0.12);

    // ── SignalMap Central Aerospace Emblem Holographic Geometry ──
    float diamondOuter = sdDiamond(p, 0.38, 0.52);
    float diamondInner = sdDiamond(p, 0.24, 0.34);

    float insideShield = 1.0 - smoothstep(-aa * 1.5, -aa * 0.5, diamondOuter);
    float outsideShield = smoothstep(aa * 0.5, aa * 1.5, diamondOuter);

    // Wavy foil engravings across card
    float contour = etchedPhase(p);
    vec2 across = normalize(vec2(cos(contour), sin(contour)));
    vec3 outerDiffraction = diffraction(across, lightAndView, 1.65) * illumination;
    float contourLines = stroke(sin(contour), 0.06, 0.05);

    // Central shield diffraction grooves
    vec2 shieldAcross = normalize(p + vec2(0.0001));
    vec3 innerDiffraction = diffraction(shieldAcross, lightAndView, 1.35) * illumination;

    // Pearlescent rainbow color wash
    float pearlPhase = dot(lightAndView, vec2(0.48, -0.32)) + p.y * 0.32 + contour * 0.003;
    vec3 outerPearl = pearlColor(pearlPhase);
    vec3 innerPearl = pearlColor(pearlPhase + dot(shieldAcross, lightAndView) * 0.35 + 0.15);
    vec3 pearl = outerPearl * outsideShield + innerPearl * insideShield;

    baseColor += pearl * light * 0.32;
    baseColor += (pearl * 0.5 + vec3(0.5) * (insideShield + outsideShield)) * glint * spotlight * effectiveHover * 0.18;

    // Micro-sparkle
    float sparkle = pow(max(noise + 0.5, 0.0), 22.0) * glint * spotlight * effectiveHover;
    baseColor += pearl * sparkle * 0.35;

    // Foil engravings reveal
    float reveal = effectiveHover * (0.08 + 0.28 * spotlight + light * 1.2);
    vec3 outerFoil = vec3(0.12, 0.15, 0.22) + outerPearl * 0.70 + outerDiffraction * 0.22;
    vec3 innerFoil = vec3(0.15, 0.20, 0.30) + innerPearl * 0.85 + innerDiffraction * 0.35;

    baseColor += contourLines * 0.45 * outsideShield * outerFoil * reveal;

    // Shield borders with brilliant foil reflections
    float shieldBorder1 = stroke(diamondOuter, 0.0025, aa * 0.7);
    float shieldBorder2 = stroke(diamondInner, 0.0018, aa * 0.7);

    vec3 foilSpecular = outerPearl * 0.85 + vec3(0.3) + outerDiffraction * 0.35;
    baseColor = mix(baseColor, foilSpecular, shieldBorder1 * (0.4 + light * 0.6));
    baseColor = mix(baseColor, innerFoil * 1.2, shieldBorder2 * (0.35 + light * 0.65));

    // Micro dots grid in background
    vec2 grid = (fract((p + 1.0) * 18.0) - 0.5) / 18.0;
    float dots = stroke(length(grid), 0.0009, aa * 0.5);
    baseColor += dots * outsideShield * reveal * 0.22 * outerPearl;

    // Outer card perimeter rim glow
    float rim = stroke(edge + 0.003, 0.0015, aa * 0.8);
    float rimLight = pow(max(0.0, 1.0 - length(delta) * 0.65), 3.0) * effectiveHover;
    vec3 rimColor = vec3(0.25, 0.30, 0.40) + (outerPearl * 0.75 + tint * 0.35) * rimLight * 0.8;
    baseColor = mix(baseColor, rimColor, rim);

    gl_FragColor = vec4(baseColor, silhouette);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

export function HolographicCardLogo({ className = '', onCardClick }: HolographicCardLogoProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);

    // Hover & 3D tilt tracking state
    const [isHovered, setIsHovered] = useState(false);
    const stateRef = useRef({
        targetHover: 0,
        currentHover: 0,
        targetTiltX: 0,
        targetTiltY: 0,
        currentTiltX: 0,
        currentTiltY: 0,
        pointerX: 0,
        pointerY: 0,
        lightX: 0.2,
        lightY: -0.25,
        startTime: performance.now(),
    });

    // Pointer events
    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Normalized [-1, 1] relative to card center
        const nx = ((e.clientX - centerX) / (rect.width / 2));
        const ny = ((e.clientY - centerY) / (rect.height / 2));

        const state = stateRef.current;
        state.pointerX = Math.max(-1.5, Math.min(1.5, nx));
        state.pointerY = Math.max(-1.5, Math.min(1.5, ny));
        state.targetTiltX = Math.max(-1, Math.min(1, nx)) * 0.28;
        state.targetTiltY = -Math.max(-1, Math.min(1, ny)) * 0.24;
        state.targetHover = 1.0;
        setIsHovered(true);
    }, []);

    const handlePointerLeave = useCallback(() => {
        const state = stateRef.current;
        state.targetHover = 0.0;
        state.targetTiltX = 0;
        state.targetTiltY = 0;
        setIsHovered(false);
    }, []);

    // WebGL Initialization & Render Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext('webgl', {
            alpha: true,
            antialias: true,
            depth: false,
            preserveDrawingBuffer: false,
        });
        if (!gl) {
            console.warn('WebGL not supported for holographic card.');
            return;
        }
        glRef.current = gl;

        // Setup shaders
        const vert = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
        const frag = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
        if (!vert || !frag) return;

        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return;
        }

        gl.useProgram(program);

        // Quad geometry
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const positions = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const aPositionLocation = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(aPositionLocation);
        gl.vertexAttribPointer(aPositionLocation, 2, gl.FLOAT, false, 0, 0);

        // Uniform locations
        const uResolutionLoc = gl.getUniformLocation(program, 'u_resolution');
        const uPointerLoc = gl.getUniformLocation(program, 'u_pointer');
        const uTiltLoc = gl.getUniformLocation(program, 'u_tilt');
        const uHoverLoc = gl.getUniformLocation(program, 'u_hover');
        const uTimeLoc = gl.getUniformLocation(program, 'u_time');

        // Resize handler
        let width = 0;
        let height = 0;
        const resize = () => {
            if (!containerRef.current || !canvas) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const rect = containerRef.current.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            gl.viewport(0, 0, canvas.width, canvas.height);
        };

        resize();
        window.addEventListener('resize', resize);

        // Render loop
        let animationFrameId: number;
        let lastTime = performance.now();

        const render = (now: number) => {
            const dt = Math.min(0.1, (now - lastTime) / 1000);
            lastTime = now;

            const state = stateRef.current;
            const blend = 1.0 - Math.exp(-12.0 * dt);

            state.currentTiltX += (state.targetTiltX - state.currentTiltX) * blend;
            state.currentTiltY += (state.targetTiltY - state.currentTiltY) * blend;
            state.currentHover += (state.targetHover - state.currentHover) * blend;

            if (state.targetHover > 0) {
                state.lightX += (state.pointerX - state.lightX) * blend;
                state.lightY += (state.pointerY - state.lightY) * blend;
            }

            // Apply 3D tilt CSS to container
            if (containerRef.current) {
                const rotX = state.currentTiltY * 26; // deg
                const rotY = state.currentTiltX * 26; // deg
                const scale = 1.0 + state.currentHover * 0.05;
                containerRef.current.style.transform = `perspective(850px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale3d(${scale.toFixed(3)}, ${scale.toFixed(3)}, 1)`;
            }

            // Draw WebGL holographic card
            gl.useProgram(program);
            gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
            gl.uniform2f(uPointerLoc, state.lightX, state.lightY);
            gl.uniform2f(uTiltLoc, state.currentTiltX, state.currentTiltY);
            gl.uniform1f(uHoverLoc, state.currentHover);
            gl.uniform1f(uTimeLoc, (now - state.startTime) / 1000);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            animationFrameId = requestAnimationFrame(render);
        };

        animationFrameId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resize);
            if (vert) gl.deleteShader(vert);
            if (frag) gl.deleteShader(frag);
            if (program) gl.deleteProgram(program);
            if (positionBuffer) gl.deleteBuffer(positionBuffer);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onClick={onCardClick}
            className={`relative cursor-pointer select-none rounded-[18px] transition-shadow duration-300 will-change-transform ${className}`}
            style={{
                width: '144px',
                height: '202px',
                transformStyle: 'preserve-3d',
                boxShadow: isHovered
                    ? '0 20px 40px rgba(0,0,0,0.7), 0 0 35px rgba(113,137,255,0.45), inset 0 0 15px rgba(255,255,255,0.1)'
                    : '0 10px 25px rgba(0,0,0,0.5), 0 0 18px rgba(113,137,255,0.2)',
            }}
            title="SignalMap Holographic Telemetry Keycard"
        >
            {/* Holographic WebGL Canvas with Jos Stam Diffraction Grating & Pearlescence */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full rounded-[18px] pointer-events-none block"
            />

            {/* Crisp High-Res Vector Overlay: Aerospace Shield & Precision Typography */}
            <div className="absolute inset-0 rounded-[18px] pointer-events-none flex flex-col items-center justify-center p-3 z-10">
                {/* Center SVG Diamond Aerospace Shield */}
                <div className="flex flex-col items-center justify-center">
                    <div className="relative flex items-center justify-center">
                        <svg
                            className="w-12 h-12 text-[#7189FF] drop-shadow-[0_0_16px_rgba(113,137,255,0.9)] transition-transform duration-300 group-hover:scale-105"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <defs>
                                <linearGradient id="sm-holo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#8AB4F8" />
                                    <stop offset="50%" stopColor="#7189FF" />
                                    <stop offset="100%" stopColor="#3186FF" />
                                </linearGradient>
                            </defs>
                            {/* Diamond Aerospace Radar Shield */}
                            <path
                                d="M12 2L20.5 7V17L12 22L3.5 17V7L12 2Z"
                                stroke="url(#sm-holo-gradient)"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            {/* Inner Orbital Signal Waves */}
                            <path
                                d="M12 6.5L16.5 9.5V14.5L12 17.5L7.5 14.5V9.5L12 6.5Z"
                                stroke="#00B95C"
                                strokeWidth="1.1"
                                strokeOpacity="0.85"
                            />
                        </svg>
                    </div>

                    <span className="mt-1.5 text-[8.5px] font-mono tracking-[0.2em] uppercase font-bold text-slate-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                        SIGNALMAP
                    </span>
                </div>
            </div>

            {/* Surface Specular Sheen Reflection Overlay */}
            <div
                className="absolute inset-0 rounded-[18px] pointer-events-none opacity-40 transition-opacity duration-300 mix-blend-overlay"
                style={{
                    background:
                        'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0) 60%)',
                }}
            />
        </div>
    );
}
