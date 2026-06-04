import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllActiveJobs } from '../../hooks/useSyncSelectors';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../tick';
import { useModal } from '../../context/ModalContext';
import { api } from '../../services/api';
import { EmptyState } from '../../components/ui';

const JOB_ICON: Record<string, string> = {
  MissionJob: '🗺️',
  CraftingJob: '⚒️',
  BuildingJob: '🏗️',
  DustingJob: '✨',
};

const JOB_LABEL: Record<string, string> = {
  MissionJob: 'Mission',
  CraftingJob: 'Crafting',
  BuildingJob: 'Building',
  DustingJob: 'Dusting',
};

const JOB_COLOR: Record<string, string> = {
  MissionJob: '#8b5cf6',
  CraftingJob: '#f59e0b',
  BuildingJob: '#f97316',
  DustingJob: '#06b6d4',
};

const JOB_SCREEN: Record<string, string> = {
  MissionJob: '/missions',
  CraftingJob: '/crafting',
  BuildingJob: '/locations',
  DustingJob: '/inventory',
};

function formatTimeLeft(ms: number): string | null {
  if (ms <= 0) return null;
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface ActiveJobRowProps {
  job: any;
  remainingMs: number;
  progressPct: number;
  compact?: boolean;
  onClick: () => void;
}

export function ActiveJobRow({ job, remainingMs, progressPct, compact, onClick }: ActiveJobRowProps) {
  const isReady = remainingMs <= 0;
  const icon = JOB_ICON[job.type] ?? '⏱️';
  const label = JOB_LABEL[job.type] ?? job.type;
  const color = JOB_COLOR[job.type] ?? '#8b5cf6';
  const timeLabel = isReady ? null : formatTimeLeft(remainingMs);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 ${compact ? 'py-2' : 'py-2.5'} border-t border-[rgba(139,92,246,0.1)] hover:bg-[rgba(139,92,246,0.06)] transition-colors ${isReady ? 'bg-[rgba(16,185,129,0.06)]' : ''}`}
    >
      <div
        className={`flex items-center justify-center ${compact ? 'w-7 h-7 text-base' : 'w-[34px] h-[34px] text-xl'} rounded-lg flex-shrink-0`}
        style={{ background: `${color}22` }}
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`${compact ? 'text-[12px]' : 'text-[13px]'} font-bold text-[#e2d9ff] capitalize truncate`}>
            {job.name || label}
          </span>
          {isReady ? (
            <span className="flex-shrink-0 bg-[rgba(16,185,129,0.2)] text-[#6ee7b7] text-[10px] font-extrabold px-2 py-0.5 rounded-md tracking-wide">
              READY
            </span>
          ) : timeLabel ? (
            <span className="flex-shrink-0 text-[11px] font-bold text-text-secondary whitespace-nowrap">
              {timeLabel}
            </span>
          ) : null}
        </div>

        <div className={`w-full ${compact ? 'h-1' : 'h-1.5'} rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden`}>
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{
              width: `${progressPct}%`,
              background: isReady
                ? 'linear-gradient(90deg, #059669, #10b981)'
                : `linear-gradient(90deg, ${color}99, ${color})`,
            }}
          />
        </div>

        {!compact && (
          <span className="text-[10px] text-text-secondary uppercase tracking-wider">{label}</span>
        )}
      </div>
    </button>
  );
}

interface ActiveJobsListProps {
  limit?: number;
  compact?: boolean;
  emptyMessage?: string;
  showEmpty?: boolean;
  onBeforeNavigate?: () => void;
}

export function ActiveJobsList({
  limit,
  compact,
  emptyMessage,
  showEmpty = true,
  onBeforeNavigate,
}: ActiveJobsListProps) {
  const { pushModal } = useModal();
  const navigate = useNavigate();
  const allActiveJobs = useAllActiveJobs();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();

  const getRemaining = useCallback(
    (j: any): number => {
      if (j.startTick == null || j.durationTicks == null) return Infinity;
      const timer = createCountdownTimer({ startTick: j.startTick, durationTicks: j.durationTicks });
      return timer.getRemainingMs(currentTick, tickRate);
    },
    [currentTick, tickRate],
  );

  const sortedJobs = useMemo(() => {
    return allActiveJobs
      .map((j: any) => {
        const remainingMs = getRemaining(j);
        const totalMs =
          j.durationTicks != null && tickRate > 0 ? (Number(j.durationTicks) / tickRate) * 1000 : 0;
        const progressPct =
          remainingMs <= 0
            ? 100
            : totalMs > 0
            ? Math.min(100, Math.max(0, (1 - remainingMs / totalMs) * 100))
            : 0;
        return { ...j, remainingMs, progressPct };
      })
      .sort((a: any, b: any) => {
        const aReady = a.remainingMs <= 0;
        const bReady = b.remainingMs <= 0;
        if (aReady && !bReady) return -1;
        if (!aReady && bReady) return 1;
        const aMs = a.remainingMs === Infinity ? Number.MAX_SAFE_INTEGER : a.remainingMs;
        const bMs = b.remainingMs === Infinity ? Number.MAX_SAFE_INTEGER : b.remainingMs;
        return aMs - bMs;
      });
  }, [allActiveJobs, getRemaining, tickRate]);

  const displayed = limit != null ? sortedJobs.slice(0, limit) : sortedJobs;

  const handleJobClick = useCallback(
    async (j: any) => {
      if (j.type === 'CraftingJob') {
        const craftLoc = j.data?.locationId || j.locationId;
        onBeforeNavigate?.();
        navigate(craftLoc ? `/locations/${craftLoc}/workshop` : '/crafting');
        return;
      }
      try {
        const spec = await api.getModalSpec({ jobId: j.id });
        if (spec?.version === 1) {
          onBeforeNavigate?.();
          pushModal(spec);
          return;
        }
      } catch {
        // fall through to screen navigation
      }
      const screen = JOB_SCREEN[j.type] ?? '/';
      onBeforeNavigate?.();
      navigate(screen);
    },
    [pushModal, navigate, onBeforeNavigate],
  );

  if (displayed.length === 0 && showEmpty) {
    return <EmptyState message={emptyMessage ?? 'No active jobs'} />;
  }

  if (displayed.length === 0) return null;

  return (
    <div>
      {displayed.map((j: any) => (
        <ActiveJobRow
          key={j.id}
          job={j}
          remainingMs={j.remainingMs}
          progressPct={j.progressPct}
          compact={compact}
          onClick={() => handleJobClick(j)}
        />
      ))}
    </div>
  );
}
