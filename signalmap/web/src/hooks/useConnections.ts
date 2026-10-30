import { useEffect, useState, useMemo } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import type { ConnectionEvent } from '@shared/types';
import { matchesModule, normalizeEventGeoToOrigin } from '../utils/nestedConnections';

const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8765/api' : '/api';

export function useInitialEvents() {
    const setEvents = useConnectionStore((s) => s.setEvents);
    const setTimelineBuckets = useConnectionStore((s) => s.setTimelineBuckets);
    const setOriginGeo = useConnectionStore((s) => s.setOriginGeo);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        // Fetch local origin geo first so LAN/local events synchronize to actual location (e.g., Israel)
        fetch(`${API_BASE}/system/origin`)
            .then((res) => res.json())
            .then((data) => {
                if (data.latitude != null && data.longitude != null) {
                    setOriginGeo({
                        lat: data.latitude,
                        lng: data.longitude,
                        city: data.city || 'Tel Aviv',
                        country: data.country || 'IL',
                        ip: data.public_ip || data.ip || 'Local Host',
                    });
                }
            })
            .catch(() => {
                // Keep store default (Tel Aviv, IL)
            });

        // Fetch recent events
        fetch(`${API_BASE}/events?limit=1000`)
            .then((res) => res.json())
            .then((data) => {
                if (data.events) {
                    const currentOrigin = useConnectionStore.getState().originGeo;
                    const normalized = (data.events as ConnectionEvent[]).map((e) =>
                        normalizeEventGeoToOrigin(e, currentOrigin)
                    );
                    setEvents(normalized);
                }
                setLoaded(true);
            })
            .catch((err) => {
                console.error('Failed to load initial events:', err);
                setLoaded(true);
            });

        // Fetch timeline buckets
        fetch(`${API_BASE}/events/timeline?buckets=50`)
            .then((res) => res.json())
            .then((data) => {
                if (data.timeline) {
                    setTimelineBuckets(data.timeline);
                }
            })
            .catch((err) => {
                console.error('Failed to load timeline:', err);
            });
    }, [setEvents, setTimelineBuckets, setOriginGeo]);

    return loaded;
}

export function useFilteredEvents(): ConnectionEvent[] {
    const events = useConnectionStore((s) => s.events);
    const filters = useConnectionStore((s) => s.filters);
    const searchQuery = useConnectionStore((s) => s.searchQuery).toLowerCase().trim();
    const playbackTime = useConnectionStore((s) => s.playbackTime);
    const isLive = useConnectionStore((s) => s.isLive);
    const timeRangePreset = useConnectionStore((s) => s.timeRangePreset);
    const activeModule = useConnectionStore((s) => s.activeModule);
    const originGeo = useConnectionStore((s) => s.originGeo);
    const [mountTime] = useState(() => Date.now());

    return useMemo(() => {
        const now = mountTime;
        let minTimeMs = 0;
        if (timeRangePreset === '5m') minTimeMs = now - 5 * 60 * 1000;
        else if (timeRangePreset === '15m') minTimeMs = now - 15 * 60 * 1000;
        else if (timeRangePreset === '1h') minTimeMs = now - 60 * 60 * 1000;
        else if (timeRangePreset === '24h') minTimeMs = now - 24 * 60 * 60 * 1000;

        return events
            .filter((e) => {
                // Modular Multi-Source Plugin filter
                if (!matchesModule(e, activeModule)) return false;

            // Event timestamp
            const eventTime = e.metrics?.last_seen || e.metrics?.first_seen;
            const eventMs = eventTime ? new Date(eventTime).getTime() : now;

            // Time range preset filter
            if (minTimeMs > 0 && eventMs < minTimeMs) return false;

            // Playback scrubber filter
            if (!isLive && playbackTime !== null) {
                // Show events within a window around scrubber time (or up to scrubber time)
                if (eventMs > playbackTime) return false;
            }

            // Anomaly filter
            if (filters.anomalyOnly) {
                if (!e.anomaly?.is_anomaly) return false;
            }

            // Severity filter
            if (filters.severity && e.anomaly?.severity !== filters.severity) {
                return false;
            }

            // Protocol filter
            if (filters.protocol && e.protocol !== filters.protocol) return false;

            // Direction filter
            if (filters.direction && e.direction !== filters.direction) return false;

            // Category filter
            if (filters.category && e.service?.category !== filters.category) return false;

            // Service name filter
            if (filters.service && e.service?.name !== filters.service) return false;

            // Source filter
            if (filters.source && e.source_collector !== filters.source) return false;

            // Search Query filter
            if (searchQuery) {
                const proc = (e.local?.process_name || '').toLowerCase();
                const pid = String(e.local?.pid || '');
                const ip = (e.remote?.ip || '').toLowerCase();
                const host = (e.remote?.hostname || '').toLowerCase();
                const srv = (e.service?.name || '').toLowerCase();
                const city = (e.geo?.city || '').toLowerCase();
                const country = (e.geo?.country || '').toLowerCase();
                const asn = (e.asn?.org || '').toLowerCase();
                const anomalyTitle = (e.anomaly?.title || '').toLowerCase();

                const match =
                    proc.includes(searchQuery) ||
                    pid.includes(searchQuery) ||
                    ip.includes(searchQuery) ||
                    host.includes(searchQuery) ||
                    srv.includes(searchQuery) ||
                    city.includes(searchQuery) ||
                    country.includes(searchQuery) ||
                    asn.includes(searchQuery) ||
                    anomalyTitle.includes(searchQuery);

                if (!match) return false;
            }

            return true;
        })
        .map((e) => normalizeEventGeoToOrigin(e, originGeo));
    }, [events, filters, searchQuery, playbackTime, isLive, timeRangePreset, activeModule, originGeo, mountTime]);
}
