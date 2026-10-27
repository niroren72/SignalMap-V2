/**
 * Utility to load and cache optimized geopolitical country border lines (177 countries).
 * Each path is an array of [lng, lat] coordinate pairs defining boundary rings.
 */

export type BorderRing = [number, number][];

let cachedBorders: BorderRing[] | null = null;
let loadPromise: Promise<BorderRing[]> | null = null;

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

// Prefetch borders immediately on script execution
if (typeof window !== 'undefined') {
    loadCountryBorders();
}
