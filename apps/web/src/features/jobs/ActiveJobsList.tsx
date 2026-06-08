import { useMemo, useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllActiveJobs } from '../../hooks/useSyncSelectors';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../tick';
import { useModal } from '../../context/ModalContext';
import { useAppSelector, useAppDispatch } from '../../store';
import { applyPatches } from '../../store/syncSlice';
import { api } from '../../services/api';
import type { DeltaResponse } from '../../services/api';
import { EmptyState } from '../../components/ui';
import ItemQty from '../../components/ItemQty';

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

interface SkipCost {
  type: string;
  id: string;
  amount: number;
}

interface SkipInfo {
  skipable: boolean;
  skipCost: SkipCost[];
  skipType?: string;
}

function computeCurrentCosts(
  baseCosts: SkipCost[],
  skipType: string | undefined,
  remainingMs: number,
  totalMs: number,
): SkipCost[] {
  if (skipType !== 'scaling' || totalMs <= 0 || remainingMs <= 0) {
    return baseCosts;
  }
  const multiplier = remainingMs / totalMs;
  return baseCosts.map((c) => ({
    ...c,
    amount: multiplier < 1 ? Math.max(1, Math.ceil(c.amount * multiplier)) : c.amount,
  }));
}

function SkipCostChip({ cost, affordable }: { cost: SkipCost; affordable: boolean }) {
  const currencyDefs = useAppSelector((s) => (s.game as any).currencyDefs ?? []);
  const itemDefs = useAppSelector((s) => (s.game as any).itemDefs ?? []);

  const iconKey = useMemo(() => {
    if (cost.type === 'currency') {
      const def = currencyDefs.find((d: any) => d.id === cost.id);
      return def?.iconKey ?? cost.id;
    }
    if (cost.type === 'item') {
      const def = itemDefs.find((d: any) => d.id === cost.id);
      return def?.iconKey ?? cost.id;
    }
    return cost.id;
  }, [cost, currencyDefs, itemDefs]);

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border transition-opacity ${
        affordable
          ? 'border-[rgba(6,182,212,0.4)] bg-[rgba(6,182,212,0.08)] text-[#67e8f9]'
          : 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-text-secondary opacity-50'
      }`}
    >
      <ItemQty src={iconKey} amount={cost.amount} size={11} />
    </span>
  );
}

function SkipCostEntry({ cost }: { cost: SkipCost }) {
  const currencyDefs = useAppSelector((s) => (s.game as any).currencyDefs ?? []);
  const itemDefs = useAppSelector((s) => (s.game as any).itemDefs ?? []);

  const iconKey = useMemo(() => {
    if (cost.type === 'currency') {
      const def = currencyDefs.find((d: any) => d.id === cost.id);
      return def?.iconKey ?? cost.id;
    }
    if (cost.type === 'item') {
      const def = itemDefs.find((d: any) => d.id === cost.id);
      return def?.iconKey ?? cost.id;
    }
    return cost.id;
  }, [cost, currencyDefs, itemDefs]);

  return <ItemQty src={iconKey} amount={cost.amount} size={13} />;
}

interface ActiveJobRowProps {
  job: any;
  remainingMs: number;
  totalMs: number;
  progressPct: number;
  compact?: boolean;
  onClick: () => void;
  onSkip?: () => void;
  skipBaseCosts?: SkipCost[];
  skipType?: string;
}

export function ActiveJobRow({
  job,
  remainingMs,
  totalMs,
  progressPct,
  compact,
  onClick,
  onSkip,
  skipBaseCosts,
  skipType,
}: ActiveJobRowProps) {
  const isReady = remainingMs <= 0;
  const icon = JOB_ICON[job.type] ?? '⏱️';
  const label = JOB_LABEL[job.type] ?? job.type;
  const color = JOB_COLOR[job.type] ?? '#8b5cf6';
  const timeLabel = isReady ? null : formatTimeLeft(remainingMs);
  const showSkipButton = !!onSkip && !isReady;

  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);

  const currentCosts = useMemo(() => {
    if (!skipBaseCosts || skipBaseCosts.length === 0 || isReady) return [];
    return computeCurrentCosts(skipBaseCosts, skipType, remainingMs, totalMs);
  }, [skipBaseCosts, skipType, remainingMs, totalMs, isReady]);

  const canAfford = useMemo(
    () =>
      currentCosts.every((c) => {
        if (c.type !== 'currency') return true;
        return (Number(currencyBalances[c.id] ?? 0)) >= c.amount;
      }),
    [currentCosts, currencyBalances],
  );

  // In compact mode (home-page widget) chips and the skip button are intentionally
  // suppressed — compact rows are a quick-glance summary only. Full skip interaction
  // belongs on the dedicated ActiveJobsPage (non-compact).
  const showCostChips = currentCosts.length > 0 && !isReady && !compact;

  return (
    <div
      className={`relative flex items-center border-t border-[rgba(139,92,246,0.1)] ${isReady ? 'bg-[rgba(16,185,129,0.06)]' : ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`flex-1 min-w-0 text-left flex items-center gap-3 pl-4 ${showSkipButton && !compact ? 'pr-2' : 'pr-4'} ${compact ? 'py-2' : 'py-2.5'} hover:bg-[rgba(139,92,246,0.06)] transition-colors`}
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
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {showCostChips && (
                <div className="flex items-center gap-1">
                  {currentCosts.map((c, i) => (
                    <SkipCostChip key={`${c.id}-${i}`} cost={c} affordable={canAfford} />
                  ))}
                </div>
              )}
              {isReady ? (
                <span className="bg-[rgba(16,185,129,0.2)] text-[#6ee7b7] text-[10px] font-extrabold px-2 py-0.5 rounded-md tracking-wide">
                  READY
                </span>
              ) : timeLabel ? (
                <span className="text-[11px] font-bold text-text-secondary whitespace-nowrap">
                  {timeLabel}
                </span>
              ) : null}
            </div>
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

      {showSkipButton && !compact && (
        <div className="pr-4 pl-1 flex-shrink-0 self-center">
          <button
            type="button"
            onClick={onSkip}
            className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-[rgba(6,182,212,0.4)] text-[#67e8f9] bg-[rgba(6,182,212,0.08)] hover:bg-[rgba(6,182,212,0.18)] transition-colors whitespace-nowrap"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

interface SkipConfirmState {
  jobId: string;
  skipCost: SkipCost[];
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
  const dispatch = useAppDispatch();
  const allActiveJobs = useAllActiveJobs();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const cursor = useAppSelector((s) => s.sync.cursor);

  const [skipInfoMap, setSkipInfoMap] = useState<Map<string, SkipInfo>>(new Map());
  const [confirmSkip, setConfirmSkip] = useState<SkipConfirmState | null>(null);
  const [skipExecuting, setSkipExecuting] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  // Prefetch skipInfo for every DustingJob so the button is only shown when actually skipable.
  useEffect(() => {
    const dustingJobs = (allActiveJobs as any[]).filter(
      (j) => j.type === 'DustingJob' && !skipInfoMap.has(j.id),
    );
    if (dustingJobs.length === 0) return;

    for (const j of dustingJobs) {
      api
        .getJob(j.id)
        .then((detail: any) => {
          const si: SkipInfo | undefined = detail?.skipInfo;
          if (si?.skipable) {
            setSkipInfoMap((prev) => {
              const next = new Map(prev);
              next.set(j.id, si);
              return next;
            });
          }
        })
        .catch(() => {
          // If fetch fails, skip button simply won't appear — safe no-op.
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allActiveJobs]);

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
        return { ...j, remainingMs, totalMs, progressPct };
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
      onBeforeNavigate?.();
      if (j.type === 'CraftingJob') {
        const craftLoc = j.data?.locationId || j.locationId;
        navigate(craftLoc ? `/locations/${craftLoc}/workshop` : '/crafting');
      } else {
        navigate(JOB_SCREEN[j.type] ?? '/');
      }
    },
    [pushModal, navigate, onBeforeNavigate],
  );

  const handleSkipClick = useCallback((jobId: string) => {
    const si = skipInfoMap.get(jobId);
    if (!si?.skipable) return;
    setSkipError(null);
    setConfirmSkip({ jobId, skipCost: si.skipCost ?? [] });
  }, [skipInfoMap]);

  const handleConfirmSkip = useCallback(async () => {
    if (!confirmSkip) return;
    setSkipExecuting(true);
    setSkipError(null);
    try {
      await api.skipJob(confirmSkip.jobId);
      setConfirmSkip(null);
      // Fetch the latest delta so the job list reflects the skipped state immediately
      // without waiting for the next SSE tick.
      if (cursor) {
        try {
          const delta = await api.fetchDelta(cursor);
          if ('patches' in delta) {
            dispatch(applyPatches({ patches: (delta as DeltaResponse).patches, cursor: (delta as DeltaResponse).to }));
          }
        } catch {
          // SSE will catch up if delta fetch fails.
        }
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Could not skip. Please try again.';
      setSkipError(typeof msg === 'string' ? msg : 'Could not skip. Please try again.');
    } finally {
      setSkipExecuting(false);
    }
  }, [confirmSkip, cursor, dispatch]);

  const handleCancelSkip = useCallback(() => {
    setConfirmSkip(null);
    setSkipError(null);
  }, []);

  if (displayed.length === 0 && showEmpty) {
    return <EmptyState message={emptyMessage ?? 'No active jobs'} />;
  }

  if (displayed.length === 0) return null;

  return (
    <div>
      {displayed.map((j: any) => {
        const si = skipInfoMap.get(j.id);
        return (
          <ActiveJobRow
            key={j.id}
            job={j}
            remainingMs={j.remainingMs}
            totalMs={j.totalMs}
            progressPct={j.progressPct}
            compact={compact}
            onClick={() => handleJobClick(j)}
            onSkip={si?.skipable ? () => handleSkipClick(j.id) : undefined}
            skipBaseCosts={si?.skipable ? si.skipCost : undefined}
            skipType={si?.skipType}
          />
        );
      })}

      {confirmSkip && (
        <div className="mx-4 mt-2 mb-1 rounded-xl border border-[rgba(6,182,212,0.3)] bg-[rgba(6,182,212,0.07)] px-4 py-3 flex flex-col gap-2.5">
          <p className="text-[12px] font-bold text-[#e2d9ff]">Skip dusting early?</p>

          {confirmSkip.skipCost.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-text-secondary uppercase tracking-wider">Cost</p>
              <div className="flex flex-wrap gap-2">
                {confirmSkip.skipCost.map((c, i) => (
                  <SkipCostEntry key={`${c.id}-${i}`} cost={c} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-text-secondary">No cost — skip instantly.</p>
          )}

          {skipError && (
            <p className="text-[11px] text-red-400">{skipError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={skipExecuting}
              onClick={handleConfirmSkip}
              className="flex-1 text-[12px] font-bold py-1.5 rounded-lg bg-[rgba(6,182,212,0.2)] border border-[rgba(6,182,212,0.4)] text-[#67e8f9] hover:bg-[rgba(6,182,212,0.3)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {skipExecuting ? 'Skipping…' : 'Confirm Skip'}
            </button>
            <button
              type="button"
              disabled={skipExecuting}
              onClick={handleCancelSkip}
              className="flex-1 text-[12px] font-bold py-1.5 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-text-secondary hover:bg-[rgba(255,255,255,0.09)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
