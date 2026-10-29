/**
 * Utility to load and cache optimized geopolitical country border lines (177 countries)
 * and verified high-density land dots strictly contained inside country border lines.
 */

export type BorderRing = [number, number][];
export type LandDot = [number, number];

let cachedBorders: BorderRing[] | null = null;
let loadPromise: Promise<BorderRing[]> | null = null;

let cachedFlatDots: LandDot[] | null = null;
let loadDotsPromise: Promise<LandDot[]> | null = null;

export function loadCountryBorders(): Promise<BorderRing[]> {
    if (cachedBorders) return Promise.resolve(cachedBorders);
    if (loadPromise) return loadPromise;

    loadPromise = fetch('/assets/earth/world-borders.json')
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then((data: BorderRing[]) => {
            cachedBorders = data;
            return data;
        })
        .catch((err) => {
            console.warn('Failed to load world country borders:', err);
            return [];
        });

    return loadPromise;
}

export function getCachedCountryBorders(): BorderRing[] {
    return cachedBorders || [];
}

export function loadFlatLandDots(): Promise<LandDot[]> {
    if (cachedFlatDots) return Promise.resolve(cachedFlatDots);
    if (loadDotsPromise) return loadDotsPromise;

    loadDotsPromise = fetch('/assets/earth/flat-land-dots.json')
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then((data: LandDot[]) => {
            cachedFlatDots = data;
            return data;
        })
        .catch((err) => {
            console.warn('Failed to load flat land dots:', err);
            return [];
        });

    return loadDotsPromise;
}

export function getCachedFlatLandDots(): LandDot[] {
    return cachedFlatDots || [];
}

// Prefetch borders & verified land dots immediately on script execution
if (typeof window !== 'undefined') {
    loadCountryBorders();
    loadFlatLandDots();
}
