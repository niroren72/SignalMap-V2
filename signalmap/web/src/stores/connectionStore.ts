import type { ConnectionEvent } from '@shared/types';
import { create } from 'zustand';
import type { GlobeThemeId } from '../types/globeTheme';
import { createModuleSampleEvents, isSampleEvent } from '../utils/nestedConnections';

export interface OriginGeoState {
    lat: number;
    lng: number;
    city: string;
    country: string;
    ip?: string;
}

export interface FiltersState {
    protocol: string | null;
    direction: string | null;
    service: string | null;
    source: string | null;
    category: string | null;
    anomalyOnly: boolean;
    severity: string | null;
}

export interface TimelineBucket {
    timestamp: string;
    count: number;
    anomalies: number;
}

export interface UserSettings {
    refreshRateMs: number;
    alertBandwidthThresholdMB: number;
    enableAtmosphereGlow: boolean;
    autoRotateGlobe: boolean;
    maxEventsRetention: number;
    enableThreatSounds: boolean;
}

export interface DiagnosticHop {
    hop: number;
    ip: string | null;
    hostname?: string | null;
    times_ms?: number[];
    avg_ms: number | null;
    timeout?: boolean;
    geo?: {
        country?: string;
        city?: string;
        org?: string;
        lat?: number;
        lon?: number;
        asn?: string;
        is_pop?: boolean;
    };
}

export interface ActiveDiagnosticOverlay {
    tool: 'traceroute' | 'ping' | 'path';
    target: string;
    hops: DiagnosticHop[];
    totalHops: number;
    avgLatencyMs?: number | null;
    timestamp: number;
}

export type ActiveViewType = 'dashboard' | 'globe' | 'graph' | 'table' | 'playback' | 'netutils' | 'modules';
export type TableHeightMode = 'collapsed' | 'compact' | 'expanded' | 'full';
export type GlobeProjection = 'globe' | 'flat';
export type LayoutTheme = 'a' | 'b' | 'c' | 'dark' | 'light'; // 'c'/'dark' = Matte Dark Obsidian, 'b'/'light' = Daylight Clean Light, 'a' = Minimal Plasma

interface ConnectionStore {
    events: ConnectionEvent[];
    selectedId: string | null;
    isLive: boolean;
    activeView: ActiveViewType;
    searchQuery: string;
    filters: FiltersState;

    // Modular Multi-Source System
    activeModule: string; // 'all' | 'windows' | 'salesforce' | 'hris' | 'macos' | 'cloud' | 'okta'
    setActiveModule: (moduleId: string) => void;
    sampleLoadedModules: Record<string, boolean>;
    ingestSampleModule: (moduleId: string) => void;
    clearSampleModule: (moduleId: string) => void;

    // Local Host Geo Origin (Synchronized across Globe, FlatMap & Tables)
    originGeo: OriginGeoState;
    setOriginGeo: (origin: OriginGeoState) => void;

    // Diagnostic 3D Globe Projection
    diagnosticOverlay: ActiveDiagnosticOverlay | null;
    setDiagnosticOverlay: (overlay: ActiveDiagnosticOverlay | null) => void;
    clearDiagnosticOverlay: () => void;

    // Modals and UI Toggles
    showSettingsModal: boolean;
    showUploadModal: boolean;
    showLoadingScreen: boolean;
    loadingScreenManualDismiss: boolean;
    isSidebarCollapsed: boolean;
    tableHeightMode: TableHeightMode;
    layoutTheme: LayoutTheme;
    setLayoutTheme: (theme: LayoutTheme) => void;
    globeTheme: GlobeThemeId;
    setGlobeTheme: (theme: GlobeThemeId) => void;
    globeProjection: GlobeProjection;
    setGlobeProjection: (projection: GlobeProjection) => void;

    // Table Sorting
    tableSortField: 'timestamp' | 'process' | 'source' | 'protocol' | 'direction' | 'remote_ip' | 'country' | 'category' | 'bytes' | 'severity';
    tableSortDirection: 'asc' | 'desc';

    // Settings
    settings: UserSettings;

    // Timeline & Playback
    timelineBuckets: TimelineBucket[];
    isScrubbing: boolean;
    playbackTime: number | null; // ms timestamp
    isPlaying: boolean;
    playbackSpeed: number;
    timeRangePreset: '5m' | '15m' | '1h' | '24h' | 'all';

    // Actions
    addEvent: (event: ConnectionEvent) => void;
    addEvents: (events: ConnectionEvent[]) => void;
    setEvents: (events: ConnectionEvent[]) => void;
    setSelectedId: (id: string | null) => void;
    setIsLive: (live: boolean) => void;
    setActiveView: (view: ActiveViewType) => void;
    setSearchQuery: (query: string) => void;
    setFilter: <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => void;
    toggleAnomalyOnly: () => void;
    clearFilters: () => void;

