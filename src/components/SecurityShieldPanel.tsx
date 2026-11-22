import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  WifiOff,
} from 'lucide-react';
import type {
  PrivacySettings,
  SecurityAppAudit,
  ThreatAnalysisResult,
} from '../types/nova';

interface SecurityShieldPanelProps {
  audits: SecurityAppAudit[];
  isScanning: boolean;
  lastScanAt: string | null;
  isUnlocked: boolean;
  privacy: PrivacySettings;
  onUpdatePrivacy: (next: Partial<PrivacySettings>) => void;
  onClearPrivateVault: () => void;
  onStartScan: () => void;
  onQuarantineApp: (id: string) => void;
  onTrustApp: (id: string) => void;
  onRequestUnlock: (reason: string) => void;
}

export const SecurityShieldPanel: React.FC<SecurityShieldPanelProps> = ({
  audits,
  isScanning,
  lastScanAt,
  isUnlocked,
  privacy,
  onUpdatePrivacy,
  onClearPrivateVault,
  onStartScan,
  onQuarantineApp,
  onTrustApp,
  onRequestUnlock,
}) => {
  const [inspectInput, setInspectInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ThreatAnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState(privacy.ownerPin);

  const flaggedCount = audits.filter((a) => a.status === 'flagged').length;
  const reviewCount = audits.filter((a) => a.status === 'review').length;

  const handleAnalyzeThreat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectInput.trim()) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch('/api/nova/security-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inspectInput.trim(),
          auditSnapshot: audits,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed');
      }
      setAnalysis(data);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Unable to analyze threat');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Owner-Only Private Vault Controls */}
      <section className="rounded-2xl border border-violet-400/18 bg-white dark:bg-[#120D1F] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Owner-Only Privacy &amp; Local Vault
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Your chats, PDFs, pictures, alarms, and codes stay strictly private in your own
              device storage—never shared.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isUnlocked) {
                onRequestUnlock('Verify fingerprint to wipe private vault');
                return;
              }
              onClearPrivateVault();
            }}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-400/25 px-3.5 text-xs font-medium text-rose-600 dark:text-rose-200 hover:bg-rose-500/15 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Wipe Local Vault</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onUpdatePrivacy({ ownerLockEnabled: !privacy.ownerLockEnabled })}
            className={`flex min-h-[64px] items-center justify-between rounded-xl border p-3.5 text-left transition-colors ${
              privacy.ownerLockEnabled
                ? 'border-violet-500/50 bg-violet-600/15 dark:bg-violet-600/20 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" />
              <div>
                <div className="text-xs font-semibold">Owner Launch Lock</div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  {privacy.ownerLockEnabled ? 'Required on open' : 'Disabled'}
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onUpdatePrivacy({ incognitoMode: !privacy.incognitoMode })}
            className={`flex min-h-[64px] items-center justify-between rounded-xl border p-3.5 text-left transition-colors ${
              privacy.incognitoMode
                ? 'border-violet-500/50 bg-violet-600/15 dark:bg-violet-600/20 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <EyeOff className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" />
              <div>
                <div className="text-xs font-semibold">Incognito Chat</div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  {privacy.incognitoMode ? 'Zero history saved' : 'History saved locally'}
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onUpdatePrivacy({ strictOfflinePrivacy: !privacy.strictOfflinePrivacy })}
            className={`flex min-h-[64px] items-center justify-between rounded-xl border p-3.5 text-left transition-colors ${
              privacy.strictOfflinePrivacy
                ? 'border-violet-500/50 bg-violet-600/15 dark:bg-violet-600/20 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <WifiOff className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" />
              <div>
                <div className="text-xs font-semibold">Zero-Cloud Offline</div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  {privacy.strictOfflinePrivacy ? 'On-device only' : 'Cloud + Edge hybrid'}
                </div>
              </div>
            </div>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{4,6}$/.test(pinDraft.trim())) {
              onUpdatePrivacy({ ownerPin: pinDraft.trim(), ownerLockEnabled: true });
            }
          }}
          className="flex flex-col sm:flex-row sm:items-center gap-2 border-t border-slate-200 dark:border-white/8 pt-3"
        >
          <span className="text-xs text-slate-700 dark:text-slate-300">Private Owner PIN (4-6 digits):</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinDraft}
            onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ''))}
            placeholder="4-6 digit PIN"
            className="min-h-[40px] w-40 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-900 dark:text-white font-mono focus:border-violet-400 focus:outline-none"
          />
          <button
            type="submit"
            className="min-h-[40px] rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500"
          >
            Save Owner PIN
          </button>
        </form>
      </section>

      {/* Shield Overview Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-violet-400/15 bg-white dark:bg-[#120D1F] p-5">
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              flaggedCount > 0
                ? 'bg-rose-500/15 text-rose-300'
                : 'bg-emerald-500/15 text-emerald-300'
            }`}
          >
            {flaggedCount > 0 ? (
              <ShieldAlert className="h-6 w-6" />
            ) : (
              <ShieldCheck className="h-6 w-6" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {isScanning
                ? 'Scanning apps, background packets & permissions...'
                : flaggedCount > 0
                  ? `${flaggedCount} Suspicious Package Detected`
                  : 'Mobile Activity & Virus Shield Clear'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              <span>{audits.length} monitored packages</span>
              <span aria-hidden="true">·</span>
              <span>{reviewCount} permission review</span>
              <span aria-hidden="true">·</span>
              <span>{lastScanAt ? `Last scan ${lastScanAt}` : 'Ready to scan'}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onStartScan}
          disabled={isScanning}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
        >
          <ScanSearch className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Scanning Device...' : 'Run Deep Virus Scan'}</span>
        </button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* App Activity & Permission Auditor */}
        <section className="lg:col-span-7 rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">App Activity & Permission Audit</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Quarantining or overriding flagged packages requires fingerprint unlock
              </p>
            </div>
            {!isUnlocked && (
              <button
                type="button"
                onClick={() => onRequestUnlock('Verify fingerprint to quarantine or approve apps')}
                className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-violet-400/25 px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/15 transition-colors shrink-0"
              >
                <Fingerprint className="h-3.5 w-3.5" />
                <span>Unlock</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-200 dark:divide-white/8">
            {audits.map((app) => (
              <div key={app.id} className="py-4 first:pt-1 last:pb-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {app.appName}
                      </span>
                      {app.status === 'flagged' && (
                        <span className="flex items-center gap-1 text-xs font-medium text-rose-300">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Threat
                        </span>
                      )}
                      {app.status === 'review' && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-300">
                          <Activity className="h-3.5 w-3.5" />
                          Review
                        </span>
                      )}
                      {app.status === 'trusted' && (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Clean
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                      <span>{app.packageId}</span>
                      <span aria-hidden="true">·</span>
                      <span>{app.backgroundDataMb.toFixed(1)} MB bg data</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans">{app.lastActive}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {app.status !== 'trusted' && (
                      <button
                        type="button"
                        onClick={() => onTrustApp(app.id)}
                        className="min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                      >
                        Mark Safe
                      </button>
                    )}
                    {app.status !== 'trusted' && (
                      <button
                        type="button"
                        onClick={() => onQuarantineApp(app.id)}
                        className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500 transition-colors"
                      >
                        {!isUnlocked && <Lock className="h-3 w-3" />}
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Quarantine</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Permissions: {app.permissions.join(' · ')}
                </div>
                {app.reason && <p className="text-xs text-amber-700 dark:text-amber-200/90">{app.reason}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Live AI Threat / Link / SMS / APK Analyzer */}
        <section className="lg:col-span-5 rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Suspicious Link, SMS &amp; APK Inspector</h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Paste any suspicious text message, link, APK package ID, or device log for instant AI
            malware and phishing analysis.
          </p>

          <form onSubmit={handleAnalyzeThreat} className="mt-4 space-y-3">
            <textarea
              rows={4}
              value={inspectInput}
              onChange={(e) => setInspectInput(e.target.value)}
              placeholder="e.g. 'Your bank account is suspended, click bit.ly/verify-now' or 'com.unknown.promocleaner'"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setInspectInput(
                    'URGENT: Your courier parcel is held at customs. Pay $2.50 fee at http://track-parcel-verify88.com/pay or install TrackHelper.apk'
                  )
                }
                className="min-h-[40px] text-xs font-medium text-violet-600 dark:text-violet-300 hover:text-violet-700 dark:text-violet-200"
              >
                Load sample phishing SMS
              </button>
              <button
                type="submit"
                disabled={analyzing || !inspectInput.trim()}
                className="min-h-[44px] rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
              >
                {analyzing ? 'Inspecting...' : 'Analyze Threat'}
              </button>
            </div>
          </form>

          {analyzeError && (
            <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-950/30 p-3 text-xs text-rose-200">
              {analyzeError}
            </div>
          )}

          {analysis && (
            <div className="mt-5 space-y-3 border-t border-slate-200 dark:border-white/8 pt-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {analysis.verdict === 'threat' && (
                  <span className="flex items-center gap-1.5 text-rose-300">
                    <ShieldAlert className="h-4 w-4" />
                    High Risk Threat
                  </span>
                )}
                {analysis.verdict === 'caution' && (
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    Proceed With Caution
                  </span>
                )}
                {analysis.verdict === 'safe' && (
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <ShieldCheck className="h-4 w-4" />
                    No Threat Found
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200">{analysis.summary}</p>
              {analysis.indicators.length > 0 && (
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 list-disc list-inside">
                  {analysis.indicators.map((ind, i) => (
                    <li key={i}>{ind}</li>
                  ))}
                </ul>
              )}
              <div className="rounded-xl bg-slate-50 dark:bg-[#181228] p-3 text-xs text-violet-700 dark:text-violet-200">
                Recommended action: {analysis.recommendedAction}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
