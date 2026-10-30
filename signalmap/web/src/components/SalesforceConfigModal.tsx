import { useState, useEffect, useCallback } from 'react';
import {
    Cloud,
    X,
    CheckCircle2,
    AlertTriangle,
    RefreshCw,
    Key,
    Shield,
    Terminal,
    Lock,
    Play,
    Square,
    Sparkles,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { useConnectionStore } from '../stores/connectionStore';
import type { ConnectionEvent } from '@shared/types';

export interface SalesforceStreamStatus {
    enabled: boolean;
    status: string;
    events_ingested: number;
    last_message?: string | null;
}

export interface SalesforceConnectorStatus {
    configured: boolean;
    connected: boolean;
    polling: boolean;
    auth_mode: string;
    login_url: string;
    instance_url: string;
    tenant_hostname?: string | null;
    tenant_ip?: string | null;
    org_id?: string | null;
    org_name?: string | null;
    org_edition?: string | null;
    is_sandbox?: boolean;
    username?: string | null;
    cli_alias?: string;
    has_client_id?: boolean;
    has_client_secret?: boolean;
    has_password?: boolean;
    has_security_token?: boolean;
    has_access_token?: boolean;
    poll_interval: number;
    lookback_days: number;
    last_sync?: string | null;
    last_error?: string | null;
    total_ingested: number;
    threats_detected: number;
    streams: Record<string, SalesforceStreamStatus>;
}

interface CliOrg {
    alias: string;
    username: string;
    orgId: string;
    instanceUrl: string;
    connectedStatus: string;
    isDefault: boolean;
}

interface SalesforceConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStatusUpdate?: (status: SalesforceConnectorStatus) => void;
}

