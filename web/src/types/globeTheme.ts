/**
 * 3D Globe Theme Definitions for SignalMap
 * Inspired by Wonderful AI (https://www.wonderful.ai/careers) and modern aerospace/cyber telemetry.
 */

export type GlobeThemeId =
    | 'wonderful-ai'
    | 'cyberpunk'
    | 'aurora'
    | 'solar'
    | 'matrix'
    | 'classic';

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
    previewSwatches: {
        dots: string;
        atmosphere: string;
        arc: string;
    };
}

export const GLOBE_THEMES: Record<GlobeThemeId, GlobeThemeConfig> = {
    'wonderful-ai': {
        id: 'wonderful-ai',
        name: 'Wonderful AI',
        subtitle: 'Starlight Cobalt',
        tag: 'Featured • wonderful.ai',
        badge: 'Featured',
        description:
            'Inspired by Wonderful AI Careers. Deep void sphere, warm starlight ivory continent dot-matrix, electric cobalt atmosphere halo, and pulsating radar beacons.',
        inspiration: 'https://www.wonderful.ai/careers',
        textureUrl: '/assets/earth/earth-wonderful-dots.png',
        atmosphereColor: '#3286f5',
        atmosphereAltitude: 0.22,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        originColor: '#3286f5',
        ringMaxRadius: 6.5,
        ringPropagationSpeed: 2.2,
        ringRepeatPeriod: 1400,
        ringColor: (t: number) => `rgba(50, 134, 245, ${Math.max(0, (1 - t) * 0.75)})`,
        arcColors: (event: any) => {
            if (event?.anomaly?.is_anomaly) {
                return ['rgba(239, 68, 68, 0.95)', 'rgba(251, 113, 133, 0.95)'];
            }
            // Cobalt to electric light blue
            return ['rgba(50, 134, 245, 0.85)', 'rgba(138, 180, 248, 0.95)'];
        },
        pointColor: (p: any) => {
            if (p.hasAnomaly) return p.maxSeverity === 'critical' ? '#ef4444' : '#f43f5e';
            return '#3286f5';
        },
        swatches: ['#060b18', '#e4e0d6', '#3286f5', '#8ab4f8'],
        previewSwatches: {
            dots: '#e4e0d6',
            atmosphere: '#3286f5',
            arc: '#8ab4f8',
        },
    },

    cyberpunk: {
        id: 'cyberpunk',
        name: 'Cyberpunk Neon',
        subtitle: 'Night City Obsidian',
        tag: 'High Voltage',
        badge: 'Neon',
        description:
            'Pure OLED obsidian sphere with high-voltage neon cyan dot matrix, laser magenta telemetry arcs, and deep ultraviolet atmospheric corona.',
        textureUrl: '/assets/earth/earth-cyberpunk-dots.png',
        atmosphereColor: '#7000ff',
        atmosphereAltitude: 0.26,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        originColor: '#05d9e8',
        ringMaxRadius: 7.0,
        ringPropagationSpeed: 2.8,
        ringRepeatPeriod: 1200,
        ringColor: (t: number) => `rgba(255, 42, 109, ${Math.max(0, (1 - t) * 0.8)})`,
        arcColors: (event: any) => {
            if (event?.anomaly?.is_anomaly) {
                return ['rgba(255, 0, 85, 0.95)', 'rgba(255, 110, 180, 0.95)'];
            }
            return ['rgba(255, 42, 109, 0.9)', 'rgba(5, 217, 232, 0.95)'];
        },
        pointColor: (p: any) => {
            if (p.hasAnomaly) return '#ff0055';
            return '#05d9e8';
        },
        swatches: ['#030008', '#05d9e8', '#ff2a6d', '#7000ff'],
        previewSwatches: {
            dots: '#05d9e8',
            atmosphere: '#7000ff',
            arc: '#ff2a6d',
        },
    },

    aurora: {
        id: 'aurora',
        name: 'Aurora Borealis',
        subtitle: 'Nordic Sentinel',
        tag: 'Polar Defense',
        badge: 'Emerald',
        description:
            'Deep arctic abyss with jade and mint emerald continent dots, polar cyan atmospheric curtain, and icy teal radar ripple waves.',
        textureUrl: '/assets/earth/earth-aurora-dots.png',
        atmosphereColor: '#06b6d4',
        atmosphereAltitude: 0.28,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        originColor: '#10b981',
        ringMaxRadius: 6.0,
        ringPropagationSpeed: 2.0,
        ringRepeatPeriod: 1600,
        ringColor: (t: number) => `rgba(6, 182, 212, ${Math.max(0, (1 - t) * 0.75)})`,
        arcColors: (event: any) => {
            if (event?.anomaly?.is_anomaly) {
                return ['rgba(244, 63, 94, 0.95)', 'rgba(251, 146, 60, 0.95)'];
            }
            return ['rgba(16, 185, 129, 0.85)', 'rgba(56, 189, 248, 0.95)'];
        },
        pointColor: (p: any) => {
            if (p.hasAnomaly) return '#f43f5e';
            return '#10b981';
        },
        swatches: ['#021019', '#34d399', '#06b6d4', '#38bdf8'],
        previewSwatches: {
            dots: '#34d399',
            atmosphere: '#06b6d4',
            arc: '#38bdf8',
        },
    },

    solar: {
        id: 'solar',
        name: 'Solar Flare',
        subtitle: 'Obsidian & Gold',
        tag: 'Kinetic Alert',
        badge: 'Molten Gold',
        description:
            'Basalt charcoal sphere with molten gold dots, incandescent flame orange solar arcs, and a warm thermonuclear corona.',
        textureUrl: '/assets/earth/earth-solar-dots.png',
        atmosphereColor: '#ea580c',
        atmosphereAltitude: 0.22,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        originColor: '#fbbf24',
        ringMaxRadius: 6.0,
        ringPropagationSpeed: 2.4,
        ringRepeatPeriod: 1300,
        ringColor: (t: number) => `rgba(234, 88, 12, ${Math.max(0, (1 - t) * 0.8)})`,
        arcColors: (event: any) => {
            if (event?.anomaly?.is_anomaly) {
                return ['rgba(239, 68, 68, 0.95)', 'rgba(249, 115, 22, 0.95)'];
            }
            return ['rgba(234, 88, 12, 0.9)', 'rgba(251, 191, 36, 0.95)'];
        },
        pointColor: (p: any) => {
            if (p.hasAnomaly) return '#ef4444';
            return '#fbbf24';
        },
        swatches: ['#0a0807', '#fbbf24', '#f59e0b', '#ea580c'],
        previewSwatches: {
            dots: '#fbbf24',
            atmosphere: '#ea580c',
            arc: '#f59e0b',
        },
    },

    matrix: {
        id: 'matrix',
        name: 'Matrix CRT',
        subtitle: 'Terminal Phosphor',
        tag: 'Cyber Recon',
        badge: 'Phosphor',
        description:
            'Monochromatic hacker CRT green phosphor dot-matrix, tactical digital radar blips, and emerald night-vision atmosphere.',
        textureUrl: '/assets/earth/earth-matrix-dots.png',
        atmosphereColor: '#15803d',
        atmosphereAltitude: 0.24,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        originColor: '#22c55e',
        ringMaxRadius: 6.5,
        ringPropagationSpeed: 2.5,
        ringRepeatPeriod: 1500,
        ringColor: (t: number) => `rgba(34, 197, 94, ${Math.max(0, (1 - t) * 0.8)})`,
        arcColors: (event: any) => {
            if (event?.anomaly?.is_anomaly) {
                return ['rgba(244, 63, 94, 0.95)', 'rgba(251, 146, 60, 0.95)'];
            }
            return ['rgba(21, 128, 61, 0.9)', 'rgba(74, 222, 128, 0.95)'];
        },
        pointColor: (p: any) => {
            if (p.hasAnomaly) return '#f43f5e';
            return '#22c55e';
        },
        swatches: ['#021a0d', '#22c55e', '#4ade80', '#15803d'],
        previewSwatches: {
            dots: '#22c55e',
            atmosphere: '#15803d',
            arc: '#4ade80',
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
        previewSwatches: {
            dots: '#38bdf8',
            atmosphere: '#4fc3f7',
            arc: '#3b82f6',
        },
    },
};
