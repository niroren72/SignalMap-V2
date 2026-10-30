import type { ConnectionEvent } from '@shared/types';

export interface PIIFinding {
    id: string;
    type: 'email' | 'credit_card' | 'ssn' | 'api_key' | 'jwt' | 'phone' | 'password';
    label: string;
    raw: string;
    masked: string;
    severity: 'critical' | 'high' | 'medium';
    location: string;
    description: string;
}

export interface HexDumpLine {
    offset: string;
    hexPart: string;
    asciiPart: string;
}

export interface ConnectionStreamChunk {
    id: string;
    timestamp: string;
    direction: 'outbound' | 'inbound';
    protocol: string;
    title: string;
    byteCount: number;
    rawText: string;
    hexDump: HexDumpLine[];
    piiFindings: PIIFinding[];
    headers?: Record<string, string>;
    structuredData?: Record<string, any>;
}

export interface StreamDissectionResult {
    chunks: ConnectionStreamChunk[];
    totalBytesOut: number;
    totalBytesIn: number;
    allPii: PIIFinding[];
    protocolMeta: {
        protocol: string;
        transport: string;
        sni?: string;
        alpn?: string;
        tlsVersion?: string;
        cipherSuite?: string;
        httpMethod?: string;
        httpPath?: string;
        httpStatus?: number;
        contentType?: string;
        dnsQueryType?: string;
        dnsQuestion?: string;
        dnsAnswers?: string[];
        salesforceOperation?: string;
        salesforceOrgId?: string;
        salesforceSObject?: string;
        rawHeaders?: Record<string, string>;
    };
}

// ── PII Scanner Regexes ──────────────────────────────────────────────────
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CC_REGEX = /\b(?:\d{4}[ -]?){3}\d{4}\b/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const BEARER_REGEX = /\bBearer\s+([A-Za-z0-9\-._~+/]+=*)\b/g;
const JWT_REGEX = /\b(eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)\b/g;
const API_KEY_REGEX = /\b((?:sk_live_|ghp_|AIza|AKIA)[0-9A-Za-z_-]{16,40})\b/g;
const SECRET_KV_REGEX = /(?:"password"|"client_secret"|"token"|"secret"|"apiKey")\s*[:=]\s*["']?([^"',\s}]+)["']?/gi;

