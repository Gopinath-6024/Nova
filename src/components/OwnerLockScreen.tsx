import React, { useState } from 'react';
import { Fingerprint, Lock } from 'lucide-react';

interface OwnerLockScreenProps {
  ownerPin: string;
  onUnlockWithFingerprint: () => Promise<boolean>;
  onUnlockWithPin: () => void;
}

export const OwnerLockScreen: React.FC<OwnerLockScreenProps> = ({
  ownerPin,
  onUnlockWithFingerprint,
  onUnlockWithPin,
}) => {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ownerPin) {
      setErr(null);
      onUnlockWithPin();
    } else {
      setErr('Incorrect Owner PIN.');
      setPin('');
    }
  };

  return (
    <div className="min-h-screen bg-[#06040C] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-violet-400/20 bg-[#110C1D] p-7 text-center space-y-6">
        <img
          src="/assets/aistudio/nova-logo-transparent_5434d2c2.png"
          alt="Nova"
          referrerPolicy="no-referrer"
          className="mx-auto h-20 w-20 object-contain"
        />
        <div>
          <h1 className="font-display text-xl font-bold">Nova Private Vault</h1>
          <p className="mt-1 text-xs text-slate-400">
            Locked for owner-only access. Verify with fingerprint or your private PIN.
          </p>
        </div>

        <button
          type="button"
          onClick={async () => {
            const ok = await onUnlockWithFingerprint();
            if (!ok) setErr('Fingerprint verification cancelled.');
          }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-violet-400/40 bg-violet-600/20 text-violet-200 hover:bg-violet-600/35 transition-colors"
          aria-label="Unlock with fingerprint"
        >
          <Fingerprint className="h-10 w-10" />
        </button>

        <form onSubmit={handlePinSubmit} className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter Owner PIN"
              className="flex-1 min-h-[44px] rounded-xl border border-white/10 bg-[#181228] px-3.5 text-center text-sm tracking-widest text-white focus:border-violet-400 focus:outline-none"
            />
            <button
              type="submit"
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Unlock</span>
            </button>
          </div>
          {err && <p className="text-xs text-rose-300">{err}</p>}
        </form>
      </div>
    </div>
  );
};
