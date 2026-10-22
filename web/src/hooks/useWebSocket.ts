import { useEffect, useRef, useCallback } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import type { ConnectionEvent } from '@shared/types';

const WS_URL = `ws://${window.location.hostname}:${window.location.port || '8765'}/api/ws`;

export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<any>(null);
    const addEvents = useConnectionStore((s) => s.addEvents);
    const eventBufferRef = useRef<ConnectionEvent[]>([]);
    const flushTimerRef = useRef<any>(null);

    const flushBuffer = useCallback(() => {
        if (eventBufferRef.current.length > 0) {
            const batch = eventBufferRef.current;
            eventBufferRef.current = [];
            addEvents(batch);
        }
    }, [addEvents]);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('✦ WebSocket connected');
        };

        ws.onmessage = (msg) => {
            try {
                const parsed = JSON.parse(msg.data);
                if (parsed.type === 'event' && parsed.data) {
                    const evt = parsed.data as ConnectionEvent;
                    // If critical threat or detected anomaly, flush immediately without waiting for interval
                    if (evt.anomaly?.is_anomaly || evt.anomaly?.severity === 'critical') {
                        eventBufferRef.current.push(evt);
                        flushBuffer();
                    } else {
                        eventBufferRef.current.push(evt);
                        // Upper bound cap on buffer to avoid memory spike under massive floods
                        if (eventBufferRef.current.length >= 150) {
                            flushBuffer();
                        }
                    }
                }
            } catch {
                // ignore parse errors
            }
        };

        ws.onclose = () => {
            console.log('✦ WebSocket disconnected, reconnecting in 2s...');
            reconnectTimer.current = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, [flushBuffer]);

    useEffect(() => {
        // High-frequency 100ms batch flush window
        flushTimerRef.current = setInterval(flushBuffer, 100);
        connect();
        return () => {
            clearTimeout(reconnectTimer.current);
            if (flushTimerRef.current) clearInterval(flushTimerRef.current);
            flushBuffer();
            wsRef.current?.close();
        };
    }, [connect, flushBuffer]);

    return wsRef;
}
