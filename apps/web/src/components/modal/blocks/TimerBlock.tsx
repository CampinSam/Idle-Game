import { useEffect, useMemo, useRef } from 'react';
import { useNow } from '../../../hooks/useNow';
import { useAppSelector } from '../../../store';

export default function TimerBlock({
  startTick,
  durationTicks,
  endsAt,
  wallClock,
  label,
  onExpire,
}: {
  startTick?: number;
  durationTicks?: number;
  endsAt?: string;
  wallClock?: boolean;
  label?: string;
  onExpire?: () => void;
}) {
  const tickBroadcast = useAppSelector((s) => s.sync.tickBroadcast);
  const now = useNow(1000);
  const firedRef = useRef(false);

  const isTickMode = startTick != null && durationTicks != null;

  // Compute remaining seconds for tick-native mode.
  // Estimate the current tick using the last broadcast tick + elapsed real time.
  const tickRemaining = useMemo(() => {
    if (!isTickMode || !tickBroadcast) return null;
    const elapsed = (now - tickBroadcast.receivedAt) / 1000;
    const estimatedTick = tickBroadcast.currentTick + elapsed * tickBroadcast.tickRate;
    return Math.max(0, (startTick! + durationTicks! - estimatedTick) / tickBroadcast.tickRate);
  }, [isTickMode, tickBroadcast, startTick, durationTicks, now]);

  // Compute remaining ms for wall-clock mode.
  const wallRemaining = useMemo(() => {
    if (isTickMode || !endsAt) return null;
    const endMs = Date.parse(endsAt);
    return Math.max(0, endMs - now);
  }, [isTickMode, endsAt, now]);

  // Fire onExpire when the timer hits zero.
  const resetKey = isTickMode ? `${startTick}-${durationTicks}` : endsAt;
  useEffect(() => {
    firedRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    const remaining = isTickMode ? tickRemaining : (wallRemaining != null ? wallRemaining / 1000 : null);
    if (remaining != null && remaining <= 0 && !firedRef.current && onExpire) {
      firedRef.current = true;
      onExpire();
    }
  }, [isTickMode, tickRemaining, wallRemaining, onExpire]);

  function formatSeconds(totalSec: number): string {
    if (totalSec <= 0) return 'Ready!';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  let display: string;
  if (isTickMode) {
    if (tickBroadcast == null) {
      display = '—';
    } else {
      display = tickRemaining! <= 0 ? 'Ready!' : formatSeconds(tickRemaining!);
    }
  } else if (endsAt && wallClock) {
    const secs = wallRemaining != null ? wallRemaining / 1000 : 0;
    display = secs <= 0 ? 'Ready!' : formatSeconds(secs);
  } else {
    display = '—';
  }

  const isReady = (isTickMode && tickRemaining != null && tickRemaining <= 0)
    || (!isTickMode && wallRemaining != null && wallRemaining <= 0);

  return (
    <div className="gm-timer-block">
      <div className="gm-timer-label">{label ?? 'Time remaining'}</div>
      <div className={`gm-timer-value ${isReady ? 'gm-timer-ready' : ''}`}>{display}</div>
    </div>
  );
}