    // UI Toggle Actions
    setShowSettingsModal: (show: boolean) => void;
    setShowUploadModal: (show: boolean) => void;
    setShowLoadingScreen: (show: boolean, manualDismiss?: boolean) => void;
    setIsSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
    setTableHeightMode: (mode: TableHeightMode) => void;
    setTableSort: (field: ConnectionStore['tableSortField']) => void;
    updateSettings: (newSettings: Partial<UserSettings>) => void;

    // Timeline Actions
    setTimelineBuckets: (buckets: TimelineBucket[]) => void;
    setPlaybackTime: (time: number | null | ((prev: number | null) => number | null)) => void;
    setIsPlaying: (playing: boolean) => void;
    setPlaybackSpeed: (speed: number) => void;
    setTimeRangePreset: (preset: '5m' | '15m' | '1h' | '24h' | 'all') => void;
    resetToLive: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
    events: [],
    selectedId: null,
    isLive: true,
    activeView: 'dashboard',
    searchQuery: '',
    filters: {
        protocol: null,
        direction: null,
        service: null,
        source: null,
        category: null,
        anomalyOnly: false,
        severity: null,
    },

    // Modular Multi-Source System
    activeModule: 'all',
    sampleLoadedModules: {},
    originGeo: {
        lat: 32.0853,
        lng: 34.7818,
        city: 'Tel Aviv',
        country: 'IL',
        ip: 'Local Host',
    },

    // Diagnostic 3D Globe Projection
    diagnosticOverlay: null,

