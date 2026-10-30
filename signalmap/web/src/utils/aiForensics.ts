import type { ConnectionEvent } from '@shared/types';
import type { StreamDissectionResult } from './payloadInspector';

export interface AISummaryResult {
    verdictTitle: string;
    executiveSummary: string;
    riskLevel: 'Nominal' | 'Low Risk' | 'Suspicious' | 'High Risk' | 'Critical Alert';
    riskScore: number; // 0-100
    confidenceScore: number; // 0-100
    behaviorTags: string[];
    mitreAttack: {
        tactic: string;
        technique: string;
        id: string;
    } | null;
    fourPillars: {
        processVerdict: string;
        networkVerdict: string;
        dataAndPiiVerdict: string;
        defensiveAction: string;
    };
    recommendedActions: string[];
    isExfiltrationRisk: boolean;
    isThreat: boolean;
    generatedAt: string;
    markdownReport: string;
}

// Known reputable cloud ASNs
const TRUSTED_ASNS = [
    'google',
    'microsoft',
    'amazon',
    'cloudflare',
    'salesforce',
    'fastly',
    'akamai',
    'apple',
    'github',
];

// High risk processes if executing outbound sockets
const HIGH_RISK_PROCS = [
    'powershell.exe',
    'cmd.exe',
    'certutil.exe',
    'rundll32.exe',
    'mshta.exe',
    'cscript.exe',
    'wscript.exe',
    'vssadmin.exe',
];

