import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PWAUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
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
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] left-1/2 -translate-x-1/2 z-[220] w-[calc(100%-24px)] max-w-[460px] flex items-center gap-2.5 px-3.5 py-3 rounded-xl border-l-4 border-[#8b5cf6] [background:linear-gradient(135deg,#1e1b3a_0%,#2a1f4e_100%)] shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(139,92,246,0.25)] [animation:pwa-update-slide_0.3s_ease-out] pointer-events-auto"
      role="status"
      aria-live="polite"
    >
      <span className="text-[20px] shrink-0" aria-hidden>
        ✨
      </span>
      <div className="flex-1 flex flex-col gap-[2px] min-w-0">
        <span className="text-[13px] font-extrabold text-[#f0f0f0]">A new version is available</span>
        <span className="text-[12px] text-[rgba(255,255,255,0.65)] whitespace-nowrap overflow-hidden text-ellipsis">
          Refresh to get the latest update.
        </span>
      </div>
      <button
        type="button"
        className="![background:linear-gradient(135deg,#8b5cf6,#6d28d9)] !border-0 text-white !text-[12px] !font-bold !px-3.5 !py-1.5 !rounded-lg shrink-0 tracking-[0.3px] shadow-[0_2px_8px_rgba(139,92,246,0.4)] transition-transform hover:scale-[1.04] active:scale-[0.96]"
        onClick={() => updateServiceWorker(true)}
      >
        Refresh
      </button>
      <button
        type="button"
        className="!bg-transparent !border-0 text-[rgba(255,255,255,0.45)] !text-[20px] leading-none cursor-pointer !p-[0_4px] shrink-0 hover:text-[rgba(255,255,255,0.85)]"
        aria-label="Dismiss update banner"
        onClick={() => setNeedRefresh(false)}
      >
        ×
      </button>
    </div>
  );
}
