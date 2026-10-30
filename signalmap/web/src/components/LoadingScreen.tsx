import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { HolographicCardLogo } from './HolographicCardLogo';

interface LoadingScreenProps {
    loaded?: boolean;
    manualDismiss?: boolean;
    onComplete: () => void;
}

// ── Exact GLSL Simplex Noise Library from antigravity.google ──
const ANTIGRAVITY_GLSL_NOISE = /* glsl */ `
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float permute(float x) { return floor(mod(((x*34.0)+1.0)*x, 289.0)); }

  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

// ── Exact 2D Poisson-Disk Sampling from antigravity.google ──
// Generates organic blue-noise point distribution in [0, 500] x [0, 500]
function generatePoissonDiskPoints(
    width: number,
    height: number,
    minDistance: number,
    maxDistance: number,
    maxTries = 20
): Array<[number, number]> {
    const cellSize = minDistance / Math.SQRT2;
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const grid = new Int32Array(cols * rows).fill(-1);

    const samplePoints: Array<[number, number]> = [];
    const processList: Array<[number, number]> = [];

    const addPoint = (pt: [number, number]) => {
        const idx = samplePoints.length;
        samplePoints.push(pt);
        processList.push(pt);
        const gx = Math.floor(pt[0] / cellSize);
        const gy = Math.floor(pt[1] / cellSize);
        if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
            grid[gy * cols + gx] = idx;
        }
    };

    const inNeighbourhood = (pt: [number, number]): boolean => {
        const gx = Math.floor(pt[0] / cellSize);
        const gy = Math.floor(pt[1] / cellSize);
        const minDistSq = minDistance * minDistance;

        for (let dy = -2; dy <= 2; dy++) {
            const ny = gy + dy;
            if (ny < 0 || ny >= rows) continue;
            for (let dx = -2; dx <= 2; dx++) {
                const nx = gx + dx;
                if (nx < 0 || nx >= cols) continue;
                const neighborIdx = grid[ny * cols + nx];
                if (neighborIdx !== -1) {
                    const nPt = samplePoints[neighborIdx];
                    const ddx = pt[0] - nPt[0];
                    const ddy = pt[1] - nPt[1];
                    if (ddx * ddx + ddy * ddy < minDistSq) {
                        return true;
                    }
                }
            }
        }
        return false;
    };

    // Seed initial point
    addPoint([Math.random() * width, Math.random() * height]);

    const deltaDist = Math.max(0, maxDistance - minDistance);
    while (processList.length > 0) {
        const current = processList[0];
        let found = false;

        for (let t = 0; t < maxTries; t++) {
            const radius = minDistance + deltaDist * Math.random();
            const angle = Math.random() * Math.PI * 2;
            const cx = current[0] + Math.cos(angle) * radius;
            const cy = current[1] + Math.sin(angle) * radius;

            if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                const candidate: [number, number] = [cx, cy];
                if (!inNeighbourhood(candidate)) {
                    addPoint(candidate);
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            processList.shift();
        }
    }

    return samplePoints;
}

// ── 1D Value Noise for Idle Drift (Exact match to `kl` in antigravity.google) ──
class Simple1DNoise {
    private readonly MAX_VERTICES = 256;
    private readonly MAX_VERTICES_MASK = 255;
    private readonly r: number[] = [];

    constructor() {
        for (let i = 0; i < this.MAX_VERTICES; i++) {
            this.r.push(Math.random());
        }
    }

    getVal(x: number): number {
        const floorX = Math.floor(x);
        const t = x - floorX;
        const smoothT = t * t * (3 - 2 * t);
        const xMin = floorX & this.MAX_VERTICES_MASK;
        const xMax = (xMin + 1) & this.MAX_VERTICES_MASK;
        return this.r[xMin] * (1 - smoothT) + this.r[xMax] * smoothT;
    }
}

// Linear map helper `P(e, t, n, r, i)` from antigravity.google
function mapRange(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return ((val - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

// Smooth cubic ease for progress bar
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

export function LoadingScreen({ loaded = false, onComplete, manualDismiss = false }: LoadingScreenProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    const [progress, setProgress] = useState(0);
    const [statusIndex, setStatusIndex] = useState(0);
    const [isExiting, setIsExiting] = useState(false);

    const statusSteps = [
        'INITIALIZING SIGNALMAP AEROSPACE ENGINE...',
        'CONNECTING ANTIGRAVITY TELEMETRY FIELD...',
        'CALIBRATING 3D ORBITAL TOPOLOGY...',
        'SYNCHRONIZING REALTIME WEBSOCKET FEED...',
    ];

    const handleDismiss = useCallback(() => {
        if (isExiting) return;
        setIsExiting(true);
        setTimeout(() => {
            onCompleteRef.current();
        }, 280);
    }, [isExiting]);

    // ── Progress Counter & Fast Auto-Dismiss Timer ──
    useEffect(() => {
        const TOTAL_DURATION_MS = manualDismiss ? 1800 : 1100;
        const startTime = performance.now();

        const timer = setInterval(() => {
            const now = performance.now();
            const elapsed = now - startTime;
            const rawProgress = Math.min(1, elapsed / TOTAL_DURATION_MS);

            setProgress(Math.floor(easeOutCubic(rawProgress) * 100));

            const step = Math.min(
                statusSteps.length - 1,
                Math.floor(rawProgress * statusSteps.length)
            );
            setStatusIndex(step);

            if (elapsed >= TOTAL_DURATION_MS) {
                clearInterval(timer);
                setProgress(100);
                setStatusIndex(statusSteps.length - 1);

                if (!manualDismiss) {
                    setIsExiting(true);
                    setTimeout(() => {
                        onCompleteRef.current();
                    }, 280);
                }
            }
        }, 25);

        return () => clearInterval(timer);
    }, [manualDismiss, statusSteps.length]);

    // Allow clicking anywhere at any time to dismiss immediately
    useEffect(() => {
        if (!manualDismiss && loaded && progress >= 65 && !isExiting) {
            setProgress(100);
            setIsExiting(true);
            const t = setTimeout(() => {
                onCompleteRef.current();
            }, 250);
            return () => clearTimeout(t);
        }
    }, [loaded, manualDismiss, progress, isExiting]);

    // ── Exact WebGL GPGPU Particle Shader from https://antigravity.google/ ──
    useEffect(() => {
        const container = mountRef.current;
        if (!container) return;

        // Exact dark-mode data attributes from antigravity.google:
        // data-theme="dark" data-ring-width="0.15" data-ring-width2="0.05"
        // data-ring-displacement="0.23" data-density="220" data-particles-scale="0.65"
        const DENSITY = 220;
        const PARTICLES_SCALE = 0.65;
        const RING_WIDTH = 0.15;
        const RING_WIDTH2 = 0.05;
        const RING_DISPLACEMENT = 0.23;
        const COLOR_SCHEME = 0; // 0 = dark theme (#7189ff, #3074f9, #000000)

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        let width = container.offsetWidth || window.innerWidth;
        let height = container.offsetHeight || window.innerHeight;

        // 1. Setup Three.js Renderer, Perspective Camera (FOV 40, z = 3.1) & Scene
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
        camera.position.z = 3.1;

        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({
                antialias: false,
                alpha: true,
                powerPreference: 'default',
                preserveDrawingBuffer: false,
                stencil: false,
                depth: false,
                precision: 'highp',
            });
        } catch {
            // Gracefully skip WebGL background if GPU context pool is exhausted
            return;
        }
        renderer.setSize(width, height);
        renderer.setPixelRatio(pixelRatio);
        renderer.autoClear = false;
        container.appendChild(renderer.domElement);

        // Ensure float render target extension is active
        const gl = renderer.getContext();
        if (!gl) {
            renderer.dispose();
            return;
        }
        gl.getExtension('EXT_color_buffer_float');

        // 2. Invisible Raycast Plane (12.5 x 12.5 at z=0) for exact 3D cursor projection
        const raycaster = new THREE.Raycaster();
        const mouseNDC = new THREE.Vector2();
        const intersectionPoint = new THREE.Vector3();
        let isIntersecting = false;
        let hasMoved = false;
        const cursorScreen = { x: width * 0.5, y: height * 0.5 };

        const raycastPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(12.5, 12.5),
            new THREE.MeshBasicMaterial({ color: 0xff0000, visible: false, side: THREE.DoubleSide })
        );
        scene.add(raycastPlane);

        // 3. Generate Poisson-Disk Sampled Points in [500, 500] domain
        const minDist = mapRange(DENSITY, 0, 300, 10, 2);
        const maxDist = mapRange(DENSITY, 0, 300, 11, 3);
        const rawPoints = generatePoissonDiskPoints(500, 500, minDist, maxDist, 20);

        const texSize = 256;
        const texLength = texSize * texSize;
        const count = Math.min(rawPoints.length, texLength);

        const posData = new Float32Array(texLength * 4);
        for (let i = 0; i < count; i++) {
            const idx = i * 4;
            // Normalize [-250..250] to [-1..1]
            posData[idx + 0] = (rawPoints[i][0] - 250) * (1 / 250);
            posData[idx + 1] = (rawPoints[i][1] - 250) * (1 / 250);
            posData[idx + 2] = 0; // initial scale
            posData[idx + 3] = 0; // initial velocity
        }

        const posTex = new THREE.DataTexture(
            posData,
            texSize,
            texSize,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        posTex.needsUpdate = true;

        const createRenderTarget = () =>
            new THREE.WebGLRenderTarget(texSize, texSize, {
                wrapS: THREE.ClampToEdgeWrapping,
                wrapT: THREE.ClampToEdgeWrapping,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: THREE.FloatType,
                depthBuffer: false,
                stencilBuffer: false,
            });

        let rt1 = createRenderTarget();
        let rt2 = createRenderTarget();

        renderer.setRenderTarget(rt1);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.setRenderTarget(rt2);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.setRenderTarget(null);

        // 4. Ping-Pong GPGPU Simulation Scene & ShaderMaterial
        // Calculates mouse vector displacement:
        //   dist = distance(curentPos.xy, uRingPos)
        //   pos -= (uRingPos - (curentPos + disp)) * pow(t2, 0.75) * uRingDisplacement
        const simScene = new THREE.Scene();
        const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const ringPos = new THREE.Vector2(0, 0);
        const cursorPos = new THREE.Vector2(0, 0);
        const noise1D = new Simple1DNoise();

        const simMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: posTex },
                uPosRefs: { value: posTex },
                uRingPos: { value: new THREE.Vector2(0, 0) },
                uRingRadius: { value: 0.2 },
                uDeltaTime: { value: 0 },
                uRingWidth: { value: RING_WIDTH },
                uRingWidth2: { value: RING_WIDTH2 },
                uRingDisplacement: { value: RING_DISPLACEMENT },
                uTime: { value: 0 },
            },
            vertexShader: /* glsl */ `
                void main() {
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                precision highp float;
                uniform sampler2D uPosition;
                uniform sampler2D uPosRefs;
                uniform vec2 uRingPos;
                uniform float uTime;
                uniform float uDeltaTime;
                uniform float uRingRadius;
                uniform float uRingWidth;
                uniform float uRingWidth2;
                uniform float uRingDisplacement;

                ${ANTIGRAVITY_GLSL_NOISE}

                void main() {
                    vec2 simTexCoords = gl_FragCoord.xy / vec2(${texSize.toFixed(1)}, ${texSize.toFixed(1)});
                    vec4 pFrame = texture2D(uPosition, simTexCoords);

                    float scale = pFrame.z;
                    float velocity = pFrame.w;
                    vec2 refPos = texture2D(uPosRefs, simTexCoords).xy;

                    float time = uTime * 0.5;
                    vec2 curentPos = refPos;

                    vec2 pos = pFrame.xy;
                    pos *= 0.8; // Spring damping returning displaced particles to reference position

                    // Mouse / ring vector distance calculation
                    float dist = distance(curentPos.xy, uRingPos);
                    float noise0 = snoise(vec3(curentPos.xy * 0.2 + vec2(18.4924, 72.9744), time * 0.5));
                    float dist1 = distance(curentPos.xy + (noise0 * 0.005), uRingPos);

                    float t = smoothstep(uRingRadius - (uRingWidth * 2.0), uRingRadius, dist) - smoothstep(uRingRadius, uRingRadius + uRingWidth, dist1);
                    float t2 = smoothstep(uRingRadius - (uRingWidth2 * 2.0), uRingRadius, dist) - smoothstep(uRingRadius, uRingRadius + uRingWidth2, dist1);
                    float t3 = smoothstep(uRingRadius + uRingWidth2, uRingRadius, dist);

                    t = pow(max(t, 0.0), 2.0);
                    t2 = pow(max(t2, 0.0), 3.0);

                    t += t2 * 3.0;
                    t += t3 * 0.4;
                    t += snoise(vec3(curentPos.xy * 30.0 + vec2(11.4924, 12.9744), time * 0.5)) * t3 * 0.5;

                    float nS = snoise(vec3(curentPos.xy * 2.0 + vec2(18.4924, 72.9744), time * 0.5));
                    t += pow((nS + 1.5) * 0.5, 2.0) * 0.6;

                    // Mid scale noise
                    float noise1 = snoise(vec3(curentPos.xy * 4.0 + vec2(88.494, 32.4397), time * 0.35));
                    float noise2 = snoise(vec3(curentPos.xy * 4.0 + vec2(50.904, 120.947), time * 0.35));

                    // Close scale noise
                    float noise3 = snoise(vec3(curentPos.xy * 20.0 + vec2(18.4924, 72.9744), time * 0.5));
                    float noise4 = snoise(vec3(curentPos.xy * 20.0 + vec2(50.904, 120.947), time * 0.5));

                    vec2 disp = vec2(noise1, noise2) * 0.03;
                    disp += vec2(noise3, noise4) * 0.005;

                    // Harmonic sine wave drift
                    disp.x += sin((refPos.x * 20.0) + (time * 4.0)) * 0.02 * clamp(dist, 0.0, 1.0);
                    disp.y += cos((refPos.y * 20.0) + (time * 3.0)) * 0.02 * clamp(dist, 0.0, 1.0);

                    // Radial mouse vector repulsion push away from uRingPos
                    pos -= (uRingPos - (curentPos + disp)) * pow(t2, 0.75) * uRingDisplacement;

                    // Smooth scale interpolation
                    float scaleDiff = t - scale;
                    scaleDiff *= 0.2;
                    scale += scaleDiff;

                    // Final displaced position
                    vec2 finalPos = curentPos + disp + (pos * 0.25);

                    velocity *= 0.5;
                    velocity += scale * 0.25;

                    gl_FragColor = vec4(finalPos, scale, velocity);
                }
            `,
        });

        const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
        simScene.add(simQuad);

        // 5. Particle Render Geometry & Capsule SDF Fragment Shader
        // Renders each dot as an oriented rounded capsule (`sdRoundBox(uv, vec2(0.5, 0.2), vec4(0.25))`)
        // aligned radially with `atan(vLocalPos.y - uRingPos.y, vLocalPos.x - uRingPos.x)`
        const particleGeometry = new THREE.BufferGeometry();
        const uvs = new Float32Array(count * 2);
        const positions = new Float32Array(count * 3);
        const seeds = new Float32Array(count * 4);

        for (let i = 0; i < count; i++) {
            const u = (i % texSize) / texSize;
            const v = Math.floor(i / texSize) / texSize;
            uvs[i * 2 + 0] = u;
            uvs[i * 2 + 1] = v;

            seeds[i * 4 + 0] = Math.random();
            seeds[i * 4 + 1] = Math.random();
            seeds[i * 4 + 2] = Math.random();
            seeds[i * 4 + 3] = Math.random();
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        particleGeometry.setAttribute('seeds', new THREE.BufferAttribute(seeds, 4));

        const getParticleScale = () =>
            (renderer.domElement.width / pixelRatio / 2000) * PARTICLES_SCALE;

        const renderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: posTex },
                uTime: { value: 0 },
                // Exact dark-theme colors from antigravity.google
                uColor1: { value: new THREE.Color('#7189ff') },
                uColor2: { value: new THREE.Color('#3074f9') },
                uColor3: { value: new THREE.Color('#000000') },
                uAlpha: { value: 1.0 },
                uRingPos: { value: new THREE.Vector2(0, 0) },
                uRez: {
                    value: new THREE.Vector2(
                        renderer.domElement.width,
                        renderer.domElement.height
                    ),
                },
                uParticleScale: { value: getParticleScale() },
                uPixelRatio: { value: pixelRatio },
                uColorScheme: { value: COLOR_SCHEME },
            },
            vertexShader: /* glsl */ `
                precision highp float;
                attribute vec4 seeds;

                uniform sampler2D uPosition;
                uniform float uTime;
                uniform float uParticleScale;
                uniform float uPixelRatio;
                uniform int uColorScheme;

                varying vec4 vSeeds;
                varying float vVelocity;
                varying vec2 vLocalPos;
                varying vec2 vScreenPos;
                varying float vScale;

                void main() {
                    vec4 pos = texture2D(uPosition, uv);
                    vSeeds = seeds;

                    vVelocity = pos.w;
                    vScale = pos.z;
                    vLocalPos = pos.xy;
                    vec4 viewSpace = modelViewMatrix * vec4(vec3(pos.xy, 0.0), 1.0);

                    gl_Position = projectionMatrix * viewSpace;
                    vScreenPos = gl_Position.xy;

                    gl_PointSize = ((vScale * 7.0) * (uPixelRatio * 0.5) * uParticleScale);
                }
            `,
            fragmentShader: /* glsl */ `
                precision highp float;

                varying vec4 vSeeds;
                varying vec2 vScreenPos;
                varying vec2 vLocalPos;
                varying float vScale;
                varying float vVelocity;

                uniform vec3 uColor1;
                uniform vec3 uColor2;
                uniform vec3 uColor3;

                uniform vec2 uRingPos;
                uniform vec2 uRez;

                uniform float uAlpha;
                uniform float uTime;

                uniform int uColorScheme;

                ${ANTIGRAVITY_GLSL_NOISE}

                #define PI 3.1415926535897932384626433832795

                float sdRoundBox(in vec2 p, in vec2 b, in vec4 r) {
                    r.xy = (p.x > 0.0) ? r.xy : r.zw;
                    r.x  = (p.y > 0.0) ? r.x  : r.y;
                    vec2 q = abs(p) - b + r.x;
                    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
                }

                vec2 rotate(vec2 v, float a) {
                    float s = sin(a);
                    float c = cos(a);
                    mat2 m = mat2(c, s, -s, c);
                    return m * v;
                }

                void main() {
                    float uBorderSize = 0.2;
                    float ratio = uRez.x / uRez.y;

                    // Noise-driven angle & tri-color blending
                    float noiseAngle = snoise(vec3(vLocalPos * 10.0 + vec2(18.4924, 72.9744), uTime * 0.85));
                    float noiseColor = snoise(vec3(vLocalPos * 2.0 + vec2(74.664, 91.556), uTime * 0.5));
                    noiseColor = (noiseColor + 1.0) * 0.5;

                    // Radial orientation angle toward cursor ring center (uRingPos)
                    float angle = atan(vLocalPos.y - uRingPos.y, vLocalPos.x - uRingPos.x);

                    vec2 uv = gl_PointCoord.xy;
                    uv -= vec2(0.5);
                    uv.y *= -1.0;
                    uv = rotate(uv, -angle + (noiseAngle * 0.5));

                    float h = 0.8;
                    float progress = smoothstep(0.0, 0.75, pow(noiseColor, 2.0));
                    vec3 col = mix(
                        mix(uColor1, uColor2, progress / h),
                        mix(uColor2, uColor3, (progress - h) / (1.0 - h)),
                        step(h, progress)
                    );
                    vec3 color = col;

                    // Rounded capsule SDF shape
                    float rounded = sdRoundBox(uv, vec2(0.5, 0.2), vec4(0.25));
                    rounded = smoothstep(0.1, 0.0, rounded);

                    float a = uAlpha * rounded * smoothstep(0.1, 0.2, vScale);

                    if (a < 0.01) {
                        discard;
                    }

                    color = clamp(color, 0.0, 1.0);
                    color = mix(color, color * clamp(vVelocity, 0.0, 1.0), float(uColorScheme));

                    gl_FragColor = vec4(color, clamp(a, 0.0, 1.0));
                }
            `,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        const pointsMesh = new THREE.Points(particleGeometry, renderMaterial);
        pointsMesh.position.set(0, 0, 0);
        pointsMesh.scale.set(5, 5, 5);
        scene.add(pointsMesh);

        // 6. Mouse & Resize Event Listeners
        const handleMouseMove = (e: MouseEvent) => {
            cursorScreen.x = e.clientX;
            cursorScreen.y = e.clientY;
            hasMoved = true;
        };

        const handleResize = () => {
            if (!container) return;
            width = container.offsetWidth || window.innerWidth;
            height = container.offsetHeight || window.innerHeight;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderMaterial.uniforms.uRez.value.set(
                renderer.domElement.width,
                renderer.domElement.height
            );
            renderMaterial.uniforms.uPixelRatio.value = pixelRatio;
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        window.addEventListener('resize', handleResize, { passive: true });

        // 7. Animation Loop (Exact antigravity.google update + ping-pong render cycle)
        const timer = new THREE.Timer();
        let lastTime = 0;
        let everRendered = false;
        let animationFrameId: number;

        const animate = (timestamp?: number) => {
            animationFrameId = requestAnimationFrame(animate);

            timer.update(timestamp);
            const elapsed = timer.getElapsed();
            const dt = Math.min(0.1, Math.max(0, elapsed - lastTime));
            lastTime = elapsed;

            // Project 2D mouse coordinates onto the 3D raycast plane
            if (hasMoved && width > 0 && height > 0) {
                mouseNDC.x = (cursorScreen.x / width) * 2 - 1;
                mouseNDC.y = -(cursorScreen.y / height) * 2 + 1;

                if (
                    mouseNDC.x >= -1 &&
                    mouseNDC.x <= 1 &&
                    mouseNDC.y >= -1 &&
                    mouseNDC.y <= 1
                ) {
                    raycaster.setFromCamera(mouseNDC, camera);
                    const hits = raycaster.intersectObject(raycastPlane);
                    if (hits.length > 0) {
                        intersectionPoint.copy(hits[0].point);
                        isIntersecting = true;
                    } else {
                        isIntersecting = false;
                    }
                } else {
                    isIntersecting = false;
                }
            }

            // Organic 1D value-noise drift + spring cursor following (0.02 active / 0.01 idle)
            const n = (noise1D.getVal(elapsed * 0.66 + 94.234) - 0.5) * 2;
            const r = (noise1D.getVal(elapsed * 0.75 + 21.028) - 0.5) * 2;

            if (isIntersecting) {
                cursorPos.set(
                    intersectionPoint.x * 0.175 + n * 0.1,
                    intersectionPoint.y * 0.175 + r * 0.1
                );
                ringPos.set(
                    ringPos.x + (cursorPos.x - ringPos.x) * 0.02,
                    ringPos.y + (cursorPos.y - ringPos.y) * 0.02
                );
            } else {
                cursorPos.set(n * 0.2, r * 0.1);
                ringPos.set(
                    ringPos.x + (cursorPos.x - ringPos.x) * 0.01,
                    ringPos.y + (cursorPos.y - ringPos.y) * 0.01
                );
            }

            const particleScale = getParticleScale();

            // Step 1: GPGPU Simulation Pass into rt2
            simMaterial.uniforms.uPosition.value = everRendered ? rt1.texture : posTex;
            simMaterial.uniforms.uTime.value = elapsed;
            simMaterial.uniforms.uDeltaTime.value = dt;
            simMaterial.uniforms.uRingRadius.value =
                0.175 + Math.sin(elapsed * 1.0) * 0.03 + Math.cos(elapsed * 3.0) * 0.02;
            simMaterial.uniforms.uRingPos.value.copy(ringPos);

            renderer.setRenderTarget(rt2);
            renderer.render(simScene, simCamera);
            renderer.setRenderTarget(null);

            // Step 2: Render Particle Capsules to Screen
            renderMaterial.uniforms.uPosition.value = everRendered ? rt2.texture : posTex;
            renderMaterial.uniforms.uTime.value = elapsed;
            renderMaterial.uniforms.uRingPos.value.copy(ringPos);
            renderMaterial.uniforms.uParticleScale.value = particleScale;

            renderer.clear();
            renderer.render(scene, camera);

            // Step 3: Swap Ping-Pong Render Targets
            const temp = rt1;
            rt1 = rt2;
            rt2 = temp;
            everRendered = true;
        };

        animationFrameId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', handleResize);
            particleGeometry.dispose();
            renderMaterial.dispose();
            simQuad.geometry.dispose();
            simMaterial.dispose();
            raycastPlane.geometry.dispose();
            (raycastPlane.material as THREE.Material).dispose();
            rt1.dispose();
            rt2.dispose();
            posTex.dispose();
            try {
                renderer.forceContextLoss();
            } catch {
                // ignore if already lost
            }
            renderer.dispose();
            if (renderer.domElement.parentElement === container) {
                container.removeChild(renderer.domElement);
            }
        };
    }, []);

    return (
        <div
            onClick={handleDismiss}
            className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070b12] text-slate-200 select-none overflow-hidden transition-all duration-300 ease-out cursor-pointer ${
                isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
            }`}
        >
            {/* ── Exact antigravity.google WebGL GPGPU Particle Field ── */}
            <div ref={mountRef} className="absolute inset-0 pointer-events-none z-20" />

            {/* ── Central SignalMap Hero Branding Container ── */}
            <div className="relative z-30 flex flex-col items-center max-w-lg px-6 text-center animate-fade-in pointer-events-auto">
                {/* Precision Aerospace Logo Holographic Card */}
                <div className="relative flex items-center justify-center mb-7">
                    {/* Central Holographic Keycard Emblem */}
                    <HolographicCardLogo onCardClick={manualDismiss ? handleDismiss : undefined} />
                </div>

                {/* Brand Typography */}
                <div className="flex flex-col items-center gap-1.5 mb-6">
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl md:text-4xl font-extrabold tracking-[0.22em] font-mono uppercase text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.25)]">
                            SIGNAL
                            <span className="bg-gradient-to-r from-[#7189FF] via-[#8AB4F8] to-[#00B95C] bg-clip-text text-transparent">
                                MAP
                            </span>
                        </h1>
                    </div>
                    <p className="text-[11px] md:text-xs font-mono uppercase tracking-[0.25em] text-slate-400 font-medium">
                        Aerospace Telemetry &amp; Threat Observability
                    </p>
                </div>

                {/* Precision Progress Track */}
                <div className="w-64 md:w-80 flex flex-col gap-2.5 mb-5">
                    <div className="relative w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden border border-slate-700/60 p-[1px]">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-[#3186FF] via-[#7189FF] to-[#00B95C] transition-all duration-75 ease-linear shadow-[0_0_18px_rgba(113,137,255,0.9)] relative"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute inset-0 bg-white/40 animate-pulse" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                        <span className="text-[#8AB4F8] font-semibold truncate max-w-[210px] text-left">
                            {progress < 100 ? statusSteps[statusIndex] : ''}
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