export function scanForPII(text: string, locationPrefix = 'payload'): PIIFinding[] {
    const findings: PIIFinding[] = [];
    const seen = new Set<string>();

    const addFinding = (finding: Omit<PIIFinding, 'id'>) => {
        const key = `${finding.type}:${finding.raw}`;
        if (!seen.has(key)) {
            seen.add(key);
            findings.push({
                ...finding,
                id: `pii-${findings.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
            });
        }
    };

    // 1. Emails
    let match: RegExpExecArray | null;
    while ((match = EMAIL_REGEX.exec(text)) !== null) {
        const raw = match[0];
        const atIdx = raw.indexOf('@');
        const user = raw.slice(0, atIdx);
        const domain = raw.slice(atIdx + 1);
        const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : '***';
        const masked = `${maskedUser}@${domain}`;
        addFinding({
            type: 'email',
            label: 'Email Address',
            raw,
            masked,
            severity: 'high',
            location: locationPrefix,
            description: 'Customer or employee email identifier detected in payload stream.',
        });
    }

    // 2. Credit Cards / PAN
    while ((match = CC_REGEX.exec(text)) !== null) {
        const raw = match[0];
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 13 && digits.length <= 19) {
            const masked = `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
            addFinding({
                type: 'credit_card',
                label: 'Payment Card (PAN)',
                raw,
                masked,
                severity: 'critical',
                location: locationPrefix,
                description: 'Potential credit or debit card primary account number.',
            });
        }
    }

    // 3. Social Security Numbers (SSN)
    while ((match = SSN_REGEX.exec(text)) !== null) {
        const raw = match[0];
        const masked = `***-**-${raw.slice(-4)}`;
        addFinding({
            type: 'ssn',
            label: 'Social Security Number',
            raw,
            masked,
            severity: 'critical',
            location: locationPrefix,
            description: 'US Social Security Number format detected in transmission.',
        });
    }

    // 4. API Keys & Live Tokens
    while ((match = API_KEY_REGEX.exec(text)) !== null) {
        const raw = match[0];
        const prefix = raw.slice(0, 8);
        const masked = `${prefix}****************${raw.slice(-4)}`;
        addFinding({
            type: 'api_key',
            label: 'API Key / Secret',
            raw,
            masked,
            severity: 'critical',
            location: locationPrefix,
            description: 'High-privilege cloud or API authorization token.',
        });
    }

    // 5. JWT Tokens
    while ((match = JWT_REGEX.exec(text)) !== null) {
        const raw = match[0];
        if (raw.length > 20) {
            const masked = `${raw.slice(0, 10)}...[REDACTED_JWT]...${raw.slice(-6)}`;
            addFinding({
                type: 'jwt',
                label: 'JSON Web Token (JWT)',
                raw,
                masked,
                severity: 'high',
                location: locationPrefix,
                description: 'Signed OAuth / OIDC JSON Web Token containing claims.',
            });
        }
    }

    // 6. Bearer Tokens
    while ((match = BEARER_REGEX.exec(text)) !== null) {
        const raw = match[0];
        const tokenVal = match[1];
        if (tokenVal.length > 10) {
            const masked = `Bearer ${tokenVal.slice(0, 4)}****[REDACTED]****${tokenVal.slice(-4)}`;
            addFinding({
                type: 'api_key',
                label: 'Bearer Authorization Header',
                raw,
                masked,
                severity: 'critical',
                location: locationPrefix,
                description: 'Bearer authorization credentials passed in headers/stream.',
            });
        }
    }

    // 7. Password / Secret Key-Values
    while ((match = SECRET_KV_REGEX.exec(text)) !== null) {
        const raw = match[0];
        const val = match[1];
        if (val && val.length > 1 && !val.includes('*')) {
            const masked = raw.replace(val, '********');
            addFinding({
                type: 'password',
                label: 'Password / Credential Value',
                raw,
                masked,
                severity: 'critical',
                location: locationPrefix,
                description: 'Plaintext secret credential or password key-value assignment.',
            });
        }
    }

    // 8. Phone Numbers
    while ((match = PHONE_REGEX.exec(text)) !== null) {
        const raw = match[0].trim();
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 13) {
            const masked = `(***) ***-${digits.slice(-4)}`;
            addFinding({
                type: 'phone',
                label: 'Telephone Number',
                raw,
                masked,
                severity: 'medium',
                location: locationPrefix,
                description: 'Direct telephone number identifying host/user.',
            });
        }
    }

    return findings;
}

export function maskTextWithPII(text: string, findings: PIIFinding[]): string {
    let result = text;
    for (const f of findings) {
        if (f.raw && f.masked) {
            result = result.split(f.raw).join(f.masked);
        }
    }
    return result;
}

// ── Hex Dump Formatter ───────────────────────────────────────────────────
export function generateHexDump(text: string, startOffset = 0): HexDumpLine[] {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const lines: HexDumpLine[] = [];
    const chunkSize = 16;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        const offsetNum = startOffset + i;
        const offset = offsetNum.toString(16).padStart(8, '0');

        const hexParts: string[] = [];
        let asciiPart = '';

        for (let j = 0; j < chunkSize; j++) {
            if (j < chunk.length) {
                const b = chunk[j];
                hexParts.push(b.toString(16).padStart(2, '0'));
                // printable ascii range (32 to 126)
                if (b >= 32 && b <= 126) {
                    asciiPart += String.fromCharCode(b);
                } else {
                    asciiPart += '.';
                }
            } else {
                hexParts.push('  ');
            }
        }

        // Split into two 8-byte columns for classic hex format
        const col1 = hexParts.slice(0, 8).join(' ');
        const col2 = hexParts.slice(8, 16).join(' ');
        const hexPart = `${col1}  ${col2}`;

        lines.push({ offset, hexPart, asciiPart });
    }

    if (lines.length === 0) {
        lines.push({
            offset: '00000000',
            hexPart: '00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00',
            asciiPart: '................',
        });
    }

    return lines;
}

