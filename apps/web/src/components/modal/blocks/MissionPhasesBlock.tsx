import type { ModalBlockMissionPhases } from '@derp/shared';
import { useNow } from '../../../hooks/useNow';

function formatDurationTicks(ticks: number, tickRate: number): string {
  const seconds = tickRate > 0 ? Math.round(ticks / tickRate) : 0;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'Done';
  const totalSec = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MissionPhasesBlock({ block }: { block: ModalBlockMissionPhases }) {
  const {
    currentPhaseIndex,
    totalPhases,
    phaseResults,
    currentPhaseSuccesses,
    phases,
    tickRate,
    timerEndsAt,
  } = block;

  const now = useNow(1000);
  const timerEndMs = timerEndsAt ? Date.parse(timerEndsAt) : null;
  const remainingMs = timerEndMs != null ? Math.max(0, timerEndMs - now) : null;

  if (phases.length === 0) return null;

  const resultByIndex = new Map(phaseResults.map((r) => [r.phaseIndex, r]));

  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2">
      <div className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">
        Phase Overview
      </div>

      <div className="flex flex-col gap-1">
        {phases.map((phase, i) => {
          const result = resultByIndex.get(i);
          const isCompleted = result != null;
          const isCurrent = i === currentPhaseIndex && !isCompleted;
          const isUpcoming = !isCompleted && !isCurrent;

          const durationLabel = formatDurationTicks(phase.durationTicks, tickRate);
          const countLabel = (phase.count ?? 1) > 1 ? ` × ${phase.count}` : '';
          const phaseLabel = phase.label ? phase.label : `Phase ${i + 1}`;

          return (
            <div
              key={i}
              className={[
                'flex items-center gap-2 px-2 py-1.5 rounded-lg',
                isCurrent
                  ? 'bg-[rgba(139,92,246,0.1)] border border-[rgba(139,92,246,0.4)]'
                  : isCompleted
                  ? 'bg-white/[0.03] border border-white/[0.05]'
                  : 'bg-transparent border border-transparent',
              ].join(' ')}
            >
              {/* Status dot */}
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                {isCompleted ? (
                  result!.success ? (
                    <span className="text-emerald-400 text-[13px] font-bold">✓</span>
                  ) : (
                    <span className="text-red-400 text-[13px] font-bold">✗</span>
                  )
                ) : isCurrent ? (
                  <span className="text-[#a78bfa] text-[11px] font-bold">▶</span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20 inline-block" />
                )}
              </span>

              {/* Phase name + duration */}
              <div className="flex-1 min-w-0">
                <span
                  className={[
                    'text-[12px] font-semibold',
                    isUpcoming
                      ? 'text-text-secondary'
                      : isCurrent
                      ? 'text-text-primary'
                      : result?.success
                      ? 'text-emerald-300/80'
                      : 'text-red-300/80',
                  ].join(' ')}
                >
                  {phaseLabel}
                </span>
                <span className="text-[11px] text-text-secondary ml-1.5">
                  {durationLabel}{countLabel}
                </span>
              </div>

              {/* Right-side detail */}
              <div className="flex-shrink-0 text-right">
                {isCurrent && (phase.count ?? 1) > 1 ? (
                  <span className="text-[11px] font-bold text-[#a78bfa] tabular-nums">
                    {currentPhaseSuccesses} / {phase.count}
                  </span>
                ) : isCurrent && remainingMs != null && remainingMs > 0 ? (
                  <span className="text-[11px] font-bold text-[#a78bfa] tabular-nums">
                    {formatCountdown(remainingMs)}
                  </span>
                ) : isCompleted ? (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      result!.success ? 'text-emerald-400/60' : 'text-red-400/60'
                    }`}
                  >
                    {result!.success ? 'Done' : 'Failed'}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
