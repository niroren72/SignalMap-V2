/**
 * Shared hover-label HTML builders for the 3D globe and the flat map projection.
 * Kept in one place so both projections render identical tooltips.
 */

export function buildArcLabel(arc: any): string {
    if (arc.isDiagnostic) {
        return `
          <div class="glass-card p-2.5 text-xs border border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.3)]" style="min-width: 200px;">
            <div class="bg-gradient-to-r from-cyan-950/80 to-blue-950/80 text-cyan-300 font-bold px-1.5 py-0.5 rounded text-[10px] mb-1.5 border border-cyan-500/40 flex items-center justify-between font-mono">
              <span>HOP #${arc.fromHop} &rarr; #${arc.toHop}</span>
              ${arc.isPop ? '<span class="bg-violet-900/80 text-violet-300 px-1 py-0.2 rounded text-[9px]">PoP / IXP</span>' : ''}
            </div>
            <div class="font-bold text-gray-100 mb-0.5">${arc.toLabel || arc.toCity}</div>
            <div class="text-slate-300 text-[11px]">${arc.toCity}${arc.toCountry ? ', ' + arc.toCountry : ''}</div>
            ${arc.toOrg ? `<div class="text-slate-400 text-[10px] truncate"><span class="opacity-70">ORG:</span> ${arc.toOrg}</div>` : ''}
            <div class="text-emerald-400 font-mono font-bold text-xs mt-1 border-t border-slate-700/60 pt-1">
              RTT: ${arc.latency != null ? arc.latency + ' ms' : 'Timeout'}
            </div>
          </div>
        `;
    }

    const e = arc.event;
    const proc = e.local?.process_name || 'System';
    const isThreat = e.anomaly?.is_anomaly;
    const extra =
        arc.count && arc.count > 1
            ? `<div class="text-slate-500 text-[10px] mt-1 font-mono">+${arc.count - 1} more connection${arc.count > 2 ? 's' : ''} on this route</div>`
            : '';
    return `
          <div class="glass-card p-2.5 text-xs border ${
              isThreat ? 'border-rose-500/80' : 'border-slate-700'
          }" style="min-width: 180px;">
            ${
                isThreat
                    ? `<div class="bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded text-[10px] mb-1.5 border border-rose-500/40 flex items-center gap-1 font-mono"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>${
                          e.anomaly.title || 'SECURITY ALERT'
                      }</div>`
                    : ''
            }
            <div class="font-bold text-gray-200 border-b border-gray-700/60 mb-1 pb-1 font-mono">${proc} <span class="text-slate-500">(PID ${e.local?.pid ?? 'N/A'})</span></div>
            <div class="font-semibold text-cyan-300 font-mono">${e.remote?.hostname || e.remote?.ip || 'Unknown'}</div>
            <div class="text-slate-300 text-[11px]">${e.service?.name || 'Unclassified'} &bull; <span class="uppercase text-slate-400 font-mono">${e.protocol}</span></div>
            <div class="text-slate-400 text-[10px] mt-0.5">${e.geo?.city || 'Transit'}, ${e.geo?.country || 'Global'}</div>
            ${extra}
          </div>
        `;
}

export function buildPointLabel(pt: any): string {
    if (pt.isDiagnostic) {
        return `
          <div class="glass-card p-2.5 text-xs border border-cyan-500/70" style="min-width: 180px;">
            <div class="text-cyan-300 font-mono font-bold text-[10px] mb-1">${
                pt.isOrigin ? 'ORIGIN' : pt.isDestination ? `DESTINATION · HOP #${pt.hopNum}` : `HOP #${pt.hopNum}`
            }</div>
            <div class="font-bold text-gray-100 font-mono">${pt.label || pt.ip || ''}</div>
            <div class="text-slate-300 text-[11px]">${pt.city || ''}${pt.country ? ', ' + pt.country : ''}</div>
            ${pt.org ? `<div class="text-slate-400 text-[10px] truncate">${pt.org}</div>` : ''}
            ${
                !pt.isOrigin
                    ? `<div class="text-emerald-400 font-mono font-bold mt-1">RTT: ${pt.avg_ms != null ? pt.avg_ms + ' ms' : 'Timeout'}</div>`
                    : ''
            }
            <div class="mt-1.5 pt-1 border-t border-slate-700/60 flex items-center justify-between text-[9px] text-cyan-400 font-mono font-semibold">
              <span>CLICK FOR GOOGLE STREET VIEW</span>
              <span>&rarr;</span>
            </div>
          </div>
        `;
    }

    const first = pt.events?.[0];
    const city = first?.geo?.city || 'Transit';
    const country = first?.geo?.country || 'Global';
    const procs = Array.from(
        new Set((pt.events || []).map((e: any) => e.local?.process_name || 'System'))
    ).slice(0, 3);
    return `
          <div class="glass-card p-2.5 text-xs border ${pt.hasAnomaly ? 'border-rose-500/80' : 'border-slate-700'}" style="min-width: 170px;">
            <div class="font-bold text-gray-100">${city}, ${country}</div>
            <div class="text-cyan-300 font-mono text-[11px]">${pt.size} connection${pt.size === 1 ? '' : 's'}</div>
            <div class="text-slate-400 text-[10px] font-mono mt-0.5 truncate">${procs.join(' · ')}</div>
            ${
                pt.hasAnomaly
                    ? `<div class="text-rose-300 font-mono font-bold text-[10px] mt-1 uppercase">${pt.maxSeverity} severity anomaly</div>`
                    : ''
            }
            <div class="mt-1.5 pt-1 border-t border-slate-700/60 flex items-center justify-between text-[9px] text-cyan-400 font-mono font-semibold">
              <span>CLICK FOR GOOGLE STREET VIEW</span>
              <span>&rarr;</span>
            </div>
          </div>
        `;
}