// ── Dissect Connection Stream ────────────────────────────────────────────
export function dissectConnectionStream(event: ConnectionEvent): StreamDissectionResult {
    const proto = (event.protocol || 'TCP').toUpperCase();
    const remoteHost =
        event.remote?.hostname ||
        event.asn?.org ||
        (event.remote?.ip === '127.0.0.1' ? 'localhost' : event.remote?.ip) ||
        'api.gateway.net';
    const remoteIp = event.remote?.ip || '127.0.0.1';
    const remotePort = event.remote?.port || 443;
    const localPort = event.local?.port || 54120;
    const proc = event.local?.process_name || 'System';
    const user = (event.local as any)?.user || 'admin@enterprise.local';
    const bytesOut = event.metrics?.bytes_out || 1480;
    const bytesIn = event.metrics?.bytes_in || 4260;
    const sourceCollector = event.source_collector || 'mock';
    const isSalesforce =
        sourceCollector.startsWith('salesforce') ||
        Boolean(event.service?.name && event.service.name.toLowerCase().includes('salesforce'));

    const chunks: ConnectionStreamChunk[] = [];
    const protocolMeta: StreamDissectionResult['protocolMeta'] = {
        protocol: proto,
        transport: proto === 'UDP' || proto === 'DNS' || proto === 'QUIC' || proto === 'NTP' ? 'UDP/IP' : 'TCP/IP',
    };

    if (isSalesforce) {
        // Salesforce Cloud Security Telemetry Stream
        const sfOrgId = '00D5e000001aBCdEAM';
        const isLogin = sourceCollector.includes('login') || sourceCollector.includes('session');
        const soqlQuery = isLogin
            ? `SELECT Id, UserId, LoginTime, SourceIp, Status, Application FROM LoginHistory WHERE SourceIp='${remoteIp}' ORDER BY LoginTime DESC LIMIT 5`
            : `SELECT Id, Username, Action, Display, Section, CreatedDate FROM SetupAuditTrail ORDER BY CreatedDate DESC LIMIT 10`;

        protocolMeta.salesforceOperation = isLogin ? 'LoginHistory Inspection' : 'SetupAuditTrail Stream';
        protocolMeta.salesforceOrgId = sfOrgId;
        protocolMeta.salesforceSObject = isLogin ? 'LoginHistory' : 'SetupAuditTrail';
        protocolMeta.sni = remoteHost;
        protocolMeta.tlsVersion = 'TLS 1.3';
        protocolMeta.cipherSuite = 'TLS_AES_256_GCM_SHA384';
        protocolMeta.httpMethod = 'POST';
        protocolMeta.httpPath = '/services/data/v60.0/query';
        protocolMeta.httpStatus = 200;
        protocolMeta.contentType = 'application/json; charset=UTF-8';

        const outText = [
            `POST /services/data/v60.0/query?q=${encodeURIComponent(soqlQuery)} HTTP/1.1`,
            `Host: ${remoteHost}`,
            `User-Agent: Salesforce-CLI/2.35.4 (Windows_NT; ${proc})`,
            `Authorization: Bearer 00D5e000001aBCd!AR8AQJ_exampleToken_${Math.random().toString(36).slice(2, 10)}`,
            `X-SFDC-Session: sess_${Math.random().toString(36).slice(2, 12)}`,
            `Sforce-Call-Options: client=SignalMap/2.4.0`,
            `Accept: application/json`,
            `Content-Type: application/json; charset=UTF-8`,
            ``,
            JSON.stringify(
                {
                    query: soqlQuery,
                    context: {
                        user_email: user.includes('@') ? user : `${user.toLowerCase()}@acme-corp.com`,
                        org_id: sfOrgId,
                        client_ip: event.local?.host || '192.168.1.105',
                        api_key: 'sk_live_sf992817293810293847',
                    },
                },
                null,
                2
            ),
        ].join('\r\n');

        const inText = [
            `HTTP/1.1 200 OK`,
            `Date: ${new Date().toUTCString()}`,
            `Content-Type: application/json; charset=UTF-8`,
            `Transfer-Encoding: chunked`,
            `Connection: keep-alive`,
            `Sforce-Limit-Info: api-usage=348/150000`,
            `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
            ``,
            JSON.stringify(
                {
                    totalSize: 1,
                    done: true,
                    records: [
                        {
                            attributes: {
                                type: isLogin ? 'LoginHistory' : 'SetupAuditTrail',
                                url: `/services/data/v60.0/sobjects/${isLogin ? 'LoginHistory' : 'SetupAuditTrail'}/0055e000008xYz`,
                            },
                            Id: '0055e000008xYz',
                            UserId: '0055e000008xYz001',
                            UserEmail: user.includes('@') ? user : `${user.toLowerCase()}@salesforce-tenant.com`,
                            SourceIp: remoteIp,
                            LoginTime: new Date().toISOString(),
                            Status: event.anomaly?.is_anomaly ? 'Failed: Invalid Password' : 'Success',
                            Application: 'Browser / Chrome Windows',
                            SessionSecurityLevel: 'HIGH_ASSURANCE',
                        },
                    ],
                },
                null,
                2
            ),
        ].join('\r\n');

        const piiOut = scanForPII(outText, 'Outbound Request');
        const piiIn = scanForPII(inText, 'Inbound Response');

        chunks.push({
            id: 'chk-1-out',
            timestamp: new Date().toLocaleTimeString(),
            direction: 'outbound',
            protocol: 'HTTPS/SOQL',
            title: `REST Query (${isLogin ? 'LoginHistory' : 'AuditTrail'})`,
            byteCount: encoderLength(outText),
            rawText: outText,
            hexDump: generateHexDump(outText),
            piiFindings: piiOut,
            headers: {
                Host: remoteHost,
                'User-Agent': `Salesforce-CLI/2.35.4 (${proc})`,
                Authorization: 'Bearer 00D5e000001aBCd!...',
                'X-SFDC-Session': 'sess_active',
                'Content-Type': 'application/json',
            },
        });

        chunks.push({
            id: 'chk-2-in',
            timestamp: new Date().toLocaleTimeString(),
            direction: 'inbound',
            protocol: 'HTTPS/JSON',
            title: `HTTP 200 OK — SObject Response (${sfOrgId})`,
            byteCount: encoderLength(inText),
            rawText: inText,
            hexDump: generateHexDump(inText),
            piiFindings: piiIn,
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Sforce-Limit-Info': 'api-usage=348/150000',
                Connection: 'keep-alive',
            },
        });
    } else if (proto === 'DNS' || event.source_collector === 'windows_dns') {
        // DNS Wire Dissection
        protocolMeta.dnsQueryType = 'A (Standard IPv4)';
        protocolMeta.dnsQuestion = remoteHost;
        protocolMeta.dnsAnswers = [remoteIp, '104.18.22.18', '104.18.23.18'];

        const outText = [
            `DNS Query: ID=0x4b12`,
            `QR=0 (Standard Query), Opcode=0 (QUERY), RD=1 (Recursion Desired)`,
            `Question Count: 1, Answer Count: 0, Authority Count: 0`,
            `Questions:`,
            `  ${remoteHost}: type A, class IN`,
            ``,
            `Client Socket: 127.0.0.1:${localPort} -> ${remoteIp}:53 (UDP)`,
        ].join('\r\n');

        const inText = [
            `DNS Response: ID=0x4b12`,
            `QR=1 (Response), Opcode=0, AA=0, TC=0, RD=1, RA=1`,
            `RCODE=0 (No Error)`,
            `Answers:`,
            `  ${remoteHost}  TTL 300  IN  A  ${remoteIp}`,
            `  ${remoteHost}  TTL 300  IN  A  104.18.22.18`,
            `Authoritative Nameservers:`,
            `  ns1.cloudflare.com  TTL 86400  IN  A  173.245.58.51`,
        ].join('\r\n');

        chunks.push({
            id: 'dns-out',
            timestamp: new Date().toLocaleTimeString(),
            direction: 'outbound',
            protocol: 'DNS/UDP',
            title: `Standard Query A ${remoteHost}`,
            byteCount: encoderLength(outText),
            rawText: outText,
            hexDump: generateHexDump(outText),
            piiFindings: scanForPII(outText, 'DNS Query'),
        });

        chunks.push({
            id: 'dns-in',
            timestamp: new Date().toLocaleTimeString(),
            direction: 'inbound',
            protocol: 'DNS/UDP',
            title: `Standard Query Response A: ${remoteIp}`,
            byteCount: encoderLength(inText),
            rawText: inText,
            hexDump: generateHexDump(inText),
            piiFindings: scanForPII(inText, 'DNS Response'),
        });
    } else if (proto === 'HTTP' || proto === 'HTTPS' || remotePort === 443 || remotePort === 80) {
        // HTTP / TLS Dissection
        const isHttps = proto === 'HTTPS' || remotePort === 443;
        const method = event.http?.method || (event.direction === 'inbound' ? 'POST' : 'GET');
        const urlPath = event.http?.url_path || '/api/v1/telemetry/heartbeat';
        const statusCode = event.http?.status_code || 200;

        protocolMeta.sni = remoteHost;
        protocolMeta.alpn = 'h2, http/1.1';
        protocolMeta.tlsVersion = isHttps ? 'TLS 1.3' : 'N/A (Cleartext HTTP)';
        protocolMeta.cipherSuite = isHttps ? 'TLS_AES_128_GCM_SHA256 (0x1301)' : 'N/A';
        protocolMeta.httpMethod = method;
        protocolMeta.httpPath = urlPath;
        protocolMeta.httpStatus = statusCode;
        protocolMeta.contentType = 'application/json';

        const outText = [
            `${method} ${urlPath} HTTP/1.1`,
            `Host: ${remoteHost}`,
            `User-Agent: ${proc}/1.0 (Windows NT 10.0; Win64; x64) SignalMap-Agent`,
            `Accept: application/json, text/plain, */*`,
            `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`,
            `X-Request-ID: req-${Math.random().toString(36).slice(2, 10)}`,
            `X-Originating-Process: ${proc} (PID: ${event.local?.pid || 8420})`,
            `Connection: keep-alive`,
            ``,
            method === 'POST'
                ? JSON.stringify(
                      {
                          client_version: '2.4.1',
                          contact_email: user.includes('@') ? user : `${user.toLowerCase()}@enterprise-domain.com`,
                          session_token: 'sk_live_prod_99482103859182349182',
                          metrics: {
                              cpu_usage: 14.2,
                              threads: 24,
                              bytes_transferred: bytesOut,
                          },
                      },
                      null,
                      2
                  )
                : '',
        ]
            .filter(Boolean)
            .join('\r\n');

        const inText = [
            `HTTP/1.1 ${statusCode} ${statusCode === 200 ? 'OK' : 'Accepted'}`,
            `Date: ${new Date().toUTCString()}`,
            `Content-Type: application/json; charset=utf-8`,
            `Content-Length: 268`,
            `Server: cloudflare`,
            `CF-RAY: 832b49c12a0f8-TLV`,
            `Strict-Transport-Security: max-age=15552000; includeSubDomains`,
            ``,
            JSON.stringify(
                {
                    status: 'success',
                    ack_id: `ack-${Math.random().toString(36).slice(2, 9)}`,
                    cluster: 'edge-eu-central',
                    server_time: new Date().toISOString(),
                    assigned_worker: 'srv-tlv-04',
                },
                null,
                2
            ),
        ].join('\r\n');

        chunks.push({
            id: 'http-out',
            timestamp: new Date().toLocaleTimeString(),
            direction: 'outbound',
            protocol: isHttps ? 'TLS 1.3 / HTTPS' : 'HTTP/1.1',
            title: `${method} ${urlPath}`,
            byteCount: encoderLength(outText),
            rawText: outText,
            hexDump: generateHexDump(outText),
            piiFindings: scanForPII(outText, 'Request Payload'),
            headers: {
                Host: remoteHost,
                'User-Agent': `${proc} (Windows NT 10.0)`,
                Authorization: 'Bearer eyJhbGciOi...',
                Accept: 'application/json',
            },
        });

        chunks.push({
            id: 'http-in',
            timestamp: new Date().toLocaleTimeString(),
            direction: 'inbound',
            protocol: isHttps ? 'TLS 1.3 / HTTPS' : 'HTTP/1.1',
            title: `HTTP ${statusCode} Response`,
            byteCount: encoderLength(inText),
            rawText: inText,
            hexDump: generateHexDump(inText),
            piiFindings: scanForPII(inText, 'Response Body'),
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Server: 'cloudflare',
                'CF-RAY': '832b49c12a0f8-TLV',
            },
        });
    } else {
        // Generic TCP / UDP / Transport Stream
        protocolMeta.sni = remoteHost;

        const outText = [
            `[${proto} Socket Transmit Frame]`,
            `Local Socket: ${event.local?.host || '0.0.0.0'}:${localPort}`,
            `Remote Target: ${remoteIp}:${remotePort} (${remoteHost})`,
            `Protocol State: ESTABLISHED (${event.state || 'ACTIVE'})`,
            `Payload Bytes: ${bytesOut} octets`,
            `Process: ${proc} (PID: ${event.local?.pid || 'N/A'})`,
            ``,
            `--- Raw Data Buffer Segment ---`,
            `0x0000  16 03 03 01 00 01 00 00  fc 03 03 62 4a 8f 12 90`,
            `0x0010  client_session_auth=sk_live_token_${Math.random().toString(36).slice(2, 12)}`,
            `0x0020  user_identity=${user.includes('@') ? user : `${user.toLowerCase()}@workspace.internal`}`,
        ].join('\r\n');

        const inText = [
            `[${proto} Socket Receive Frame]`,
            `Remote Origin: ${remoteIp}:${remotePort}`,
            `Local Receiver: ${event.local?.host || '0.0.0.0'}:${localPort}`,
            `Payload Bytes: ${bytesIn} octets`,
            ``,
            `--- Raw Stream Acknowledgment ---`,
            `0x0000  16 03 03 00 7a 02 00 00  76 03 03 a1 b2 c3 d4 e5`,
            `0x0010  ACK seq=${Math.floor(Math.random() * 900000)} win=65535`,
            `0x0020  status=OK server_id=${remoteHost}`,
        ].join('\r\n');

        chunks.push({
            id: 'gen-out',
            timestamp: new Date().toLocaleTimeString(),
            direction: 'outbound',
            protocol: proto,
            title: `${proto} Transmitted Stream (${bytesOut} B)`,
            byteCount: encoderLength(outText),
            rawText: outText,
            hexDump: generateHexDump(outText),
            piiFindings: scanForPII(outText, `${proto} Transmit`),
        });

        chunks.push({
            id: 'gen-in',
            timestamp: new Date().toLocaleTimeString(),
            direction: 'inbound',
            protocol: proto,
            title: `${proto} Received Stream (${bytesIn} B)`,
            byteCount: encoderLength(inText),
            rawText: inText,
            hexDump: generateHexDump(inText),
            piiFindings: scanForPII(inText, `${proto} Receive`),
        });
    }

    const allPii = chunks.flatMap((c) => c.piiFindings);

    return {
        chunks,
        totalBytesOut: bytesOut,
        totalBytesIn: bytesIn,
        allPii,
        protocolMeta,
    };
}

function encoderLength(str: string): number {
    return new TextEncoder().encode(str).length;
}

