import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Capture Chrome's beforeinstallprompt early before React mounts so Laptop & Android WebAPK install is always ready
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    (window as unknown as { __novaDeferredInstallPrompt?: Event }).__novaDeferredInstallPrompt = e;
    window.dispatchEvent(new CustomEvent('nova-install-ready'));
  });
}

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