    // UI state
    showSettingsModal: false,
    showUploadModal: false,
    showLoadingScreen: true,
    loadingScreenManualDismiss: false,
    isSidebarCollapsed: true,
    tableHeightMode: 'compact',
    layoutTheme: (() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('signalmap-layout-theme');
            if (saved === 'a' || saved === 'b' || saved === 'c' || saved === 'light' || saved === 'dark') return saved as LayoutTheme;
        }
        return 'c';
    })(),
    globeTheme: (() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('signalmap-globe-theme');
            if (saved === 'classic') return 'classic';
            if (saved === 'black-dots') return 'black-dots';
        }
        return 'black-dots';
    })(),
    globeProjection: (() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('signalmap-globe-projection');
            if (saved === 'flat') return 'flat';
        }
        return 'globe';
    })(),

    // Table sorting default
    tableSortField: 'timestamp',
    tableSortDirection: 'desc',

    // Default settings
    settings: {
        refreshRateMs: 1000,
        alertBandwidthThresholdMB: 100,
        enableAtmosphereGlow: true,
        autoRotateGlobe: true,
        maxEventsRetention: 3000,
        enableThreatSounds: false,
    },

    // Timeline & Playback
    timelineBuckets: [],
    isScrubbing: false,
    playbackTime: null,
    isPlaying: false,
    playbackSpeed: 1,
    timeRangePreset: 'all',

    addEvent: (event) =>
        set((state) => {
            const max = state.settings.maxEventsRetention || 3000;
            if (event.id) {
                const idx = state.events.findIndex((e) => e.id === event.id);
                if (idx !== -1) {
                    const updated = [...state.events];
                    updated[idx] = event;
                    return { events: updated };
                }
            }
            const events = [...state.events, event];
            const trimmed = events.length > max ? events.slice(-max) : events;
            return { events: trimmed };
        }),

    addEvents: (newEvents) =>
        set((state) => {
            if (newEvents.length === 0) return state;
            const max = state.settings.maxEventsRetention || 3000;
            const idMap = new Map<string, number>();
            state.events.forEach((e, idx) => {
                if (e.id) idMap.set(e.id, idx);
            });

            const updated = [...state.events];
            const toAppend: ConnectionEvent[] = [];

            for (const ne of newEvents) {
                if (ne.id && idMap.has(ne.id)) {
                    updated[idMap.get(ne.id)!] = ne;
                } else {
                    if (ne.id) idMap.set(ne.id, updated.length + toAppend.length);
                    toAppend.push(ne);
                }
            }

            const allEvents = [...updated, ...toAppend];
            const trimmed = allEvents.length > max ? allEvents.slice(-max) : allEvents;
            return { events: trimmed };
        }),

    setEvents: (events) =>
        set(() => {
            const seen = new Set<string>();
            const deduped: ConnectionEvent[] = [];
            for (const e of events) {
                if (e.id) {
                    if (seen.has(e.id)) continue;
                    seen.add(e.id);
                }
                deduped.push(e);
            }
            return { events: deduped };
        }),

    setSelectedId: (id) => set({ selectedId: id }),

    setIsLive: (live) => set({ isLive: live, isPlaying: false, isScrubbing: !live }),

    setActiveView: (view) => set({ activeView: view }),

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    setFilter: (key, value) =>
        set((state) => ({
            filters: { ...state.filters, [key]: value },
        })),

    toggleAnomalyOnly: () =>
        set((state) => ({
            filters: { ...state.filters, anomalyOnly: !state.filters.anomalyOnly },
        })),

    clearFilters: () =>
        set({
            searchQuery: '',
            filters: {
                protocol: null,
                direction: null,
                service: null,
                source: null,
                category: null,
                anomalyOnly: false,
                severity: null,
            },
        }),

    // Modular Multi-Source System Actions
    setActiveModule: (activeModule) => set({ activeModule }),
    ingestSampleModule: (moduleId) =>
        set((state) => {
            const normId = moduleId === 'aws' ? 'cloud' : moduleId;
            // Remove existing sample events for this module first to avoid duplicates
            const withoutOldSample = state.events.filter((e) => !isSampleEvent(e, normId));
            const sampleBatch = createModuleSampleEvents(normId);
            const max = state.settings.maxEventsRetention || 3000;
            const merged = [...withoutOldSample, ...sampleBatch];
            const trimmed = merged.length > max ? merged.slice(-max) : merged;
            return {
                events: trimmed,
                sampleLoadedModules: { ...state.sampleLoadedModules, [normId]: true },
            };
        }),
    clearSampleModule: (moduleId) =>
        set((state) => {
            const normId = moduleId === 'aws' ? 'cloud' : moduleId;
            const filtered = state.events.filter((e) => !isSampleEvent(e, normId));
            const nextSampleMap = { ...state.sampleLoadedModules };
            delete nextSampleMap[normId];
            return {
                events: filtered,
                sampleLoadedModules: nextSampleMap,
            };
        }),
    setOriginGeo: (originGeo) => set({ originGeo }),

    // Diagnostic 3D Globe Actions
    setDiagnosticOverlay: (diagnosticOverlay) => set({ diagnosticOverlay }),
    clearDiagnosticOverlay: () => set({ diagnosticOverlay: null }),

    // UI Actions
    setShowSettingsModal: (showSettingsModal) => set({ showSettingsModal }),
    setShowUploadModal: (showUploadModal) => set({ showUploadModal }),
    setShowLoadingScreen: (showLoadingScreen, manualDismiss = false) =>
        set({ showLoadingScreen, loadingScreenManualDismiss: manualDismiss }),
    setIsSidebarCollapsed: (collapsedOrUpdater) =>
        set((state) => ({
            isSidebarCollapsed:
                typeof collapsedOrUpdater === 'function'
                    ? collapsedOrUpdater(state.isSidebarCollapsed)
                    : collapsedOrUpdater,
        })),

    setTableHeightMode: (tableHeightMode) => set({ tableHeightMode }),
    setLayoutTheme: (layoutTheme) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('signalmap-layout-theme', layoutTheme);
        }
        set({ layoutTheme });
    },
    setGlobeTheme: (globeTheme) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('signalmap-globe-theme', globeTheme);
        }
        set({ globeTheme });
    },
    setGlobeProjection: (globeProjection) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('signalmap-globe-projection', globeProjection);
        }
        set({ globeProjection });
    },

    setTableSort: (field) =>
        set((state) => {
            if (state.tableSortField === field) {
                return {
                    tableSortDirection: state.tableSortDirection === 'asc' ? 'desc' : 'asc',
                };
            }
            return {
                tableSortField: field,
                tableSortDirection: 'desc',
            };
        }),

    updateSettings: (newSettings) =>
        set((state) => ({
            settings: { ...state.settings, ...newSettings },
        })),

    // Timeline Actions
    setTimelineBuckets: (timelineBuckets) => set({ timelineBuckets }),

    setPlaybackTime: (timeOrUpdater) =>
        set((state) => {
            const newTime = typeof timeOrUpdater === 'function' ? timeOrUpdater(state.playbackTime) : timeOrUpdater;
            return {
                playbackTime: newTime,
                isScrubbing: newTime !== null,
                isLive: newTime === null,
            };
        }),

    setIsPlaying: (isPlaying) => set({ isPlaying, isLive: false, isScrubbing: true }),

    setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),

    setTimeRangePreset: (timeRangePreset) => set({ timeRangePreset }),

    resetToLive: () =>
        set({
            isLive: true,
            isPlaying: false,
            isScrubbing: false,
            playbackTime: null,
        }),
}));
