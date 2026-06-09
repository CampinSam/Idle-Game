import { useMemo } from 'react';
import { createCountdownTimer } from '../tick/TickTimer';
import { useCurrentTick } from '../tick/TickEngine';
import { useTickRemainingMs } from '../tick/useTickValue';

function fmtMs(ms: number): string {
  if (ms <= 0 || !isFinite(ms)) return '';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export interface JobProgressBarProps {
  label?: string;

  startTick?: number;
  durationTicks?: number;

  progressPct?: number;
  remainingMs?: number;

  color?: string;
  compact?: boolean;
  variant?: 'bar' | 'pill';

  readyLabel?: string;

  actionLabel?: string;
  readyActionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;

  /**
   * When false, only the fill bar is rendered — the label/countdown/action
   * row is suppressed. Use this when the caller already shows the job name
   * and time in its own row layout (e.g. ActiveJobRow).
   */
  showMeta?: boolean;
}

export default function JobProgressBar({
  label,
  startTick,
  durationTicks,
  progressPct: progressPctProp,
  remainingMs: remainingMsProp,
  color = '#8b5cf6',
  compact = false,
  variant = 'bar',
  readyLabel = 'READY',
  actionLabel,
  readyActionLabel,
  onAction,
  actionDisabled = false,
  showMeta = true,
}: JobProgressBarProps) {
  const currentTick = useCurrentTick();

  const timer = useMemo(
    () =>
      startTick != null && durationTicks != null
        ? createCountdownTimer({ startTick, durationTicks })
        : null,
    [startTick, durationTicks],
  );

  const tickRemainingMs = useTickRemainingMs(timer);

  const resolvedRemainingMs = remainingMsProp ?? tickRemainingMs;
  const isReady = resolvedRemainingMs <= 0;

  let fillPct: number;
  if (progressPctProp != null) {
    fillPct = isReady ? 100 : progressPctProp;
  } else if (timer != null && durationTicks != null && durationTicks > 0) {
    const remainingTicks = timer.getValue(currentTick);
    const elapsed = Math.max(0, durationTicks - remainingTicks);
    fillPct = isReady ? 100 : Math.min(100, (elapsed / durationTicks) * 100);
  } else {
    fillPct = isReady ? 100 : 0;
  }

  const countdownText = fmtMs(resolvedRemainingMs);
  const showActionBtn = isReady
    ? !!readyActionLabel && !!onAction
    : !!actionLabel && !!onAction;
  const currentActionLabel = isReady ? readyActionLabel : actionLabel;

  // ─── Pill variant (replaces BuildingProgressBar) ──────────────────────────
  if (variant === 'pill') {
    const pillText = compact
      ? isReady
        ? readyLabel
        : `🔨 ${label ?? ''} — ${countdownText}`
      : isReady
      ? readyLabel
      : countdownText;
    const isClickable = isReady && !!onAction && !actionDisabled;

    return (
      <div className={compact ? 'mb-1.5' : 'flex flex-col items-center'}>
        <div
          className={[
            'relative w-full overflow-hidden',
            'bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.25)]',
            compact ? 'h-6 rounded-lg' : 'h-9 rounded-[10px]',
            isClickable ? 'cursor-pointer active:scale-[0.98]' : '',
          ].join(' ')}
          onClick={isClickable ? onAction : undefined}
        >
          <div
            className={[
              'absolute top-0 left-0 h-full rounded-[inherit]',
              'transition-[width] duration-500 ease-out',
              isReady
                ? '[background:linear-gradient(90deg,#059669,#10B981)]'
                : '[background:linear-gradient(90deg,#d97706,#f59e0b)]',
            ].join(' ')}
            style={{ width: `${fillPct}%` }}
          />
          <span
            className={[
              'absolute inset-0 flex items-center justify-center',
              'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] z-[1]',
              'whitespace-nowrap overflow-hidden text-ellipsis px-2',
              compact
                ? 'text-[12px] font-extrabold'
                : 'text-[16px] font-black [font-variant-numeric:tabular-nums]',
            ].join(' ')}
          >
            {pillText}
          </span>
        </div>
      </div>
    );
  }

  // ─── Bar variant (default) ────────────────────────────────────────────────
  const barH = compact ? 'h-1' : 'h-1.5';
  const fillBg = isReady
    ? 'linear-gradient(90deg, #059669, #10b981)'
    : `linear-gradient(90deg, ${color}99, ${color})`;

  return (
    <div className="flex flex-col gap-1 w-full">
      {showMeta && (
        <div className="flex items-center justify-between gap-2">
          {label != null && (
            <span
              className={[
                'font-bold text-text-primary truncate',
                compact ? 'text-[11px]' : 'text-[12px]',
              ].join(' ')}
            >
              {label}
            </span>
          )}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            {isReady ? (
              <span className="bg-[rgba(16,185,129,0.2)] text-[#6ee7b7] text-[10px] font-extrabold px-2 py-0.5 rounded-md tracking-wide whitespace-nowrap">
                {readyLabel}
              </span>
            ) : countdownText ? (
              <span className="text-[11px] font-bold text-text-secondary whitespace-nowrap tabular-nums">
                {countdownText}
              </span>
            ) : null}
            {showActionBtn && (
              <button
                type="button"
                onClick={onAction}
                disabled={actionDisabled}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-[rgba(167,139,250,0.4)] text-[#c4b5fd] bg-[rgba(139,92,246,0.08)] hover:bg-[rgba(139,92,246,0.18)] transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {currentActionLabel}
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`w-full ${barH} rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden`}>
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${fillPct}%`, background: fillBg }}
        />
      </div>
    </div>
  );
}
