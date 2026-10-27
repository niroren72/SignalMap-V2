import * as THREE from 'three';

/**
 * Authentic Wonderful.ai Globe Implementation (extracted directly from wonderful.ai/careers)
 * Features:
 * 1. 52,000-point Fibonacci sphere filtered by exact 360x180 1-bit land mask (16,739 land points)
 * 2. Continuous particle 'dance' physics: dots fly/wander around themselves at dual incommensurate frequencies
 * 3. 100% pitch-black oceans (zero particles in water, no specular glare)
 * 4. Matte starlight dots (rgba(255, 255, 255, 0.33)) with antialiased edge falloff - NOT bright, NOT shining
 * 5. Hairline 1px grounding sphere perimeter circle (opacity 0.19)
 * 6. 2,200 outer space dust particles breathing and floating outside the globe
 */

const WONDERFUL_LAND_BITMAP_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8H4AAAD//x8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4//9/fu///38AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOD/////////////AAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAPj///////////8/AAAA4P8AAP4AAAAAgP8AAAAAAAAAAAAAAAAAAAAAAAAAHPj//x////////8DAADA/38AAAAAAAAAAP8PAAAAAAAAAAAAAAAAAAAAAAB4/N////3///////8BAACA/w8AAAAAAAAAAPA/AAAAAAAAAAAAAAAAAAAAAPh8AHz4f/j///////8DAAAAfh4AAAAAAAAAAAB+AAAAAAAAAAAAAAAAAAAAAP7v4P//f/D///////8BAAAAOAAAAAAA/wEAAOj/PwAAwAAAAAAAAAAAAAAAAMD/5///HwCA//////8BAAAAAAAAAAD4PwAA+P//fwAA4N8HAAAAAAAAAAAAgH98APj/HwAA/P////8BAAAAAAAAAAD8AQAA/P//HwAAwJ8HAAAAAAAAAAAAgP+Dz////wAA+P////8AAAAAAAAAAAA+AADw/////48fgA8AAAAAAAAAAAAAwP//5//+/wEA8P///z8AAAAAAAAAAIAfAN////////8/gP8DAAAABwDAAQAAwP//j//+/x8A8P///38AAAAAAIABAIAfwP////////+///8fAADAAQD+/xcAvuD/f/r9//8B4P///38AAAAAAP8HAAA+wP//////////////DwDAAAD/////////f//P//8B4P///x8AAAAA4P//AAAAv////////////////9//B+D/////////P+7vh/8DwP///wMAAAAA+P//j8f/////////////////////P8D/////////////x/0fwP//DwAAAAAA/v//v////////////////////////+P/////////////A/5/wP//B3A/AAAA//////////////////////////////v/////////////4f89wP9/APh/AACA//9/+v//////////////////////8OD/////////////5/8HgP8PAPA/AADg//v/////////////////////////AI/////////////zD/gPAP8PAOAPAAD4////////////////////////////AMD///////////8B/+8PAP4DAAAAAAD+f/7/////////////////////////AOD//////////38A+B8AAPwDAAAAAAD+P/7///////////////////////8HAPD//////////z8AwH8IAPgDAAAAAAD+f/7/////////////////////+P8AAGD//8D//////z8A4H8cAAAAAAAAAAD+f/z///////////////////9/+AcAAAD8BwD+//////8A4P8/AAAAAAAAwAG+P/j//////////////////wMYfAAAAADgDwDA//////8DwP9/AAAAAAAA4AfwH/7//////////////////wEA/wAAAAD4BgDA//////8fgP9/AAAAAAAA4ANwH/7/////////////////fwCA/wAAAAA/AACA////////4///AQAAAAAA8AfwB///////////////////HwCAfwAAAIADAABA/v//////8///BwAAAAAA/A/w+////////////////////wSAfwAAAAAAAADA/f//////8///HwAAAAAAvB///////////////////////w+AHwAAAAAAAACA/f//////5///HwAAAAAAvD///////////////////////w8ABwAAAAAAAAAA8P//////////HwAAAAAA3P///////////////////////w8ABwAAAAAAAAAA+P//////////HQAAAAAAwP///////////////////////x0AAAAAAAAAAAAA8P////////9/fgAAAAAAAPz//////////////////////x8AAAAAAAAAAAAAwP////////8P/wAAAAAAgP///////////////////////wcAAAAAAAAAAAAAgP////////8P/wAAAAAAgP///////////////////////w4AAAAAAAAAAAAAgP//////////4AAAAAAAAP7/////////////////////fw4AAAAAAAAAAAAAAP//////////AQAAAAAAAPz////3/5//////////////PwYAAAAAAAAAAAAAgP////////8/AAAAAAAAAPz////j/s//////////////Hz4AAAAAAAAAAAAAgP///////38OAAAAAAAA/P/P+/8B+M//////////////Dz8AAAAAAAAAAAAAgP///////z8AAAAAAAAA/P/w5/8A4B//////////////gw8AAAAAAAAAAAAAgP///////38AAAAAAAAA/P+wn///8z////////////8/gAMAAAAAAAAAAAAAgP///////w8AAAAAAAAA+B8w/v///3////////////8/gAMAAAAAAAAAAAAAAP///////wMAAAAAAAAA/A8w+M///z/+/////////+8PgAMAAAAAAAAAAAAAAP///////wEAAAAAAAAA/B8AHd///x/+/////////wcfgAMAAAAAAAAAAAAAAP7//////wEAAAAAAAAA+A9wD97//3/+/////////38+8AEAAAAAAAAAAAAAAP7//////wEAAAAAAAAA+Pf/DI7//////////////3888AEAAAAAAAAAAAAAAPz//////wEAAAAAAAAA4P9/AHjw/////////////x88/wEAAAAAAAAAAAAAAPj//////wAAAAAAAAAA4P9/AACw/////////////x/c/wAAAAAAAAAAAAAAAOD/////PwAAAAAAAAAA+P//AACA/////////////x/gHwAAAAAAAAAAAAAAAMD/////HwAAAAAAAAAA/P//Dw/A/////////////z/gAwAAAAAAAAAAAAAAAID/////DwAAAAAAAAAA/P//n//f/////////////z/AAAAAAAAAAAAAAAAAAID/////BwAAAAAAAAAA/P///////////////////z8AAAAAAAAAAAAAAAAAAAD////HDwAAAAAAAAAA/v///////9///////////38AAAAAAAAAAAAAAAAAAAD+/x8ADgAAAAAAAAAA/////////9///////////z8AAAAAAAAAAAAAAAAAAADu/wcADgAAAAAAAADA/////////7///////////x8AAAAAAAAAAAAAAAAAAAD8/wcAbgAAAAAAAADg//////9//3/+/////////x8AAAAAAAAAAAAAAAAAAAD4/wcAbAAAAAAAAADg//////9////4/////////y8AAAAAAAAAAAAAAAAAAAC4/wcAYAAAAAAAAADw/////////v8/wP///////zcAAAAAAAAAAAAAAAAAAABg/wcARgAAAAAAAAD4/////////P//gP///////zMAAAAAAAAAAAAQAAAAAABg/geAfwAAAAAAAAD4/////////f//AP7//////zEAAAAAAAAAAADgAAAAAAAA/Ae8+AEAAAAAAAD8////////+///AP7/////HwAAAAAAAAAAAACAAQAAAAAA/A8+4AMAAAAAAAD4////////+/9/APz/D/9/BgAAAAAAAAAAAACAAwAAAAAA/A8fQH0AAAAAAAD4////////8/8/APD/A/4/BwAAAAAAAAAAAAAAAAAAAAAA+P8f4P4HAAAAAAD4////////5/8/APD/Af5/B3AAAAAAAAAAAAAAAAAAAAAAwP8PwBAAAAAAAAD4////////5/8PAOD/APz/AHAAAAAAAAAAAAAAAAAAAAAAgP8PAAAAAAAAAAD4////////z/8DAOB/APz/AXgAAAAAAAAAAAAAAAAAAAAAANz/AQAAAAAAAAD8////////3/8BAOAfAOz/ATgAAAAAAAAAAAAAAAAAAAAAAID/AQAAAAAAAAD8/////////38AAMAfAOD/A/AAAAAAAAAAAAAAAAAAAAAAAAD+AQAAAAAAAAD4/////////w8AAMAfAMD/A/ABAAAAAAAAAAAAAAAAAAAAAADwAVgAAAAAAAD4/////////wMAAMAfAMD/A7ADAAAAAAAAAAAAAAAAAAAAAADgAf4AAAAAAAD4//////////gAAIAPAMD8A+gDAAAAAAAAAAAAAAAAAAAAAADAAf//AAAAAADg//////////8AAIAPAMD4AewDAAAAAAAAAAAAAAAAAAAAAADA+///AAAAAADg/////////38AAAAfAMBwAMYGAAAAAAAAAAAAAAAAAAAAAAAA////AQAAAADA/////////38AAAA/AMAhAMIHAAAAAAAAAAAAAAAAAAAAAAAA7P//AwAAAACA/////////z8AAAA4AMABAOAHAAAAAAAAAAAAAAAAAAAAAAAAwP//BwAAAAAA/////////z8AAAA4AIAHAIMHAAAAAAAAAAAAAAAAAAAAAAAAwP///wAAAAAA/h///////x8AAAAAADgPwA8DAAAAAAAAAAAAAAAAAAAAAAAAwP///wEAAAAAPAb+/////x8AAAAAAHgP4AcAAAAAAAAAAAAAAAAAAAAAAAAAwP///wMAAAAAAADg/////w8AAAAAAPAP4AMAAAAAAAAAAAAAAAAAAAAAAAAA4P///wMAAAAAAADg/////wcAAAAAAOAf+AMIAAAAAAAAAAAAAAAAAAAAAAAA8P///wcAAAAAAADg/////wMAAAAAAMAf/jcbAAAAAAAAAAAAAAAAAAAAAAAA+P///wMAAAAAAADg/////wAAAAAAAIAP//8ZAAAAAAAAAAAAAAAAAAAAAAAA+P///z8AAAAAAADw////fwAAAAAAAIAP/vvYBwAAAAAAAAAAAAAAAAAAAAAA+P////8AAAAAAADw////PwAAAAAAAAAf/nvAZwAAAAAAAAAAAAAAAAAAAAAA+P////8fAAAAAADg////HwAAAAAAAAA//H0w/wMMAAAAAAAAAAAAAAAAAAAA+P////8/AAAAAADA////HwAAAAAAAAB++H18/x8YAAAAAAAAAAAAAAAAAAAA/P////9/AAAAAACA////DwAAAAAAAAA8APgA/D84AAAAAAAAAAAAAAAAAAAA/P//////AQAAAACA////DwAAAAAAAAA4ANgA5P/fAAAAAAAAAAAAAAAAAAAA/P//////AwAAAAAA////DwAAAAAAAADgHwAAxP/GAQAAAAAAAAAAAAAAAAAA8P//////AwAAAAAA////DwAAAAAAAADAfwAA4P8ADwAAAAAAAAAAAAAAAAAA8P//////AwAAAAAA////DwAAAAAAAAAA/H8P4M8BOAAAAAAAAAAAAAAAAAAA4P//////AQAAAAAA////DwAAAAAAAAAAAJgDAM4DOAAAAAAAAAAAAAAAAAAA4P//////AAAAAAAA/v//HwAAAAAAAAAAAJABAIQHYAAAAAAAAAAAAAAAAAAAwP////9/AAAAAAAA/v//HwAAAAAAAAAAAAAAEw4AAAAAAAAAAAAAAAAAAAAAwP////9/AAAAAAAA////HzAAAAAAAAAAAADAHw4AAAAAAAAAAAAAAAAAAAAAgP////8/AAAAAAAA////H3gAAAAAAAAAAADsHw4AAAAAAAAAAAAAAAAAAAAAgP////8/AAAAAAAA////H3gAAAAAAAAAAAD+Dz4AAAwAAAAAAAAAAAAAAAAAAP////8/AAAAAACA////H34AAAAAAAAAAAD/Pz4AAAwAAQAAAAAAAAAAAAAAAPz///8/AAAAAACA////Hz8AAAAAAAAAAMD/fz4AAAjAAAAAAAAAAAAAAAAAAPD///8fAAAAAACA////hz8AAAAAAAAAAMD//38AAABgAAAAAAAAAAAAAAAAAOD///8fAAAAAACA////AT8AAAAAAAAAAOD//38AAABgAAAAAAAAAAAAAAAAAOD///8fAAAAAAAA////AD8AAAAAAAAAAPD///8BAAAAAAAAAAAAAAAAAAAAAOD///8PAAAAAAAA/v9/gB8AAAAAAAAAAP////8BAAMAAAAAAAAAAAAAAAAAAOD///8PAAAAAAAA/v//gB8AAAAAAAAAwP////8DAAcAAAAAAAAAAAAAAAAAAOD///8HAAAAAAAA/P//gB8AAAAAAAAA4P////8HAAwAAAAAAAAAAAAAAAAAAOD///8BAAAAAAAA/P//gA8AAAAAAAAA4P////8PAAAAAAAAAAAAAAAAAAAAAOD//z8AAAAAAAAA/P//gA8AAAAAAAAA4P////8fAAAAAAAAAAAAAAAAAAAAAOD//x8AAAAAAAAA/P8/AAcAAAAAAAAA4P////8/AAAAAAAAAAAAAAAAAAAAAOD//w8AAAAAAAAA/P8fAAAAAAAAAAAA4P////8/AAAAAAAAAAAAAAAAAAAAAPD//w8AAAAAAAAA+P8fAAAAAAAAAAAA4P////8/AAAAAAAAAAAAAAAAAAAAAPD//w8AAAAAAAAA+P8fAAAAAAAAAAAAwP////8/AAAAAAAAAAAAAAAAAAAAAPD//wcAAAAAAAAA8P8PAAAAAAAAAAAAwP////8/AAAAAAAAAAAAAAAAAAAAAPD//wMAAAAAAAAA4P8HAAAAAAAAAAAAgP////8/AAAAAAAAAAAAAAAAAAAAAPD//wMAAAAAAAAA4P8HAAAAAAAAAAAAgP////8/AAAAAAAAAAAAAAAAAAAAAPD//wAAAAAAAAAA4P8BAAAAAAAAAAAAgP8P/v8fAAAAAAAAAAAAAAAAAAAAAPD//wAAAAAAAAAAwP8AAAAAAAAAAAAAgP8B/P8PAAAAAAAAAAAAAAAAAAAAAPj/fwAAAAAAAAAAwAMAAAAAAAAAAAAAgA8A+P8PAAADAAAAAAAAAAAAAAAAAPj/BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P8HAAAHAAAAAAAAAAAAAAAAAPz/DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgP8HAAAOAAAAAAAAAAAAAAAAAPz/DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgP8DAAB8AAAAAAAAAAAAAAAAAPz/BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAB8AAAAAAAAAAAAAAAAAPw/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAAAAAAAAAAAAAAAPw/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALABAAAdAAAAAAAAAAAAAAAAAP4XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPABAIAfAAAAAAAAAAAAAAAAAP4fAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAMADAAAAAAAAAAAAAAAAAP4PAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAOADAAAAAAAAAAAAAAAAAP4HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAP4DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwAAAAAAAAAAAAAAAAAAP8DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAP8HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8HAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8BAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/ABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP4BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAOAAAAAAAMAAAADAAAAAAAAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAMA/AAAAGAB//+P/vx8AAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAP7//wDw/////////38AAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAADg4P///wP8////////////AAAAAAAAAAAAAAAAAAAAAPA/AAAAAAAAAAAAQAD8/////+P/////////////DwAAAAAAAAAAAAAAAAAAAPB/AAAAAAAAAID///////////H//////////////w8AAAAAAAAAAAAA4AAAAP5/AAAAAAAA//////////////n///////////////8AAAAAAAAAAAAA8A8MAP7/AAAAAADg//////////////////////////////8AAAAAAAAA4D4G8P////7/AAAAAAD4/////////////////////////////z8AAAAAAAD+//9/4P////9/AAAAAAD4/////////////////////////////w8AAAAAAP7///////////8PAAAAAMD//////////////////////////////wEAAAAAgP///////////38AAAAAwP///////////////////////////////wAAAADg/////////////wcAACAA/P///////////////////////////////wEAAADf/////////////wMAAPwB/////////////////////////////////wcAAAAe/v///////////wCAAf8B/////////////////////////////////wAAAAAAgP///////////z/+4f8B/P//////////////////////////////HwAAAACA//////////////8/AP7+////////////////////////////////fwAAAAAA/P///////////////////////////////////////////////////wMAAAAA/P///////////////////////////////////////////////////38A//8B4P//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////';

