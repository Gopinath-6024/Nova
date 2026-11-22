import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  GitBranch,
  KeyRound,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { ConnectorPublicInfo, PermissionMode } from '../../types/nova';

export const ConnectModule: React.FC = () => {
  const [connectors, setConnectors] = useState<ConnectorPublicInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ConnectorPublicInfo['kind']>('mcp');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [description, setDescription] = useState('');
  const [headerName, setHeaderName] = useState('Authorization');
  const [secretToken, setSecretToken] = useState('');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('ask');
  const [saving, setSaving] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Interactive invocation state
  const [invokeConnectorId, setInvokeConnectorId] = useState<string>('');
  const [mcpToolName, setMcpToolName] = useState('');
  const [mcpToolArgsJson, setMcpToolArgsJson] = useState('{}');
  const [restMethod, setRestMethod] = useState<'GET' | 'POST'>('GET');
  const [restSubPath, setRestSubPath] = useState('');
  const [restBodyJson, setRestBodyJson] = useState('');
  const [invokeOutput, setInvokeOutput] = useState<string>('');
  const [invoking, setInvoking] = useState(false);

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/nova/connect');
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.connectors)) {
        setConnectors(data.connectors);
        if (!invokeConnectorId && data.connectors.length > 0) {
          setInvokeConnectorId(data.connectors[0].id);
        }
      }
    } catch {
      setError('Failed to fetch configured connectors.');
    } finally {
      setLoading(false);
    }
  }, [invokeConnectorId]);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !endpointUrl.trim()) return;
    setSaving(true);
    setError(null);
    setStatusMsg(null);
    try {
      const resp = await fetch('/api/nova/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          kind,
          endpointUrl: endpointUrl.trim(),
          description: description.trim(),
          headerName: headerName.trim() || 'Authorization',
          secretToken: secretToken.trim() || undefined,
          permissionMode,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to save connector');
      setName('');
      setEndpointUrl('');
      setDescription('');
      setSecretToken('');
      setStatusMsg(`Saved connector "${data.connector.name}". Any secret token was encrypted in server vault.`);
      await loadConnectors();
      setInvokeConnectorId(data.connector.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save connector');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setError(null);
    setStatusMsg(null);
    try {
      const resp = await fetch(`/api/nova/connect/${encodeURIComponent(id)}/test`, {
        method: 'POST',
      });
      const data = await resp.json();
      await loadConnectors();
      if (!resp.ok) throw new Error(data?.error || 'Connection test failed');
      setStatusMsg(data.details || 'Connection verified.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection ping failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      const resp = await fetch(`/api/nova/connect/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Delete failed');
      await loadConnectors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove connector');
    }
  };

  const selectedConnector = connectors.find((c) => c.id === invokeConnectorId) ?? null;

  const handleInvoke = async () => {
    if (!selectedConnector || invoking) return;
    setInvoking(true);
    setError(null);
    setInvokeOutput('');
    try {
      let bodyPayload: Record<string, unknown> = { confirmed: true };
      if (selectedConnector.kind === 'mcp') {
        let parsedArgs: Record<string, unknown> = {};
        if (mcpToolArgsJson.trim()) {
          parsedArgs = JSON.parse(mcpToolArgsJson);
        }
        bodyPayload = {
          confirmed: true,
          toolName: mcpToolName || selectedConnector.discoveredTools?.[0]?.name || '',
          toolArgs: parsedArgs,
        };
      } else {
        bodyPayload = {
          confirmed: true,
          method: restMethod,
          subPath: restSubPath.trim(),
          ...(restMethod === 'POST' && restBodyJson.trim() ? { bodyPayload: JSON.parse(restBodyJson) } : {}),
        };
      }

      const resp = await fetch(`/api/nova/connect/${encodeURIComponent(selectedConnector.id)}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Invocation rejected');
      setInvokeOutput(
        selectedConnector.kind === 'mcp'
          ? JSON.stringify(data.result, null, 2)
          : data.responseText || JSON.stringify(data, null, 2)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connector invocation error');
    } finally {
      setInvoking(false);
    }
  };

  const kindIcon = (k: ConnectorPublicInfo['kind']) => {
    if (k === 'github') return <GitBranch className="h-4 w-4 text-violet-500" />;
    if (k === 'database') return <Database className="h-4 w-4 text-violet-500" />;
    if (k === 'mcp') return <Server className="h-4 w-4 text-violet-500" />;
    return <Link2 className="h-4 w-4 text-violet-500" />;
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <Server className="h-3.5 w-3.5" />
              <span>MCP, GitHub &amp; Encrypted Server Vault</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              NOVA Connect
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Register Model Context Protocol servers, GitHub PATs, and external REST endpoints. Credentials are encrypted with AES-256-GCM strictly on the backend.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            <span>Secrets Never Returned to Client</span>
          </div>
        </div>

        {(statusMsg || error) && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              error
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
            }`}
          >
            {error || statusMsg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSave}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-5 dark:border-white/10 dark:bg-[#0D0A19]"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Plus className="h-3.5 w-3.5 text-violet-500" />
              <span>Add External Connector</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Linear MCP / GitHub"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Type</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ConnectorPublicInfo['kind'])}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  <option value="mcp">MCP (JSON-RPC)</option>
                  <option value="github">GitHub REST</option>
                  <option value="rest_api">External REST API</option>
                  <option value="database">Database HTTP Bridge</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Public HTTPS Endpoint URL (SSRF-guarded)
              </label>
              <input
                type="url"
                required
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder={kind === 'github' ? 'https://api.github.com' : 'https://mcp.example.com/rpc'}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Auth Header</label>
                <input
                  type="text"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  placeholder="Authorization"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Permission Policy</label>
                <select
                  value={permissionMode}
                  onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  <option value="ask">Ask Before Invoke</option>
                  <option value="auto">Auto Allow</option>
                  <option value="deny">Deny Execution</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                <KeyRound className="h-3 w-3" />
                <span>Secret Token / PAT (Write-Only, Stored Encrypted on Server)</span>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={secretToken}
                onChange={(e) => setSecretToken(e.target.value)}
                placeholder="ghp_... or Bearer token (never echoed back)"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Purpose of this integration"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {saving ? 'Encrypting & Saving...' : 'Save Connector'}
            </button>
          </form>

          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Configured Connectors ({connectors.length})
                </span>
                <button
                  type="button"
                  onClick={loadConnectors}
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>

              {loading ? (
                <p className="mt-3 text-xs text-slate-500">Loading server vault...</p>
              ) : connectors.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  No connectors saved yet.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {connectors.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setInvokeConnectorId(c.id)}
                      className={`cursor-pointer rounded-lg border p-3 transition ${
                        invokeConnectorId === c.id
                          ? 'border-violet-500 bg-violet-50/60 dark:border-violet-500 dark:bg-violet-500/10'
                          : 'border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          {kindIcon(c.kind)}
                          <div>
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                              <span>{c.name}</span>
                              <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] uppercase text-slate-700 dark:bg-white/10 dark:text-slate-300">
                                {c.kind}
                              </span>
                              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] uppercase text-violet-800 dark:bg-violet-500/20 dark:text-violet-300">
                                {c.permissionMode}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {c.endpointUrl}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                              {c.status === 'connected' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" /> Connected {c.lastCheckedAt || ''}
                                </span>
                              ) : c.status === 'error' ? (
                                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                                  <XCircle className="h-3 w-3" /> {c.lastError || 'Error'}
                                </span>
                              ) : (
                                <span className="text-slate-500 dark:text-slate-400">Untested</span>
                              )}
                              {c.hasSecret && (
                                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                  <KeyRound className="h-3 w-3" /> Encrypted Secret
                                </span>
                              )}
                              {c.discoveredTools && c.discoveredTools.length > 0 && (
                                <span className="text-violet-700 dark:text-violet-300">
                                  {c.discoveredTools.length} MCP tools discovered
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTest(c.id);
                            }}
                            disabled={testingId === c.id}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
                          >
                            <Activity className="h-3.5 w-3.5" />
                            {testingId === c.id ? 'Pinging...' : 'Test'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(c.id);
                            }}
                            aria-label={`Delete ${c.name}`}
                            className="inline-flex min-h-[34px] items-center justify-center rounded-md border border-slate-200 px-2 py-1 text-red-600 hover:bg-red-50 dark:border-white/15 dark:text-red-400 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedConnector && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Live Tool Runner · {selectedConnector.name}
                </div>

                {selectedConnector.kind === 'mcp' ? (
                  <div className="mt-3 space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        MCP Tool Name {selectedConnector.discoveredTools?.length ? '(from tools/list)' : ''}
                      </label>
                      {selectedConnector.discoveredTools && selectedConnector.discoveredTools.length > 0 ? (
                        <select
                          value={mcpToolName || selectedConnector.discoveredTools[0]?.name}
                          onChange={(e) => setMcpToolName(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                        >
                          {selectedConnector.discoveredTools.map((t) => (
                            <option key={t.name} value={t.name}>
                              {t.name} {t.description ? `— ${t.description.slice(0, 60)}` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={mcpToolName}
                          onChange={(e) => setMcpToolName(e.target.value)}
                          placeholder="e.g., list_issues or ping"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Arguments JSON
                      </label>
                      <textarea
                        rows={2}
                        value={mcpToolArgsJson}
                        onChange={(e) => setMcpToolArgsJson(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={restMethod}
                        onChange={(e) => setRestMethod(e.target.value as 'GET' | 'POST')}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                      <input
                        type="text"
                        value={restSubPath}
                        onChange={(e) => setRestSubPath(e.target.value)}
                        placeholder="/user/repos or sub-path"
                        className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                      />
                    </div>
                    {restMethod === 'POST' && (
                      <textarea
                        rows={2}
                        value={restBodyJson}
                        onChange={(e) => setRestBodyJson(e.target.value)}
                        placeholder='{"key": "value"}'
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                      />
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleInvoke}
                  disabled={invoking || selectedConnector.permissionMode === 'deny'}
                  className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  {selectedConnector.permissionMode === 'deny'
                    ? 'Blocked by Policy'
                    : selectedConnector.permissionMode === 'ask'
                      ? 'Confirm & Execute Tool'
                      : 'Execute Tool'}
                </button>

                {invokeOutput && (
                  <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:border-white/10 dark:bg-black/40 dark:text-slate-200">
                    {invokeOutput}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
