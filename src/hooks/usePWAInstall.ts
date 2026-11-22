import { useCallback, useEffect, useRef, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __novaDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__novaDeferredInstallPrompt ?? null : null
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isEmbeddedIframe, setIsEmbeddedIframe] = useState(false);
  const pendingAutoTriggerRef = useRef(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    try {
      setIsEmbeddedIframe(window.self !== window.top);
    } catch {
      setIsEmbeddedIframe(true);
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('install') === '1') {
      pendingAutoTriggerRef.current = true;
      urlParams.delete('install');
      const cleanedSearch = urlParams.toString();
      const cleanedUrl = `${window.location.pathname}${cleanedSearch ? `?${cleanedSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanedUrl);
    }

    const tryTriggerPrompt = async (promptEv: BeforeInstallPromptEvent) => {
      try {
        setIsInstalling(true);
        await promptEv.prompt();
        const { outcome } = await promptEv.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          window.__novaDeferredInstallPrompt = null;
          setDeferredPrompt(null);
          return true;
        }
      } catch {
        // Browser may require a direct tap if auto-triggered after navigation
      } finally {
        setIsInstalling(false);
      }
      return false;
    };

    if (window.__novaDeferredInstallPrompt) {
      setDeferredPrompt(window.__novaDeferredInstallPrompt);
      if (pendingAutoTriggerRef.current) {
        pendingAutoTriggerRef.current = false;
        void tryTriggerPrompt(window.__novaDeferredInstallPrompt);
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEv = e as BeforeInstallPromptEvent;
      window.__novaDeferredInstallPrompt = promptEv;
      setDeferredPrompt(promptEv);

      if (pendingAutoTriggerRef.current) {
        pendingAutoTriggerRef.current = false;
        void tryTriggerPrompt(promptEv);
      }
    };

    const handleNovaReady = () => {
      if (window.__novaDeferredInstallPrompt) {
        setDeferredPrompt(window.__novaDeferredInstallPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstalling(false);
      window.__novaDeferredInstallPrompt = null;
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('nova-install-ready', handleNovaReady);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('nova-install-ready', handleNovaReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const promptEv = deferredPrompt || window.__novaDeferredInstallPrompt;
    if (!promptEv) {
      pendingAutoTriggerRef.current = true;
      return false;
    }

    setIsInstalling(true);
    try {
      await promptEv.prompt();
      const { outcome } = await promptEv.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        window.__novaDeferredInstallPrompt = null;
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setIsInstalling(false);
    }
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isInstalling,
    isIOS,
    isEmbeddedIframe,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