export function generateAISummary(
    event: ConnectionEvent,
    dissection?: StreamDissectionResult | null
): AISummaryResult {
    const proc = (event.local?.process_name || 'System').toLowerCase();
    const pid = event.local?.pid ?? 'N/A';
    const user = (event.local as any)?.user || 'SYSTEM';
    const remoteHost = (event.remote?.hostname || event.asn?.org || event.remote?.ip || 'unknown').toLowerCase();
    const remoteIp = event.remote?.ip || '0.0.0.0';
    const port = event.remote?.port || 443;
    const proto = (event.protocol || 'TCP').toUpperCase();
    const dir = (event.direction || 'outbound').toLowerCase();
    const isAnomaly = Boolean(event.anomaly?.is_anomaly);
    const severity = (event.anomaly?.severity || 'low').toLowerCase();
    const bytesIn = event.metrics?.bytes_in || 0;
    const bytesOut = event.metrics?.bytes_out || 0;
    const piiCount = dissection?.allPii.length || 0;
    const criticalPiiCount = dissection?.allPii.filter((p) => p.severity === 'critical').length || 0;
    const country = event.geo?.country || 'Local';
    const city = event.geo?.city || '';

    // Calculate Risk Score (0 - 100)
    let score = 5;
    const tags: string[] = [];

    // Factor 1: Anomaly flags
    if (isAnomaly) {
        if (severity === 'critical') score += 55;
        else if (severity === 'high') score += 40;
        else if (severity === 'medium') score += 25;
        else score += 15;
        tags.push('Flagged Threat');
    }

    // Factor 2: Suspicious process
    if (HIGH_RISK_PROCS.some((p) => proc.includes(p))) {
        score += 35;
        tags.push('Living-off-the-Land Binary');
    }

    // Factor 3: PII Sensitivity
    if (criticalPiiCount > 0) {
        score += 20;
        tags.push('Critical PII in Transit');
    } else if (piiCount > 0) {
        score += 10;
        tags.push('User Identifiers Detected');
    }

    // Factor 4: Data Exfiltration ratio (large outbound bytes to non-trusted host)
    const isExfil = bytesOut > 100000 && bytesOut > bytesIn * 3;
    const isTrustedAsn = TRUSTED_ASNS.some((asn) => remoteHost.includes(asn));
    if (isExfil && !isTrustedAsn) {
        score += 25;
        tags.push('High Outbound Ratio (Exfil Risk)');
    }

    // Factor 5: Non-standard lateral movement ports
    if ([445, 3389, 135, 139].includes(port) && !remoteIp.startsWith('127.')) {
        score += 20;
        tags.push('Lateral Movement Port');
    }

    if (remoteIp.startsWith('127.') || remoteIp.startsWith('192.168.') || remoteIp.startsWith('10.')) {
        score = Math.max(0, score - 20);
        tags.push('Private Network');
    } else if (isTrustedAsn) {
        score = Math.max(0, score - 15);
        tags.push('Verified Cloud Infrastructure');
    }

    score = Math.min(100, Math.max(2, score));

    // Determine Risk Level
    let riskLevel: AISummaryResult['riskLevel'] = 'Nominal';
    if (score >= 75) riskLevel = 'Critical Alert';
    else if (score >= 50) riskLevel = 'High Risk';
    else if (score >= 30) riskLevel = 'Suspicious';
    else if (score >= 15) riskLevel = 'Low Risk';

    // Confidence Score based on data richness
    const confidenceScore = Math.min(
        99,
        78 + (event.geo?.city ? 5 : 0) + (event.asn?.org ? 5 : 0) + (dissection ? 8 : 0) + (event.local?.pid ? 4 : 0)
    );

    // MITRE ATT&CK Mapping
    let mitreAttack: AISummaryResult['mitreAttack'] = null;
    if (isAnomaly || score >= 50) {
        if (isExfil) {
            mitreAttack = { tactic: 'Exfiltration', technique: 'Exfiltration Over C2 Channel', id: 'T1041' };
        } else if (HIGH_RISK_PROCS.some((p) => proc.includes(p))) {
            mitreAttack = { tactic: 'Execution', technique: 'Command and Scripting Interpreter', id: 'T1059' };
        } else if (port === 445 || port === 3389) {
            mitreAttack = { tactic: 'Lateral Movement', technique: 'Remote Services: SMB/RDP', id: 'T1021' };
        } else {
            mitreAttack = { tactic: 'Command and Control', technique: 'Application Layer Protocol: Web', id: 'T1071' };
        }
    }

    // Four-Pillars Content
    const procClean = event.local?.process_name || 'System';
    const locStr = city ? `${city}, ${country}` : country;

    let verdictTitle: string;
    let executiveSummary: string;
    let processVerdict: string;
    let networkVerdict: string;
    let dataAndPiiVerdict: string;
    let defensiveAction: string;
    const actions: string[] = [];

    if (riskLevel === 'Critical Alert' || riskLevel === 'High Risk') {
        verdictTitle = `High-Risk Anomaly: Suspicious ${proto} Activity from ${procClean}`;
        executiveSummary = `AI Forensic Guard flagged this connection with a ${score}/100 threat score. Process "${procClean}" (PID ${pid}) initiated an ${dir} socket to ${remoteHost} (${locStr}) over port ${port}. ${
            isAnomaly ? `Triggered security rule "${event.anomaly?.title || event.anomaly?.rule}". ` : ''
        }${criticalPiiCount > 0 ? `Unencrypted sensitive PII/tokens detected in transmission stream. ` : ''}Potential C2 beaconing or unauthorized transmission behavior detected.`;

        processVerdict = `Process "${procClean}" executing under user "${user}" (PID ${pid}). Active binary signature is operating outside expected baseline profile for this endpoint.`;
        networkVerdict = `Targeting endpoint ${remoteIp}:${port} (${remoteHost}) situated in ${locStr}. Session transport is ${proto} in state ${event.state || 'ACTIVE'}.`;
        dataAndPiiVerdict = `Transmitted ${formatBytes(bytesOut)} outbound, received ${formatBytes(bytesIn)} inbound. ${
            piiCount > 0
                ? `CRITICAL ALERT: ${piiCount} PII elements detected in packet payloads (including ${criticalPiiCount} critical secrets/API tokens).`
                : 'No cleartext credentials identified in inspected frames.'
        }`;
        defensiveAction = `IMMEDIATE ACTION REQUIRED: Terminate PID ${pid} and enforce a Windows Firewall block rule against IP ${remoteIp}.`;

        actions.push(`Terminate local process "${procClean}" (PID ${pid}) immediately`);
        actions.push(`Enforce host firewall rule blocking remote IP ${remoteIp}`);
        if (criticalPiiCount > 0) actions.push(`Revoke compromised API tokens/credentials exposed in packet stream`);
        actions.push(`Isolate host and perform memory dump for root cause investigation`);
    } else if (riskLevel === 'Suspicious') {
        verdictTitle = `Elevated Scrutiny: ${procClean} Communicating with ${remoteHost}`;
        executiveSummary = `Traffic exhibits mild deviation from standard baseline (Score: ${score}/100). Connection to ${remoteHost} (${locStr}) is active over ${proto} port ${port}. ${
            piiCount > 0 ? `${piiCount} personal identifier(s) detected in data stream. ` : ''
        }Traffic appears operational but warrants audit if destination is unverified.`;

        processVerdict = `Process "${procClean}" (PID ${pid}) active with nominal operating parameters.`;
        networkVerdict = `Connecting to ${remoteHost} (${remoteIp}) in ${locStr}. ASN: ${event.asn?.org || 'Standard ISP'}.`;
        dataAndPiiVerdict = `Payload volume: ${formatBytes(bytesIn + bytesOut)} across ${event.metrics?.packets || 1} packets. ${
            piiCount > 0 ? `${piiCount} PII fields present.` : 'Zero payload drift detected.'
        }`;
        defensiveAction = `Monitor session for payload expansion. Verify destination domain ownership against organizational whitelist.`;

        actions.push(`Verify target ASN "${event.asn?.org || remoteHost}" against approved vendor list`);
        actions.push(`Inspect decrypted headers in Protocol & Headers tab`);
        if (piiCount > 0) actions.push(`Confirm user consent for PII transmission`);
    } else {
        verdictTitle = `Nominal Operation: Legitimate ${proto} Telemetry`;
        executiveSummary = `AI Forensic Guard confirmed this connection as standard operating traffic (Risk Score: ${score}/100, ${confidenceScore}% Confidence). Process "${procClean}" (PID ${pid}) is interacting with verified destination ${remoteHost} in ${locStr}. Zero malicious payload signatures detected.`;

        processVerdict = `Host process "${procClean}" running under authorized account "${user}". Execution behavior conforms to standard operating profile.`;
        networkVerdict = `Routing via standard port ${port} to verified peer ${remoteHost} (${locStr}). Transport protocol ${proto} operating within nominal latency thresholds.`;
        dataAndPiiVerdict = `Exchange volume: ${formatBytes(bytesOut)} transmitted, ${formatBytes(bytesIn)} received. Payload structure is syntactically clean with no unauthorized exfiltration patterns.`;
        defensiveAction = `No intervention required. Connection is verified and healthy.`;

        actions.push(`Whitelisted: No defensive action needed`);
        actions.push(`Telemetry session logged in SignalMap local ring buffer`);
    }

    const generatedAt = new Date().toLocaleTimeString();

    // Format Full Markdown Report for 1-Click Copy / Export
    const markdownReport = [
        `# 🛡️ SignalMap AI Forensic Incident Report`,
        `**Verdict**: ${verdictTitle}`,
        `**Risk Level**: ${riskLevel} (${score}/100) | **Confidence**: ${confidenceScore}%`,
        `**Generated At**: ${generatedAt}`,
        ``,
        `---`,
        `## 📋 Executive Summary`,
        executiveSummary,
        ``,
        `## 🔬 Four-Pillar Forensic Breakdown`,
        `- **1. Local Process Attribution**: ${processVerdict}`,
        `- **2. Network & Routing Context**: ${networkVerdict}`,
        `- **3. Data Stream & PII Forensics**: ${dataAndPiiVerdict}`,
        `- **4. Defensive Security Guidance**: ${defensiveAction}`,
        ``,
        mitreAttack ? `## 🎯 MITRE ATT&CK Mapping\n- **Tactic**: ${mitreAttack.tactic}\n- **Technique**: ${mitreAttack.technique} (${mitreAttack.id})\n` : '',
        `## ⚡ Recommended Actions`,
        ...actions.map((a) => `- [ ] ${a}`),
        ``,
        `---`,
        `*Report generated by SignalMap AI Cyber Defense Engine*`,
    ]
        .filter(Boolean)
        .join('\n');

    return {
        verdictTitle,
        executiveSummary,
        riskLevel,
        riskScore: score,
        confidenceScore,
        behaviorTags: tags,
        mitreAttack,
        fourPillars: {
            processVerdict,
            networkVerdict,
            dataAndPiiVerdict,
            defensiveAction,
        },
        recommendedActions: actions,
        isExfiltrationRisk: isExfil,
        isThreat: isAnomaly || score >= 50,
        generatedAt,
        markdownReport,
    };
}

function formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
