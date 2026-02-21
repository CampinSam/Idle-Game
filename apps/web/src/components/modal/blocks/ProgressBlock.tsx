export default function ProgressBlock({ current, max, label }: { current: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
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