let cachedBitmap: Uint8Array | null = null;

export function getWonderfulLandBitmap(): Uint8Array {
    if (cachedBitmap) return cachedBitmap;
    if (typeof atob !== 'function') {
        cachedBitmap = new Uint8Array(8100);
        return cachedBitmap;
    }
    const binary = atob(WONDERFUL_LAND_BITMAP_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    cachedBitmap = bytes;
    return cachedBitmap;
}

const DT = 360;
const FT = 180;

export function isWonderfulLand(lat: number, lon: number, bitmap: Uint8Array): boolean {
    let r = Math.floor(((lon + 180.0) / 360.0) * DT);
    let i = Math.floor(((90.0 - lat) / 180.0) * FT);
    if (r < 0) r = 0;
    if (r > DT - 1) r = DT - 1;
    if (i < 0) i = 0;
    if (i > FT - 1) i = FT - 1;
    const a = i * DT + r;
    return ((bitmap[a >> 3] >> (a & 7)) & 1) === 1;
}

export function generateWonderfulLandGeometry(radius: number = 100): THREE.BufferGeometry {
    const count = 52000;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const positions: number[] = [];
    const phases: number[] = [];
    const bitmap = getWonderfulLandBitmap();

    for (let o = 0; o < count; o++) {
        const y = 1 - (o / (count - 1)) * 2;
        const c = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = goldenAngle * o;
        const x = Math.cos(theta) * c;
        const z = Math.sin(theta) * c;

        const lat = Math.asin(y) * (180 / Math.PI);
        const lon = Math.atan2(z, x) * (180 / Math.PI);

        if (isWonderfulLand(lat, lon, bitmap)) {
            positions.push(x * radius, y * radius, z * radius);
            phases.push(o * 2.3999);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    return geo;
}

export function generateWonderfulDustGeometry(radius: number = 100): THREE.BufferGeometry {
    const count = 2200;
    let seed = 1234567;
    const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 2147483647;
        return seed / 2147483647;
    };

    const positions: number[] = [];
    const distRatios: number[] = [];
    const phases: number[] = [];

    for (let t = 0; t < count; t++) {
        const e = rnd() * 2 - 1;
        const th = rnd() * Math.PI * 2;
        const a = Math.sqrt(Math.max(0, 1 - e * e));
        const x = Math.cos(th) * a;
        const y = e;
        const z = Math.sin(th) * a;

        positions.push(x * radius, y * radius, z * radius);
        distRatios.push(1.005 + rnd() * 0.22);
        phases.push(rnd() * Math.PI * 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aDistRatio', new THREE.Float32BufferAttribute(distRatios, 1));
    geo.setAttribute('aDustPhase', new THREE.Float32BufferAttribute(phases, 1));
    return geo;
}

const landVertexShader = `
uniform float uTime;
uniform float uDanceAmount;
uniform float uDotSize;

attribute float aPhase;

varying float vAlpha;
varying float vDepth;

void main() {
    vec3 n = normalize(position);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 vNormal = normalize(normalMatrix * n);
    
    float depth = vNormal.z;
    vDepth = depth;
    
    // Discard back hemisphere points behind the horizon
    if (depth <= 0.02) {
        gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
        return;
    }
    
    // Wonderful.ai continuous particle dance physics (wander & breathe)
    float F = uTime * 1.9;
    float I = uTime * 1.3;
    float p = aPhase;
    
    // Displacement in camera view space plane (more pronounced towards horizon)
    float m = uDanceAmount * 0.34 * (0.35 + 1.15 * (1.0 - depth));
    mvPosition.x += sin(F + p) * m;
    mvPosition.y += cos(I + p * 1.7) * m;
    
    // Wonderful.ai subtle breathing & matte opacity (never bright bloom)
    float breathing = 0.92 + 0.08 * sin(uTime * 1.7 + aPhase * 0.8);
    // 0.35 matte opacity exactly matching wonderful.ai/careers
    vAlpha = (0.16 + 0.84 * sqrt(max(0.0, depth))) * breathing * 0.35;
    
    // Size attenuation: 2.25px dot size with distance perspective scaling
    float sizeFactor = (0.75 + 0.35 * sqrt(max(0.0, depth)));
    gl_PointSize = uDotSize * sizeFactor * (320.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const landFragmentShader = `
precision highp float;
uniform vec3 uColor;

varying float vAlpha;
varying float vDepth;

void main() {
    if (vDepth <= 0.02) discard;
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    
    // Smooth antialiased circular dot with soft matte edge
    float edge = smoothstep(0.5, 0.32, dist);
    // Soft matte starlight (not bright, not shining)
    gl_FragColor = vec4(uColor, vAlpha * edge);
}
`;

const dustVertexShader = `
uniform float uTime;
uniform float uDotSize;

attribute float aDistRatio;
attribute float aDustPhase;

varying float vDustAlpha;

void main() {
    float c = aDistRatio + 0.085 * sin(uTime * 0.7 + aDustPhase);
    vec3 pos = position * c;
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vec3 vNormal = normalize(normalMatrix * normalize(position));
    float d = vNormal.z;
    
    if (d <= -0.35) {
        gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
        return;
    }
    
    float p = 1.0 - min(1.0, abs(d) * 2.2);
    if (p <= 0.05) {
        gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
        return;
    }
    
    float m = 0.5 + 0.5 * sin(uTime * 1.3 + aDustPhase * 2.4);
    vDustAlpha = 0.6 * p * (0.3 + 0.7 * m) * 0.30;
    
    gl_PointSize = max(1.2, uDotSize * 0.7) * (320.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const dustFragmentShader = `
precision highp float;
uniform vec3 uColor;
varying float vDustAlpha;

void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float edge = smoothstep(0.5, 0.32, dist);
    gl_FragColor = vec4(uColor, vDustAlpha * edge);
}
`;

export function createWonderfulHairlineRim(radius: number = 100): THREE.LineLoop {
    const segments = 240;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.19, // exact edgeOpacity on wonderful.ai
        depthWrite: false,
    });
    const ring = new THREE.LineLoop(geometry, material);
    ring.name = 'wonderful-hairline-rim';
    ring.onBeforeRender = (_r, _s, camera) => {
        ring.quaternion.copy(camera.quaternion);
    };
    return ring;
}

export interface WonderfulGlobeSystem {
    group: THREE.Group;
    landPoints: THREE.Points;
    dustPoints: THREE.Points;
    hairlineRim: THREE.LineLoop;
    landMaterial: THREE.ShaderMaterial;
    dustMaterial: THREE.ShaderMaterial;
    update: (timeMs: number) => void;
    setVisible: (visible: boolean) => void;
    dispose: () => void;
}

export function createWonderfulGlobeSystem(radius: number = 100): WonderfulGlobeSystem {
    const group = new THREE.Group();
    group.name = 'wonderful-globe-system';

    const landGeo = generateWonderfulLandGeometry(radius);
    const landMaterial = new THREE.ShaderMaterial({
        vertexShader: landVertexShader,
        fragmentShader: landFragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uDanceAmount: { value: 2.4 }, // exact danceAmount from wonderful.ai/careers
            uDotSize: { value: 2.25 },     // exact dotSize from wonderful.ai/careers
            uColor: { value: new THREE.Color(0xffffff) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
    });
    const landPoints = new THREE.Points(landGeo, landMaterial);
    landPoints.name = 'wonderful-land-points';
    group.add(landPoints);

    const dustGeo = generateWonderfulDustGeometry(radius);
    const dustMaterial = new THREE.ShaderMaterial({
        vertexShader: dustVertexShader,
        fragmentShader: dustFragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uDotSize: { value: 2.25 },
            uColor: { value: new THREE.Color(0xffffff) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMaterial);
    dustPoints.name = 'wonderful-dust-points';
    group.add(dustPoints);

    // Pitch-black occluder sphere to prevent back-hemisphere dots and 3D borders from showing through
    const occluderGeo = new THREE.SphereGeometry(radius * 0.996, 48, 48);
    const occluderMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const occluder = new THREE.Mesh(occluderGeo, occluderMat);
    occluder.name = 'wonderful-occluder-sphere';
    group.add(occluder);

    const hairlineRim = createWonderfulHairlineRim(radius);
    group.add(hairlineRim);

    const update = (timeMs: number) => {
        const tSec = timeMs / 1000.0;
        landMaterial.uniforms.uTime.value = tSec;
        dustMaterial.uniforms.uTime.value = tSec;
    };

    const setVisible = (visible: boolean) => {
        group.visible = visible;
    };

    const dispose = () => {
        landGeo.dispose();
        landMaterial.dispose();
        dustGeo.dispose();
        dustMaterial.dispose();
        occluderGeo.dispose();
        occluderMat.dispose();
        hairlineRim.geometry.dispose();
        (hairlineRim.material as THREE.Material).dispose();
    };

    return {
        group,
        landPoints,
        dustPoints,
        hairlineRim,
        landMaterial,
        dustMaterial,
        update,
        setVisible,
        dispose,
    };
}
