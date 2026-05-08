import { useCurrentTick } from '../tick';
import { createCountdownTimer } from '../tick/TickTimer';

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

  const trackBase = 'relative w-full bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.25)] overflow-hidden';
  const clickableClass = handleClick ? ' cursor-pointer active:scale-[0.98]' : '';
  const fillClass = isReady
    ? 'absolute top-0 left-0 h-full [background:linear-gradient(90deg,#059669,#10B981)] rounded-[inherit] transition-[width] duration-500 [transition-timing-function:ease]'
    : 'absolute top-0 left-0 h-full [background:linear-gradient(90deg,#d97706,#f59e0b)] rounded-[inherit] transition-[width] duration-500 [transition-timing-function:ease]';

  if (compact) {
    return (
      <div className="mb-1.5">
        <div
          className={`${trackBase} h-6 rounded-lg${clickableClass}`}
          onClick={handleClick}
        >
          <div className={fillClass} style={{ width: `${isReady ? 100 : progress}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-[12px] font-extrabold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] z-[1] whitespace-nowrap overflow-hidden text-ellipsis px-2">
            {isReady
              ? `${name} ${actionLabel} ready`
              : `🔨 ${name} — ${formatCountdown(remainingMs)}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className={`${trackBase} h-9 rounded-[10px]${clickableClass}`}
        onClick={handleClick}
      >
        <div className={fillClass} style={{ width: `${isReady ? 100 : progress}%` }} />
        <span className="absolute inset-0 flex items-center justify-center text-[16px] font-black text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] z-[1] whitespace-nowrap overflow-hidden text-ellipsis px-2 [font-variant-numeric:tabular-nums]">
          {isReady
            ? `Tap to complete ${actionLabel}!`
            : formatCountdown(remainingMs)}
        </span>
      </div>
    </div>
  );
}
