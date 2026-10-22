import { useEffect, useRef, useState, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useFilteredEvents } from '../hooks/useConnections';
import { useConnectionStore } from '../stores/connectionStore';

export function GraphView() {
    const fgRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const events = useFilteredEvents();
    const setSelectedId = useConnectionStore((s) => s.setSelectedId);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    // Transform events into graph nodes and edges
    const { nodes, links } = useMemo(() => {
        const ns = new Map<string, any>();
        const ls: any[] = [];

        // Local host node
        ns.set('local', {
            id: 'local',
            name: 'Local Host [Local Machine]',
            group: 'local',
            color: '#3b82f6',
            val: 6,
        });

        events.forEach((e) => {
            const isAnomaly = e.anomaly?.is_anomaly;

            // Process node
            const procId = `proc-${e.local?.pid || e.local?.process_name || 'unknown'}`;
            if (!ns.has(procId)) {
                ns.set(procId, {
                    id: procId,
                    name: `${e.local?.process_name || 'System'} (PID ${e.local?.pid ?? 'N/A'})`,
                    group: 'process',
                    hasAnomaly: isAnomaly,
                    color: isAnomaly ? '#ef4444' : '#06b6d4',
                    val: isAnomaly ? 4 : 2.5,
                });
                ls.push({
                    source: 'local',
                    target: procId,
                    color: isAnomaly ? '#ef4444' : '#1e293b',
                    val: 1,
                });
            } else if (isAnomaly) {
                const pNode = ns.get(procId);
                pNode.hasAnomaly = true;
                pNode.color = '#ef4444';
            }

            // Remote endpoint node
            const remoteId = e.remote?.ip || e.remote?.hostname || 'unknown';
            if (!ns.has(remoteId)) {
                ns.set(remoteId, {
                    id: remoteId,
                    name: `${e.remote?.hostname || e.remote?.ip || 'Remote'}${
                        e.service?.name ? ` [${e.service.name}]` : ''
                    }`,
                    group: 'remote',
                    service: e.service?.name,
                    hasAnomaly: isAnomaly,
                    color: isAnomaly ? '#f43f5e' : '#10b981',
                    val: isAnomaly ? 3.5 : 2,
                    event: e,
                });
            } else if (isAnomaly) {
                const rNode = ns.get(remoteId);
                rNode.hasAnomaly = true;
                rNode.color = '#f43f5e';
            }

            // Connection edge
            ls.push({
                source: procId,
                target: remoteId,
                event: e,
                color: isAnomaly ? '#ef4444' : getProtocolColor(e.protocol),
                val: isAnomaly ? 2.5 : Math.max(1, (e.metrics?.bytes_out || 0) / 10000),
                particles: isAnomaly ? 4 : 2,
            });
        });

        return { nodes: Array.from(ns.values()), links: ls };
    }, [events]);

    function getProtocolColor(protocol?: string) {
        switch (protocol) {
            case 'tcp':
                return '#3b82f6';
            case 'udp':
                return '#8b5cf6';
            case 'http':
                return '#10b981';
            case 'https':
                return '#06b6d4';
            case 'ws':
            case 'wss':
                return '#ec4899';
            default:
                return '#94a3b8';
        }
    }

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ width, height });
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div ref={containerRef} className="absolute inset-0 z-0">
            <ForceGraph3D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={{ nodes, links }}
                nodeLabel="name"
                nodeColor="color"
                nodeRelSize={4}
                linkDirectionalParticles="particles"
                linkDirectionalParticleSpeed={0.006}
                linkColor="color"
                linkWidth="val"
                backgroundColor="rgba(0,0,0,0)"
                onNodeClick={(node: any) => {
                    if (node.event) setSelectedId(node.event.id);
                    // Center camera on node
                    const distance = 40;
                    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
                    fgRef.current?.cameraPosition(
                        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                        node,
                        2500
                    );
                }}
                onLinkClick={(link: any) => {
                    if (link.event) setSelectedId(link.event.id);
                }}
            />
        </div>
    );
}
