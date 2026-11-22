import React, { useState } from 'react';
import { CheckCircle2, Fingerprint, Lock, ShieldCheck, X } from 'lucide-react';
import type { BiometricState } from '../types/nova';

interface FingerprintModalProps {
  open: boolean;
  reason: string;
  biometrics: BiometricState;
  onClose: () => void;
  onVerify: () => Promise<{ ok: boolean; method: string; message: string }>;
  onEnroll: () => Promise<{ ok: boolean; method: string; message: string }>;
}

export const FingerprintModal: React.FC<FingerprintModalProps> = ({
  open,
  reason,
  biometrics,
  onClose,
  onVerify,
  onEnroll,
}) => {
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!open) return null;

  const handleTouchSensor = async () => {
    setScanning(true);
    setFeedback(null);
    await new Promise((r) => setTimeout(r, 420));
    const res = biometrics.enrolled ? await onVerify() : await onEnroll();
    setScanning(false);
    setFeedback(res.message);
    if (res.ok) {
      setTimeout(() => {
        setFeedback(null);
        onClose();
      }, 650);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fingerprint-modal-title"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-violet-400/20 bg-[#110C1D] p-6 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-violet-400/25 sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="fingerprint-modal-title"
                className="text-base font-semibold text-white"
              >
                {biometrics.enrolled ? 'Fingerprint Verification' : 'Enroll Fingerprint Access'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{reason}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close biometric prompt"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={handleTouchSensor}
            disabled={scanning}
            className={`group relative flex h-24 w-24 items-center justify-center rounded-full border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
              feedback
                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300'
                : scanning
                  ? 'border-violet-400 bg-violet-600/25 text-violet-200 scale-95'
                  : 'border-violet-400/35 bg-violet-950/50 text-violet-300 hover:border-violet-400 hover:bg-violet-600/20 active:scale-95'
            }`}
          >
            {feedback ? (
              <CheckCircle2 className="h-11 w-11" />
            ) : (
              <Fingerprint className={`h-11 w-11 ${scanning ? 'animate-pulse' : ''}`} />
            )}
          </button>

          <p className="mt-4 text-sm font-medium text-slate-200">
            {feedback
              ? feedback
              : scanning
                ? 'Reading biometric signature...'
                : biometrics.enrolled
                  ? 'Tap sensor to verify with device fingerprint'
                  : 'Tap sensor to register your fingerprint'}
          </p>

          <p className="mt-1.5 text-xs text-slate-400 max-w-xs">
            {biometrics.hardwareSupported
              ? 'Uses your device WebAuthn platform biometric sensor when permitted by the browser.'
              : 'Uses browser-verified touch sensor access for sensitive phone controls & security remediation.'}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-violet-400/10 pt-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-violet-400" />
            10-min protected session
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
