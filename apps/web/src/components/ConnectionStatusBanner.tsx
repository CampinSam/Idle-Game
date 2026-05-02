import { useCallback } from 'react';
import { useAppSelector } from '../store';
import { syncEngine } from '../services/syncEngineSingleton';
import './ConnectionStatusBanner.css';

/**
 * Surfaces SyncEngine connectivity problems to the player as a
 * dismiss-resistant top banner with a Retry CTA. Replaces the
 * previous behaviour where bootstrap/SSE failures only logged to
 * the browser console and the UI silently froze.
 */
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
    <div className="conn-banner" role="status" aria-live="polite">
      <span className="conn-banner-dot" />
      <span className="conn-banner-msg">{label}</span>
      <button className="conn-banner-retry" onClick={handleRetry}>
        Retry
      </button>
    </div>
  );
}
