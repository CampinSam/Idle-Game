import { useMemo } from 'react';
import { useNow } from '../../../hooks/useNow';
import { useProgressAnimation } from '../../../hooks/useProgressAnimation';
import { useAppSelector } from '../../../store';

export default function ProgressBlock({
  startTick,
  durationTicks,
  current,
  max,
  label,
  startsAt,
  endsAt,
}: {
  startTick?: number;
  durationTicks?: number;
  current?: number;
  max?: number;
  label?: string;
  startsAt?: string;
  endsAt?: string;
}) {
  const tickBroadcast = useAppSelector((s) => s.sync.tickBroadcast);
  const now = useNow(1000);

  const isTickMode = startTick != null && durationTicks != null;
  const isTimestampMode = !isTickMode && startsAt != null && endsAt != null;

  let pct: number;
  let remainingMs: number;

  if (isTickMode) {
    if (tickBroadcast && durationTicks! > 0) {
      const elapsed = (now - tickBroadcast.receivedAt) / 1000;
      const estimatedTick = tickBroadcast.currentTick + elapsed * tickBroadcast.tickRate;
      pct = Math.min(100, Math.max(0, ((estimatedTick - startTick!) / durationTicks!) * 100));
      const remainingTicks = Math.max(0, startTick! + durationTicks! - estimatedTick);
      remainingMs = (remainingTicks / tickBroadcast.tickRate) * 1000;
    } else {
      pct = 0;
      remainingMs = Infinity;
    }
  } else if (isTimestampMode) {
    const startMs = Date.parse(startsAt!);
    const endMs = Date.parse(endsAt!);
    const duration = endMs - startMs;
    pct = duration > 0 ? Math.min(100, Math.max(0, ((now - startMs) / duration) * 100)) : 0;
    remainingMs = Math.max(0, endMs - now);
  } else {
    const cur = current ?? 0;
    const mx = max ?? 100;
    pct = mx > 0 ? Math.min(100, (cur / mx) * 100) : 0;
    remainingMs = Infinity;
  }

  const resetKey = useMemo(() => {
    if (isTickMode) return `tick-${startTick}-${durationTicks}`;
    if (isTimestampMode) return startsAt;
    return undefined;
  }, [isTickMode, isTimestampMode, startTick, durationTicks, startsAt]);

  const isComplete = pct >= 100;
  const fillStyle = useProgressAnimation(pct, remainingMs, resetKey);

  return (
    <div className="gm-progress-block">
      {label && <div className="gm-progress-label">{label}</div>}
      <div className="gm-progress-track">
        <div
          className={`gm-progress-fill ${isComplete ? 'gm-progress-complete' : ''}`}
          style={fillStyle}
        />
        <span className="gm-progress-text">
          {isComplete ? 'Complete!' : `${Math.round(pct)}%`}
        </span>
      </div>
    </div>
  );
}
