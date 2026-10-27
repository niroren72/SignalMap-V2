/**
 * 3D Globe Theme Definitions for SignalMap
 * Focused on two curated visual themes:
 * 1. Black Dots: Minimalist monochrome obsidian sphere with fine starlight dots matching download.png
 * 2. Blue Marble: High-resolution NASA Satellite daytime earth with topographic relief bump mapping
 */

export type GlobeThemeId = 'black-dots' | 'classic';

export interface GlobeThemeConfig {
    id: GlobeThemeId;
    name: string;
    subtitle: string;
    tag: string;
    badge?: string;
    description: string;
    inspiration?: string;
    textureUrl: string;
    bumpUrl?: string;
    atmosphereColor: string;
    atmosphereAltitude: number;
    backgroundColor: string;
    originColor: string;
    ringMaxRadius: number;
    ringPropagationSpeed: number;
    ringRepeatPeriod: number;
    ringColor: (t: number) => string;
    arcColors: (event: any) => [string, string];
    pointColor: (point: any) => string;
    swatches: string[];
    borderColor: string;
    borderWidth: number;
    previewSwatches: {
        dots: string;
        atmosphere: string;
        arc: string;
    };
}

export const GLOBE_THEMES: Record<GlobeThemeId, GlobeThemeConfig> = {
    'black-dots': {
        id: 'black-dots',
        name: 'Black Dots',
        subtitle: 'Dancing Starlight Particles',
        tag: 'Wonderful.ai • Particle Field',
        badge: 'Wonderful.ai',
        description:
            'Authentic Wonderful.ai particle globe: 16,700 dancing land dots floating and wandering around themselves, 100% black void oceans, matte non-shining starlight, and 2,200 outer space dust particles.',
        textureUrl: '/assets/earth/earth-black-dots.png',
        atmosphereColor: 'rgba(226, 232, 240, 0.25)',
        atmosphereAltitude: 0.025,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        originColor: '#ffffff',
        ringMaxRadius: 5.0,
        ringPropagationSpeed: 1.8,
        ringRepeatPeriod: 1800,
        ringColor: (t: number) => `rgba(226, 232, 240, ${Math.max(0, (1 - t) * 0.5)})`,
        arcColors: (event: any) => {
            if (event?.anomaly?.is_anomaly) {
                return ['rgba(239, 68, 68, 0.95)', 'rgba(251, 113, 133, 0.95)'];
            }
            return ['rgba(255, 255, 255, 0.85)', 'rgba(203, 213, 225, 0.35)'];
        },
        pointColor: (p: any) => {
            if (p.hasAnomaly) return p.maxSeverity === 'critical' ? '#ef4444' : '#f43f5e';
            return '#ffffff';
        },
        swatches: ['#000000', '#ffffff', '#e2e8f0', '#94a3b8'],
        borderColor: 'rgba(255, 255, 255, 0.75)',
        borderWidth: 2.0,
        previewSwatches: {
            dots: '#ffffff',
            atmosphere: '#e2e8f0',
            arc: '#cbd5e1',
        },
    },

    classic: {
        id: 'classic',
        name: 'Blue Marble',
        subtitle: 'NASA Satellite',
        tag: 'Orbital Recon',
        badge: 'NASA Classic',
        description:
            'High-resolution NASA Blue Marble daytime earth with topographical elevation relief bump mapping and natural sky blue atmosphere.',
        textureUrl: '/assets/earth/earth-blue-marble.jpg',
        bumpUrl: '/assets/earth/earth-topology.png',
        atmosphereColor: '#4fc3f7',
        atmosphereAltitude: 0.18,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        originColor: '#10b981',
        ringMaxRadius: 5.0,
        ringPropagationSpeed: 2.0,
        ringRepeatPeriod: 1800,
        ringColor: (t: number) => `rgba(6, 182, 212, ${Math.max(0, (1 - t) * 0.7)})`,
        arcColors: (event: any) => {
            if (event?.anomaly?.is_anomaly) {
                return ['rgba(239, 68, 68, 0.9)', 'rgba(244, 63, 94, 0.95)'];
            }
            return event.protocol === 'tcp'
                ? ['rgba(59, 130, 246, 0.85)', 'rgba(96, 165, 250, 0.95)']
                : ['rgba(139, 92, 246, 0.85)', 'rgba(192, 132, 252, 0.95)'];
        },
        pointColor: (p: any) => {
            if (p.hasAnomaly) return p.maxSeverity === 'critical' ? '#ef4444' : '#f43f5e';
            return '#06b6d4';
        },
        swatches: ['#0b1a30', '#1d4ed8', '#4fc3f7', '#10b981'],
        borderColor: 'rgba(56, 189, 248, 0.92)',
        borderWidth: 2.0,
        previewSwatches: {
            dots: '#38bdf8',
            atmosphere: '#4fc3f7',
            arc: '#3b82f6',
        },
    },
};
