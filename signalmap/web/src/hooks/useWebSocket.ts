import { useEffect, useRef, useCallback } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import type { ConnectionEvent } from '@shared/types';

function getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || '127.0.0.1';
    const port = window.location.port;
    // In local Vite dev mode (:5173 / :5174), connect directly to the FastAPI backend (:8765)
    // to avoid Vite ws-proxy ECONNABORTED socket errors on tab reload or React StrictMode remounts.
    if (port === '5173' || port === '5174') {
        return `${protocol}//${host}:8765/api/ws`;
    }
    return `${protocol}//${host}:${port || '8765'}/api/ws`;
}

export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const addEvents = useConnectionStore((s) => s.addEvents);
    const eventBufferRef = useRef<ConnectionEvent[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const flushBuffer = useCallback(() => {
        if (eventBufferRef.current.length > 0) {
            const batch = eventBufferRef.current;
            eventBufferRef.current = [];
            addEvents(batch);
        }
    }, [addEvents]);

    useEffect(() => {
        let isDisposed = false;

        const connect = () => {
            if (isDisposed) return;
            if (
                wsRef.current &&
                (wsRef.current.readyState === WebSocket.OPEN ||
                    wsRef.current.readyState === WebSocket.CONNECTING)
            ) {
                return;
            }

            const ws = new WebSocket(getWebSocketUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                if (isDisposed) {
                    ws.close(1000, 'Component unmounted');
                    return;
                }
                console.log('✦ WebSocket connected');
            };

            ws.onmessage = (msg) => {
                if (isDisposed) return;
                try {
                    const parsed = JSON.parse(msg.data);
                    if (parsed.type === 'event' && parsed.data) {
                        const evt = parsed.data as ConnectionEvent;
                        if (evt.anomaly?.is_anomaly || evt.anomaly?.severity === 'critical') {
                            eventBufferRef.current.push(evt);
                            flushBuffer();
                        } else {
                            eventBufferRef.current.push(evt);
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
                if (isDisposed) return;
                console.log('✦ WebSocket disconnected, reconnecting in 2s...');
                reconnectTimer.current = setTimeout(connect, 2000);
            };

            ws.onerror = () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            };
        };

        flushTimerRef.current = setInterval(flushBuffer, 100);
        connect();

        return () => {
            isDisposed = true;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (flushTimerRef.current) clearInterval(flushTimerRef.current);
            flushBuffer();
            const currentWs = wsRef.current;
            wsRef.current = null;
            if (currentWs && currentWs.readyState === WebSocket.OPEN) {
                currentWs.close(1000, 'Cleanup');
            }
        };
    }, [flushBuffer]);

    return wsRef;
}
