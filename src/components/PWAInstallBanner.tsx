import React, { useMemo, useState } from 'react';
import { Check, Download, Loader2, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isInstalling, isIOS, isEmbeddedIframe, install } =
    usePWAInstall();
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const directInstallHref = useMemo(() => {
    if (typeof window === 'undefined') return '/?install=1';
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('install', '1');
      return url.toString();
    } catch {
      return '/?install=1';
    }
  }, []);

  // Already installed and running in standalone mode on Home Screen / Desktop
  if (isInstalled) {
    return null;
  }

  const handleImmediateInstall = async () => {
    setStatusNotice(null);

    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setStatusNotice('Added to Home Screen');
        setTimeout(() => setStatusNotice(null), 2500);
      }
      return;
    }

    if (isIOS && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Nova',
          url: window.location.origin,
        });
        return;
      } catch {
        // user closed share sheet
      }
    }

    // Attempt once more right after calling install() in case beforeinstallprompt arrived asynchronously
    const retried = await install();
    if (!retried) {
      setStatusNotice('Browser install ready in Chrome menu');
      setTimeout(() => setStatusNotice(null), 2500);
    }
  };

  const buttonClasses =
    'flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-violet-600/35 hover:bg-violet-500 active:scale-[0.98] transition-all whitespace-nowrap shrink-0';

  return (
    <div className="relative flex items-center">
      {isEmbeddedIframe && !isInstallable ? (
        <a
          href={directInstallHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Install Nova App to Home Screen"
          className={buttonClasses}
        >
          <Download className="h-4 w-4 shrink-0" />
          <span>Install</span>
        </a>
      ) : (
        <button
          type="button"
          disabled={isInstalling}
          onClick={() => void handleImmediateInstall()}
          aria-label="Install Nova App to Home Screen"
          className={`${buttonClasses} disabled:opacity-70`}
        >
          {isInstalling ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : statusNotice === 'Added to Home Screen' ? (
            <Check className="h-4 w-4 shrink-0 text-emerald-300" />
          ) : (
            <Download className="h-4 w-4 shrink-0" />
          )}
          <span>{isInstalling ? 'Installing...' : 'Install'}</span>
        </button>
      )}

      {statusNotice && (
        <div
          role="status"
          className="absolute right-0 top-12 z-50 whitespace-nowrap rounded-xl border border-violet-400/30 bg-[#140E24] px-3 py-1.5 text-[11px] font-medium text-violet-100 shadow-xl"
        >
          {statusNotice}
        </div>
      )}
    </div>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-950/95 px-3.5 py-2 text-xs font-medium text-amber-200 shadow-lg">
      <WifiOff className="h-4 w-4 text-amber-400" />
      <span>Offline Mode — Local controls, vector art, PDFs &amp; cached workspace active</span>
    </div>
  );
};
