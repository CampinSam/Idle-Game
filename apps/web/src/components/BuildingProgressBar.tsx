import { useCurrentTick } from '../tick';
import { createCountdownTimer } from '../tick/TickTimer';
import './BuildingProgressBar.css';

function formatCountdown(ms: number): string {
  if (ms <= 0) return '';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface BuildingProgressBarProps {
  name: string;
  startTick: number;
  durationTicks: number;
  tickRate: number;
  isUpgrade?: boolean;
  onComplete?: () => void;
  compact?: boolean;
}

export default function BuildingProgressBar({
  name,
  startTick,
  durationTicks,
  tickRate,
  isUpgrade = false,
  onComplete,
  compact = false,
}: BuildingProgressBarProps) {
  const currentTick = useCurrentTick();
  const timer = createCountdownTimer({ startTick, durationTicks });
  const remainingTicks = timer.getValue(currentTick);
  const remainingMs = tickRate > 0 ? (remainingTicks / tickRate) * 1000 : Infinity;
  const isReady = remainingMs <= 0;

  const elapsed = durationTicks > 0 ? Math.max(0, durationTicks - remainingTicks) : 0;
  const progress = durationTicks > 0 ? Math.min(100, (elapsed / durationTicks) * 100) : 100;

  const actionLabel = isUpgrade ? 'upgrade' : 'construction';

  const handleClick = isReady && onComplete ? onComplete : undefined;
  const clickableClass = handleClick ? ' clickable' : '';

  if (compact) {
    return (
      <div className="building-progress-compact">
        <div className={`building-progress-track${clickableClass}`} onClick={handleClick}>
          <div
            className={`building-progress-fill ${isReady ? 'ready' : ''}`}
            style={{ width: `${isReady ? 100 : progress}%` }}
          />
          <span className="building-progress-text">
            {isReady
              ? `${name} ${actionLabel} ready`
              : `🔨 ${name} — ${formatCountdown(remainingMs)}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="building-progress-bar">
      <div className={`building-progress-track large${clickableClass}`} onClick={handleClick}>
        <div
          className={`building-progress-fill ${isReady ? 'ready' : ''}`}
          style={{ width: `${isReady ? 100 : progress}%` }}
        />
        <span className="building-progress-text">
          {isReady
            ? `Tap to complete ${actionLabel}!`
            : formatCountdown(remainingMs)}
        </span>
      </div>
    </div>
  );
}
