import { useRegisterSW } from 'virtual:pwa-register/react';
import './PWAUpdateBanner.css';

export default function PWAUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Poll every 30s so an active session picks up new deploys quickly,
    // instead of waiting for the browser's default SW update cadence.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const intervalMs = 30_000;
      setInterval(() => {
        if (registration.installing) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        registration.update().catch((err) => {
          console.warn('[PWA] update() failed:', err);
        });
      }, intervalMs);
    },
    onRegisterError(error) {
      console.error('[PWA] Service worker registration failed:', error);
    },
  });

  if (!import.meta.env.PROD) return null;
  if (!needRefresh) return null;

  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <span className="pwa-update-icon" aria-hidden>
        ✨
      </span>
      <div className="pwa-update-content">
        <span className="pwa-update-title">A new version is available</span>
        <span className="pwa-update-body">Refresh to get the latest update.</span>
      </div>
      <button
        type="button"
        className="pwa-update-action"
        onClick={() => updateServiceWorker(true)}
      >
        Refresh
      </button>
      <button
        type="button"
        className="pwa-update-dismiss"
        aria-label="Dismiss update banner"
        onClick={() => setNeedRefresh(false)}
      >
        ×
      </button>
    </div>
  );
}
