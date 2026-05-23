import { useNow } from '../../../hooks/useNow';

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
  if (startsAt && endsAt) {
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);
    const duration = endMs - startMs;
    pct = duration > 0 ? Math.min(100, Math.max(0, ((now - startMs) / duration) * 100)) : 0;
  } else {
    pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  }

  const isComplete = pct >= 100;

  return (
    <div className="gm-progress-block">
      {label && <div className="gm-progress-label">{label}</div>}
      <div className="gm-progress-track">
        <div
          className={`gm-progress-fill ${isComplete ? 'gm-progress-complete' : ''}`}
          style={{ width: `${pct}%` }}
        />
        <span className="gm-progress-text">
          {isComplete ? 'Complete!' : `${Math.round(pct)}%`}
        </span>
      </div>
    </div>
  );
}