export async function sfApiFetch(path: string, init?: RequestInit): Promise<Response> {
    const candidates = import.meta.env.DEV
        ? [`http://127.0.0.1:8765${path}`, `http://localhost:8765${path}`, path]
        : [path, `http://127.0.0.1:8765${path}`];

    let lastErr: unknown = null;
    for (const url of candidates) {
        try {
            return await fetch(url, init);
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('SignalMap backend (:8765) is unreachable');
}

export function SalesforceConfigModal({
    isOpen,
    onClose,
    onStatusUpdate,
}: SalesforceConfigModalProps) {
    const setEvents = useConnectionStore((s) => s.setEvents);
    const setActiveModule = useConnectionStore((s) => s.setActiveModule);

    const [status, setStatus] = useState<SalesforceConnectorStatus | null>(null);
    const [authMode, setAuthMode] = useState<'password' | 'access_token' | 'client_credentials' | 'sf_cli'>('password');
    const [loginUrl, setLoginUrl] = useState('https://login.salesforce.com');
    const [instanceUrl, setInstanceUrl] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [securityToken, setSecurityToken] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [cliAlias, setCliAlias] = useState('');
    const [showConnectedAppFields, setShowConnectedAppFields] = useState(false);

    const [pollInterval, setPollInterval] = useState(30);
    const [lookbackDays, setLookbackDays] = useState(7);
    const [streams, setStreams] = useState({
        login_history: true,
        auth_session: true,
        setup_audit: true,
        event_monitoring: true,
    });

    const [cliOrgs, setCliOrgs] = useState<CliOrg[]>([]);
    const [loadingCli, setLoadingCli] = useState(false);
    const [testing, setTesting] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [browserAuthWaiting, setBrowserAuthWaiting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await sfApiFetch('/api/connectors/salesforce/status');
            if (!res.ok) return;
            const data: SalesforceConnectorStatus = await res.json();
            setStatus(data);
            onStatusUpdate?.(data);

            if (data.auth_mode) {
                setAuthMode(data.auth_mode as any);
            }
            if (data.login_url) setLoginUrl(data.login_url);
            if (data.instance_url) setInstanceUrl(data.instance_url);
            if (data.username) setUsername(data.username);
            if (data.cli_alias) setCliAlias(data.cli_alias);
            if (data.poll_interval) setPollInterval(data.poll_interval);
            if (data.lookback_days) setLookbackDays(data.lookback_days);
            if (data.streams) {
                setStreams({
                    login_history: data.streams.login_history?.enabled ?? true,
                    auth_session: data.streams.auth_session?.enabled ?? true,
                    setup_audit: data.streams.setup_audit?.enabled ?? true,
                    event_monitoring: data.streams.event_monitoring?.enabled ?? true,
                });
            }
        } catch (err) {
            console.error('Failed to fetch Salesforce connector status:', err);
        }
    }, [onStatusUpdate]);

    useEffect(() => {
        if (isOpen) {
            setFeedback(null);
            fetchStatus();
        }
    }, [isOpen, fetchStatus]);

    const refreshGlobalEvents = async () => {
        try {
            const res = await sfApiFetch('/api/events?limit=1000');
            const data = await res.json();
            if (data.events) {
                setEvents(data.events as ConnectionEvent[]);
            }
        } catch {
            // ignore
        }
    };

    const handleScanCliOrgs = async () => {
        setLoadingCli(true);
        setFeedback(null);
        try {
            const res = await sfApiFetch('/api/connectors/salesforce/cli-orgs');
            const data = await res.json();
            setCliOrgs(data.orgs || []);
            if ((data.orgs || []).length === 0) {
                setFeedback({
                    type: 'info',
                    message: 'No local Salesforce CLI (`sf` / `sfdx`) authenticated orgs detected. Use Username & Password, Access Token, or OAuth 2.0 instead.',
                });
            } else {
                const defaultOrg = data.orgs.find((o: CliOrg) => o.isDefault) || data.orgs[0];
                if (defaultOrg && !cliAlias) {
                    setCliAlias(defaultOrg.alias || defaultOrg.username);
                }
            }
        } catch {
            setFeedback({ type: 'error', message: 'Failed to scan local Salesforce CLI orgs.' });
        } finally {
            setLoadingCli(false);
        }
    };

    const buildPayload = () => ({
        auth_mode: authMode,
        login_url: loginUrl,
        instance_url: instanceUrl,
        access_token: accessToken,
        client_id: clientId,
        client_secret: clientSecret,
        username,
        password,
        security_token: securityToken,
        cli_alias: cliAlias,
        poll_interval: pollInterval,
        lookback_days: lookbackDays,
        streams,
    });

    const handleBrowserOAuthLogin = async () => {
        // Open popup SYNCHRONOUSLY on click so the browser popup blocker never suppresses it
        const popup = window.open(
            'about:blank',
            'salesforce_oauth_login',
            'width=600,height=720,menubar=no,toolbar=no,location=yes,status=no'
        );
        if (popup) {
            try {
                popup.document.write(
                    '<html><body style="background:#0b101b;color:#38bdf8;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div>Redirecting to Salesforce Login...</div></body></html>'
                );
            } catch {
                // ignore cross-origin write error if any
            }
        }

        setBrowserAuthWaiting(true);
        setFeedback({
            type: 'info',
            message: 'Opening Salesforce login window... Sign in with your normal Username & Password in the popup.',
        });

        try {
            const res = await sfApiFetch('/api/connectors/salesforce/oauth/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload()),
            });
            const data = await res.json();
            if (!res.ok || !data.authorize_url) {
                if (popup) popup.close();
                throw new Error(data.detail || 'Could not start Salesforce browser OAuth flow');
            }

            if (popup) {
                popup.location.href = data.authorize_url;
            } else {
                window.open(data.authorize_url, '_blank');
            }

            // Poll status until connected or popup closed
            const pollTimer = setInterval(async () => {
                try {
                    const stRes = await sfApiFetch('/api/connectors/salesforce/status');
                    if (stRes.ok) {
                        const stData: SalesforceConnectorStatus = await stRes.json();
                        if (stData.connected) {
                            clearInterval(pollTimer);
                            setBrowserAuthWaiting(false);
                            setStatus(stData);
                            onStatusUpdate?.(stData);
                            await refreshGlobalEvents();
                            setActiveModule('salesforce');
                            setFeedback({
                                type: 'success',
                                message: `Connected to ${stData.org_name || 'Salesforce Tenant'} (${stData.instance_url}) via Browser OAuth!`,
                            });
                            return;
                        }
                        if (stData.last_error && stData.last_error.includes('OAuth')) {
                            clearInterval(pollTimer);
                            setBrowserAuthWaiting(false);
                            setFeedback({
                                type: 'error',
                                message: stData.last_error,
                            });
                            return;
                        }
                    }
                    if (popup && popup.closed) {
                        clearInterval(pollTimer);
                        setBrowserAuthWaiting(false);
                        await fetchStatus();
                    }
                } catch {
                    // ignore poll error
                }
            }, 1500);
        } catch (err: any) {
            if (popup && !popup.closed) popup.close();
            setBrowserAuthWaiting(false);
            setFeedback({
                type: 'error',
                message: err.message || 'Failed to launch Salesforce browser login',
            });
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setFeedback(null);
        try {
            const res = await sfApiFetch('/api/connectors/salesforce/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload()),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Authentication failed');
            }
            setFeedback({
                type: 'success',
                message: `${data.message} · Host: ${data.org?.tenant_hostname} (${data.org?.tenant_ip})`,
            });
            await fetchStatus();
        } catch (err: any) {
            setFeedback({
                type: 'error',
                message: err.message || 'Failed to verify Salesforce connection',
            });
        } finally {
            setTesting(false);
        }
    };

    const handleConnectAndSync = async () => {
        setConnecting(true);
        setFeedback(null);
        try {
            const res = await sfApiFetch('/api/connectors/salesforce/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload()),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Connection failed');
            }
            if (data.connector) {
                setStatus(data.connector);
                onStatusUpdate?.(data.connector);
            }
            await refreshGlobalEvents();
            setActiveModule('salesforce');
            setFeedback({
                type: 'success',
                message: data.message || 'Connected and synced Salesforce tenant events!',
            });
        } catch (err: any) {
            setFeedback({
                type: 'error',
                message: err.message || 'Failed to connect to Salesforce tenant',
            });
        } finally {
            setConnecting(false);
        }
    };

    const handleSyncNow = async () => {
        setSyncing(true);
        setFeedback(null);
        try {
            const res = await sfApiFetch('/api/connectors/salesforce/sync', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Sync failed');
            }
            if (data.connector) {
                setStatus(data.connector);
                onStatusUpdate?.(data.connector);
            }
            await refreshGlobalEvents();
            setFeedback({
                type: 'success',
                message: `Synced ${data.sync?.fetched_count ?? 0} records (${data.sync?.new_events_dispatched ?? 0} new events added to stream).`,
            });
        } catch (err: any) {
            setFeedback({
                type: 'error',
                message: err.message || 'Failed to sync Salesforce telemetry',
            });
        } finally {
            setSyncing(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            const res = await sfApiFetch('/api/connectors/salesforce/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clear_credentials: false }),
            });
            const data = await res.json();
            if (data.connector) {
                setStatus(data.connector);
                onStatusUpdate?.(data.connector);
            }
            setFeedback({ type: 'info', message: 'Salesforce live polling stopped.' });
        } catch {
            // ignore
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
            <div
                className="w-full max-w-2xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
                style={{
                    backgroundColor: '#0b101b',
                    borderColor: 'rgba(56, 189, 248, 0.28)',
                    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75), 0 0 40px rgba(14, 165, 233, 0.12)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-gradient-to-r from-sky-950/40 via-slate-900/60 to-slate-900/40">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400">
                            <Cloud className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-bold font-mono tracking-wide text-white uppercase">
                                    Salesforce Cloud Security Connector
                                </h2>
                                <span
                                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-semibold ${
                                        status?.connected
                                            ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}
                                >
                                    {status?.connected ? (status.polling ? '● LIVE POLLING' : '● CONNECTED') : 'STANDBY'}
                                </span>
                            </div>
                            <p className="text-[11px] font-mono text-slate-400">
                                Multi-Stream SOQL &amp; Shield Event Monitoring · GeoIP Client Attribution
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Connected Org Summary Banner */}
                    {status?.connected && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    <span className="text-xs font-bold font-mono text-emerald-200">
                                        {status.org_name || 'Salesforce Tenant'}
                                    </span>
                                    {status.org_edition && (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                                            {status.org_edition}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[11px] font-mono text-slate-300">
                                    {status.instance_url} · {status.username || 'Authenticated'} ·{' '}
                                    <span className="text-sky-300">{status.total_ingested} events</span> (
                                    <span className="text-rose-300">{status.threats_detected} alerts</span>)
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSyncNow}
                                    disabled={syncing}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold border border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 flex items-center gap-1.5 transition disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                                    <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
                                </button>
                                {status.polling && (
                                    <button
                                        onClick={handleDisconnect}
                                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono border border-rose-500/30 bg-rose-950/30 text-rose-300 hover:bg-rose-900/40 flex items-center gap-1 transition"
                                    >
                                        <Square className="w-3 h-3" />
                                        <span>Pause</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Auth Mode Selector Tabs */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                            1. Authentication Method
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                                { id: 'password' as const, label: 'User & Password', sub: 'Zero-Setup SOAP / OAuth', icon: Lock },
                                { id: 'access_token' as const, label: 'Access Token', sub: 'Instance URL + Token', icon: Key },
                                { id: 'client_credentials' as const, label: 'Client Creds', sub: 'OAuth 2.0 App', icon: Shield },
                                { id: 'sf_cli' as const, label: 'Salesforce CLI', sub: 'Local `sf` Session', icon: Terminal },
                            ].map((tab) => {
                                const Icon = tab.icon;
                                const active = authMode === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setAuthMode(tab.id)}
                                        className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-1 ${
                                            active
                                                ? 'bg-sky-500/15 border-sky-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                                                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
                                            <Icon className={`w-3.5 h-3.5 ${active ? 'text-sky-400' : 'text-slate-500'}`} />
                                            <span>{tab.label}</span>
                                        </div>
                                        <span className="text-[10px] font-mono opacity-75">{tab.sub}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Dynamic Credentials Form */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3.5">
                        {authMode === 'password' && (
                            <>
                                {/* 1-Click Browser Login Callout (Bypasses Security Token & MFA API blocks) */}
                                <div className="p-3 rounded-xl border border-sky-500/35 bg-gradient-to-r from-sky-950/50 via-blue-950/35 to-slate-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <div className="text-xs font-mono font-bold text-sky-200 flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                                            Recommended: 1-Click Browser Sign-In (Simple User &amp; Password)
                                        </div>
                                        <p className="text-[10.5px] font-mono text-slate-300 leading-snug">
                                            Log in via Salesforce&apos;s standard login page using just your Username &amp; Password — <strong>no Security Token</strong> and <strong>no Connected App</strong> required.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleBrowserOAuthLogin}
                                        disabled={browserAuthWaiting}
                                        className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 shrink-0 shadow-md shadow-sky-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <Cloud className="w-3.5 h-3.5" />
                                        <span>{browserAuthWaiting ? 'Waiting for Browser...' : 'Sign In with Browser'}</span>
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-slate-500">
                                    <div className="h-px flex-1 bg-slate-800" />
                                    <span>Or Direct API Username &amp; Password</span>
                                    <div className="h-px flex-1 bg-slate-800" />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                            Login Environment / My Domain URL
                                        </label>
                                        <input
                                            type="text"
                                            value={loginUrl}
                                            onChange={(e) => setLoginUrl(e.target.value)}
                                            placeholder="https://login.salesforce.com or https://acme.my.salesforce.com"
                                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                        />
                                        <div className="flex gap-2 mt-1">
                                            <button
                                                type="button"
                                                onClick={() => setLoginUrl('https://login.salesforce.com')}
                                                className="text-[10px] font-mono text-sky-400 hover:underline"
                                            >
                                                Production / Dev
                                            </button>
                                            <span className="text-slate-600">·</span>
                                            <button
                                                type="button"
                                                onClick={() => setLoginUrl('https://test.salesforce.com')}
                                                className="text-[10px] font-mono text-sky-400 hover:underline"
                                            >
                                                Sandbox
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                            Salesforce Username
                                        </label>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="admin@your-org.com"
                                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                            Password {status?.has_password && !password ? '(Saved · leave blank to keep)' : ''}
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder={status?.has_password ? '••••••••••••' : 'Enter password'}
                                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                            Security Token (Optional if IP is trusted)
                                        </label>
                                        <input
                                            type="password"
                                            value={securityToken}
                                            onChange={(e) => setSecurityToken(e.target.value)}
                                            placeholder={status?.has_security_token ? '••••••••••••' : '24-char Salesforce security token'}
                                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Optional Connected App OAuth 2.0 expandable section */}
                                <div className="pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setShowConnectedAppFields(!showConnectedAppFields)}
                                        className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200"
                                    >
                                        {showConnectedAppFields ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        <span>Optional: Use Connected App OAuth 2.0 Client ID &amp; Secret</span>
                                    </button>

                                    {showConnectedAppFields && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5 pt-2.5 border-t border-slate-800/80">
                                            <div>
                                                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                                    Consumer Key (Client ID)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={clientId}
                                                    onChange={(e) => setClientId(e.target.value)}
                                                    placeholder={status?.has_client_id ? 'Saved Client ID' : '3MVG9...'}
                                                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                                    Consumer Secret (Client Secret)
                                                </label>
                                                <input
                                                    type="password"
                                                    value={clientSecret}
                                                    onChange={(e) => setClientSecret(e.target.value)}
                                                    placeholder={status?.has_client_secret ? '••••••••••••' : 'Consumer Secret'}
                                                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {authMode === 'access_token' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                        Salesforce Instance URL (My Domain)
                                    </label>
                                    <input
                                        type="text"
                                        value={instanceUrl}
                                        onChange={(e) => setInstanceUrl(e.target.value)}
                                        placeholder="https://your-domain.my.salesforce.com"
                                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                        Bearer Access Token / Session ID {status?.has_access_token && !accessToken ? '(Saved)' : ''}
                                    </label>
                                    <input
                                        type="password"
                                        value={accessToken}
                                        onChange={(e) => setAccessToken(e.target.value)}
                                        placeholder={status?.has_access_token ? '••••••••••••••••••••' : '00D...!...'}
                                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                    />
                                </div>
                            </div>
                        )}

                        {authMode === 'client_credentials' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                        Salesforce My Domain Instance URL
                                    </label>
                                    <input
                                        type="text"
                                        value={instanceUrl}
                                        onChange={(e) => setInstanceUrl(e.target.value)}
                                        placeholder="https://your-domain.my.salesforce.com"
                                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                            Consumer Key (Client ID)
                                        </label>
                                        <input
                                            type="text"
                                            value={clientId}
                                            onChange={(e) => setClientId(e.target.value)}
                                            placeholder={status?.has_client_id ? 'Saved Client ID' : '3MVG9...'}
                                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                            Consumer Secret (Client Secret)
                                        </label>
                                        <input
                                            type="password"
                                            value={clientSecret}
                                            onChange={(e) => setClientSecret(e.target.value)}
                                            placeholder={status?.has_client_secret ? '••••••••••••' : 'Enter Consumer Secret'}
                                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {authMode === 'sf_cli' && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-mono text-slate-300">
                                        Import session from local Salesforce CLI (`sf org display`)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleScanCliOrgs}
                                        disabled={loadingCli}
                                        className="px-3 py-1 rounded-lg text-xs font-mono border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 flex items-center gap-1.5"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${loadingCli ? 'animate-spin' : ''}`} />
                                        <span>Scan Local CLI Orgs</span>
                                    </button>
                                </div>

                                {cliOrgs.length > 0 && (
                                    <div className="space-y-1.5">
                                        <label className="block text-[11px] font-mono text-slate-400">
                                            Detected Authenticated Orgs:
                                        </label>
                                        <div className="grid grid-cols-1 gap-1.5">
                                            {cliOrgs.map((o) => (
                                                <button
                                                    key={o.username}
                                                    type="button"
                                                    onClick={() => setCliAlias(o.alias || o.username)}
                                                    className={`p-2 rounded-lg border text-left text-xs font-mono flex items-center justify-between ${
                                                        cliAlias === (o.alias || o.username)
                                                            ? 'bg-sky-500/20 border-sky-400 text-white'
                                                            : 'bg-slate-950 border-slate-800 text-slate-300'
                                                    }`}
                                                >
                                                    <span>
                                                        <strong>{o.alias}</strong> ({o.username})
                                                    </span>
                                                    <span className="text-[10px] text-emerald-400">{o.instanceUrl}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                        Target Org Alias or Username (leave blank for default org)
                                    </label>
                                    <input
                                        type="text"
                                        value={cliAlias}
                                        onChange={(e) => setCliAlias(e.target.value)}
                                        placeholder="e.g. my-prod-org or admin@acme.com"
                                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Telemetry Streams & Polling Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2.5">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
                                2. Telemetry Streams
                            </span>

                            {[
                                {
                                    key: 'login_history' as const,
                                    label: 'LoginHistory + LoginGeo',
                                    desc: 'Client IPs, geo-coordinates, TLS ciphers & auth failures',
                                    badge: '☁️ SF LoginHistory',
                                },
                                {
                                    key: 'auth_session' as const,
                                    label: 'Active AuthSessions',
                                    desc: 'Live active user & API sessions with assurance levels',
                                    badge: '🔐 SF AuthSession',
                                },
                                {
                                    key: 'setup_audit' as const,
                                    label: 'SetupAuditTrail',
                                    desc: 'Admin permission sets, profiles, OAuth & security changes',
                                    badge: '🛡️ SF Setup Audit',
                                },
                                {
                                    key: 'event_monitoring' as const,
                                    label: 'Shield Event Monitoring',
                                    desc: 'ReportEvent DLP exports, ApiEvent queries & EventLogFiles',
                                    badge: '📊 SF Report / API',
                                },
                            ].map((item) => {
                                const streamStat = status?.streams?.[item.key];
                                return (
                                    <label
                                        key={item.key}
                                        className="flex items-start justify-between gap-2 p-2 rounded-lg border border-slate-800/80 bg-slate-950/60 cursor-pointer hover:border-slate-700"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <input
                                                type="checkbox"
                                                checked={streams[item.key]}
                                                onChange={(e) =>
                                                    setStreams((prev) => ({ ...prev, [item.key]: e.target.checked }))
                                                }
                                                className="mt-1 accent-sky-400"
                                            />
                                            <div>
                                                <div className="text-xs font-mono font-semibold text-slate-200">
                                                    {item.label}
                                                </div>
                                                <div className="text-[10px] text-slate-400 leading-tight">{item.desc}</div>
                                            </div>
                                        </div>
                                        {streamStat && (
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-300 shrink-0">
                                                {streamStat.events_ingested} evts
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 flex flex-col justify-between">
                            <div className="space-y-3">
                                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
                                    3. Cadence &amp; Historical Window
                                </span>

                                <div>
                                    <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                        Live Poll Interval
                                    </label>
                                    <select
                                        value={pollInterval}
                                        onChange={(e) => setPollInterval(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                    >
                                        <option value={15}>Every 15 seconds (High-Frequency)</option>
                                        <option value={30}>Every 30 seconds (Recommended)</option>
                                        <option value={60}>Every 1 minute</option>
                                        <option value={300}>Every 5 minutes</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-mono text-slate-300 mb-1">
                                        Historical Lookback Window
                                    </label>
                                    <select
                                        value={lookbackDays}
                                        onChange={(e) => setLookbackDays(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                                    >
                                        <option value={1}>Last 24 Hours</option>
                                        <option value={7}>Last 7 Days (Recommended)</option>
                                        <option value={14}>Last 14 Days</option>
                                        <option value={30}>Last 30 Days</option>
                                        <option value={90}>Last 90 Days</option>
                                    </select>
                                </div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-sky-950/25 border border-sky-500/20 text-[10.5px] font-mono text-slate-300 space-y-1">
                                <div className="text-sky-300 font-semibold">🔒 Local Credential Isolation</div>
                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                    Credentials are stored locally in git-ignored <code className="text-sky-300">data/salesforce_connector.json</code> and never leave your machine except to authenticate with your Salesforce tenant.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Feedback Alert */}
                    {feedback && (
                        <div
                            className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2.5 ${
                                feedback.type === 'success'
                                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                                    : feedback.type === 'error'
                                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                                    : 'bg-sky-950/40 border-sky-500/40 text-sky-200'
                            }`}
                        >
                            {feedback.type === 'success' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            )}
                            <span className="leading-relaxed">{feedback.message}</span>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testing || connecting}
                        className="px-4 py-2 rounded-xl text-xs font-mono font-semibold border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 transition flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-sky-400' : ''}`} />
                        <span>{testing ? 'Verifying Tenant...' : 'Test Connection'}</span>
                    </button>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition"
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            onClick={handleConnectAndSync}
                            disabled={connecting || testing}
                            className="px-5 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25 hover:brightness-110 transition flex items-center gap-2 disabled:opacity-50"
                        >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>{connecting ? 'Connecting & Syncing...' : 'Connect & Sync Tenant'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

