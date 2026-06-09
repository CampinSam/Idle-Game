import { useNow } from '../../../hooks/useNow';
import { useProgressAnimation } from '../../../hooks/useProgressAnimation';

export default function ProgressBlock({
  current,
  max,
  label,
  startsAt,
  endsAt,
}: {
  current: number;
  max: number;
  label?: string;
  startsAt?: string;
  endsAt?: string;
}) {
  const now = useNow(1000);

  let pct: number;
  let remainingMs: number;
  if (startsAt && endsAt) {
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);
    const duration = endMs - startMs;
    pct = duration > 0 ? Math.min(100, Math.max(0, ((now - startMs) / duration) * 100)) : 0;
    remainingMs = Math.max(0, endMs - now);
  } else {
    pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
    remainingMs = Infinity;
  }

  const isComplete = pct >= 100;
  const fillStyle = useProgressAnimation(pct, remainingMs, startsAt);

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
