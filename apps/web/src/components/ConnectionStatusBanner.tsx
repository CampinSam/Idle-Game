import { useCallback } from 'react';
import { useAppSelector } from '../store';
import { syncEngine } from '../services/syncEngineSingleton';

export default function ConnectionStatusBanner() {
  const status = useAppSelector((s: any) => s.sync?.status);
  const lastError = useAppSelector((s: any) => s.sync?.lastError);

  const handleRetry = useCallback(() => {
    try { syncEngine?.start(); } catch { /* ignore */ }
  }, []);

  const isProblem = status === 'reconnecting' || status === 'disconnected' || !!lastError;
  if (!isProblem) return null;

  const label = status === 'reconnecting'
    ? 'Reconnecting to the server…'
    : lastError
      ? `Connection lost: ${lastError}`
      : 'Disconnected from the server';

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[1500] flex items-center gap-2.5 px-3.5 py-2 bg-[rgba(150,30,30,0.92)] text-white text-[13px] font-medium shadow-[0_2px_8px_rgba(0,0,0,0.35)] backdrop-blur-[4px]"
      role="status"
      aria-live="polite"
    >
      <span className="w-2 h-2 rounded-full bg-[#ffd24a] shadow-[0_0_8px_#ffd24a] [animation:conn-banner-pulse_1.2s_ease-in-out_infinite] shrink-0" />
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      <button
        className="shrink-0 !bg-[rgba(255,255,255,0.15)] text-white !border !border-[rgba(255,255,255,0.35)] !rounded-md !px-3 !py-1 !text-[12px] !font-semibold cursor-pointer transition-colors hover:!bg-[rgba(255,255,255,0.25)] active:translate-y-px"
        onClick={handleRetry}
      >
        Retry
      </button>
    </div>
  );
}
