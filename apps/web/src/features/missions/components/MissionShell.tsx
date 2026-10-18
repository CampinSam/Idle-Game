import { ReactNode, useState, useEffect, useMemo, useCallback } from 'react';
import { ANTI_WHALE_CAPS } from '@derp/shared';
import { Card, EmptyState, SectionHeader } from '../../../components/ui';
import JobProgressBar from '../../../components/JobProgressBar';
import { api } from '../../../services/api';
import { useCommand } from '../../../hooks/useCommand';
import { useModal } from '../../../context/ModalContext';
import { createCountdownTimer } from '../../../tick/TickTimer';
import { useTickRemainingMs } from '../../../tick/useTickValue';

interface MissionShellProps {
  middle: ReactNode;
  activeMissions: any[];
  missionDefs: any[];
  missionHistory: any[];
  profile: any;
  activityCollapsed: boolean;
  onToggleActivity: () => void;
  onOpenJob: (jobId: string) => void;
  onCompleteJob?: (jobId: string) => Promise<void>;
}

interface SkipCost {
  type: string;
  id: string;
  amount: number;
}

interface SkipInfo {
  skipCost: SkipCost[];
  skipType?: string;
}

function PhaseHistoryDots({ phaseResults, totalPhases }: { phaseResults: any[]; totalPhases: number }) {
  if (totalPhases < 2) return null;
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {Array.from({ length: totalPhases }).map((_, i) => {
        const result = phaseResults.find((r: any) => r.phaseIndex === i);
        if (!result) {
          return (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-white/15 flex-shrink-0"
            />
          );
        }
        return (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${result.success ? 'bg-emerald-400' : 'bg-red-400'}`}
            title={`Phase ${i + 1}: ${result.success ? 'Success' : 'Failed'}`}
          />
        );
      })}
    </div>
  );
}

function MissionActiveRow({
  m,
  missionDefs,
  onOpenJob,
  onCompleteJob,
}: {
  m: any;
  missionDefs: any[];
  onOpenJob: (id: string) => void;
  onCompleteJob?: (id: string) => Promise<void>;
}) {
  const { execute } = useCommand();
  const { pushModal } = useModal();

  const def = useMemo(
    () => missionDefs.find((d: any) => d.id === m.defId) ?? null,
    [missionDefs, m.defId],
  );
  const isMultiPhase = def?.mode === 'multi_phase';
  const phases: any[] = useMemo(
    () => (isMultiPhase && Array.isArray(def?.phases) ? def.phases : []),
    [isMultiPhase, def],
  );
  const totalPhases = phases.length;
  const currentPhaseIdx: number = m.currentPhase ?? 0;
  const phaseResults: any[] = Array.isArray(m.phaseResults) ? m.phaseResults : [];
  const lastResult: any | null = phaseResults.length > 0 ? phaseResults[phaseResults.length - 1] : null;

  // Count-based phase progress (e.g. Phase 1 needs 3 successes)
  const currentPhaseDef = phases[currentPhaseIdx] ?? null;
  const phaseCount: number = currentPhaseDef?.count ?? 1;
  const currentSuccesses: number = (m.accumulatedState as any)?.currentPhaseSuccesses ?? 0;

  const isPhaseReady = m.status === 'phase_ready';
  const isReadyNotified = m.status === 'ready_notified';

  const nextPhaseIdx = currentPhaseIdx + 1;
  const hasMorePhases = nextPhaseIdx < totalPhases;

  const timer = useMemo(
    () =>
      m.startTick != null && m.durationTicks != null
        ? createCountdownTimer({ startTick: m.startTick, durationTicks: m.durationTicks })
        : null,
    [m.startTick, m.durationTicks],
  );
  const remainingMs = useTickRemainingMs(timer);
  const isTimerDone = remainingMs <= 0;

  const [skipInfo, setSkipInfo] = useState<SkipInfo | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getJob(m.id)
      .then((detail: any) => {
        const si = detail?.skipInfo;
        if (si?.skipable) {
          setSkipInfo({ skipCost: si.skipCost ?? [], skipType: si.skipType });
        }
      })
      .catch(() => {});
  }, [m.id]);

  const handleComplete = async () => {
    if (completing || !onCompleteJob) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await onCompleteJob(m.id);
    } catch (err: any) {
      setCompleteError(err?.message ?? 'Failed to complete mission. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  const handleContinue = useCallback(async () => {
    if (deciding) return;
    setDeciding(true);
    setDecideError(null);
    try {
      await execute('ContinueMission', { jobId: m.id });
      if (!hasMorePhases) {
        try {
          const spec = await api.getModalSpec({ jobId: m.id });
          if (spec?.version === 1) pushModal(spec);
        } catch {}
      }
    } catch (err: any) {
      setDecideError(err?.message ?? 'Could not continue. Please try again.');
    } finally {
      setDeciding(false);
    }
  }, [deciding, execute, m.id, hasMorePhases, pushModal]);

  const handleAbandon = useCallback(async () => {
    if (deciding) return;
    setDeciding(true);
    setDecideError(null);
    try {
      await execute('AbandonMission', { jobId: m.id });
    } catch (err: any) {
      setDecideError(err?.message ?? 'Could not abandon. Please try again.');
      setDeciding(false);
    }
  }, [deciding, execute, m.id]);

  const handleSkipClick = () => {
    setConfirmSkip(true);
    setSkipError(null);
  };

  const handleConfirmSkip = async () => {
    setSkipping(true);
    setSkipError(null);
    try {
      await api.skipJob(m.id);
      setConfirmSkip(false);
    } catch (err: any) {
      setSkipError(err?.message ?? 'Could not skip. Please try again.');
      setSkipping(false);
    }
  };

  const handleCancelSkip = () => {
    setConfirmSkip(false);
    setSkipError(null);
  };

  const showSkipButton = !!skipInfo && !isTimerDone && !confirmSkip && !isPhaseReady;

  return (
    <div className="flex flex-col gap-1">
      {/* ── Main row ──────────────────────────────────────────────── */}
      <div
        onClick={() => onOpenJob(m.id)}
        className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[rgba(139,92,246,0.2)] bg-bg-card hover:border-[rgba(139,92,246,0.45)] transition-colors"
      >
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-bold text-text-primary truncate">
              {def?.name ?? m.defId ?? 'Unknown Mission'}
            </span>
            {isMultiPhase && (
              <span className="flex-shrink-0 text-[10px] font-bold text-[#a78bfa] bg-[rgba(139,92,246,0.12)] border border-[rgba(139,92,246,0.25)] rounded px-1.5 py-0.5 whitespace-nowrap">
                {isPhaseReady
                  ? `Phase ${currentPhaseIdx + 1} Done`
                  : isReadyNotified
                  ? 'Complete'
                  : phaseCount > 1
                  ? `Phase ${currentPhaseIdx + 1}/${totalPhases} · ${currentSuccesses}/${phaseCount}`
                  : `Phase ${currentPhaseIdx + 1} / ${totalPhases}`}
              </span>
            )}
          </div>
          {isMultiPhase && totalPhases > 1 && (
            <div className="flex items-center gap-1.5">
              <PhaseHistoryDots phaseResults={phaseResults} totalPhases={totalPhases} />
              {isPhaseReady && lastResult && (
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider ${lastResult.success ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {lastResult.success ? '✓ success' : '✗ failed'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Progress bar — only when a timer is running or expedition is ready to collect */}
        {!isPhaseReady && (
          <div className="flex-shrink-0 w-36" onClick={(e) => e.stopPropagation()}>
            <JobProgressBar
              startTick={m.startTick}
              durationTicks={m.durationTicks}
              color={isReadyNotified ? '#10b981' : '#8b5cf6'}
              compact
              readyLabel={isMultiPhase && m.status === 'active' ? '⟳' : '✅ Ready'}
              actionLabel={showSkipButton ? 'Skip' : undefined}
              readyActionLabel={
                isReadyNotified && onCompleteJob
                  ? completing ? '…' : 'Collect'
                  : undefined
              }
              onAction={
                isReadyNotified
                  ? handleComplete
                  : showSkipButton
                  ? handleSkipClick
                  : undefined
              }
              actionDisabled={completing || skipping || confirmSkip}
            />
          </div>
        )}

        {/* Phase-ready — amber "Decide" pill instead of progress bar */}
        {isPhaseReady && (
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[rgba(245,158,11,0.45)] text-[#fcd34d] bg-[rgba(245,158,11,0.12)] text-[11px] font-bold whitespace-nowrap">
              ⚡ Decide
            </span>
          </div>
        )}
      </div>

      {/* ── Phase decision panel ───────────────────────────────────── */}
      {isPhaseReady && (
        <div
          className="mx-1 px-3 py-2.5 rounded-lg bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.25)] flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] font-semibold text-[#fde68a] leading-snug">
            {hasMorePhases
              ? `Continue to Phase ${nextPhaseIdx + 1} of ${totalPhases}, or abandon the expedition now.`
              : 'All phases complete — collect your expedition rewards.'}
          </p>

          {decideError && (
            <span className="text-[11px] text-[#fca5a5]">⚠ {decideError}</span>
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleContinue}
              disabled={deciding}
              className="flex-1 text-[11px] font-bold py-1.5 rounded-md bg-[rgba(245,158,11,0.2)] border border-[rgba(245,158,11,0.4)] text-[#fcd34d] hover:bg-[rgba(245,158,11,0.32)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deciding
                ? '…'
                : hasMorePhases
                ? `▶ Phase ${nextPhaseIdx + 1}`
                : '✓ Collect Rewards'}
            </button>
            {hasMorePhases && (
              <button
                type="button"
                onClick={handleAbandon}
                disabled={deciding}
                className="flex-1 text-[11px] font-bold py-1.5 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.35)] text-[#fca5a5] hover:bg-[rgba(239,68,68,0.22)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✕ Abandon
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Skip confirm panel ─────────────────────────────────────── */}
      {confirmSkip && (
        <div
          className="mx-1 px-2.5 py-2 rounded-lg bg-[rgba(6,182,212,0.07)] border border-[rgba(6,182,212,0.25)] flex flex-col gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {skipInfo && skipInfo.skipCost.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-text-secondary uppercase tracking-wide">Cost:</span>
              {skipInfo.skipCost.map((c, i) => (
                <span key={i} className="text-[11px] font-bold text-[#67e8f9]">
                  {c.amount} {c.id.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-text-secondary">Skip instantly — no cost.</span>
          )}
          {skipError && (
            <span className="text-[11px] text-[#fca5a5]">⚠ {skipError}</span>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleConfirmSkip}
              disabled={skipping}
              className="flex-1 text-[11px] font-bold py-1 rounded-md bg-[rgba(6,182,212,0.2)] border border-[rgba(6,182,212,0.4)] text-[#67e8f9] hover:bg-[rgba(6,182,212,0.3)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {skipping ? 'Skipping…' : 'Confirm Skip'}
            </button>
            <button
              type="button"
              onClick={handleCancelSkip}
              disabled={skipping}
              className="flex-1 text-[11px] font-bold py-1 rounded-md bg-white/[0.05] border border-white/10 text-text-secondary hover:bg-white/[0.09] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Error states ───────────────────────────────────────────── */}
      {completeError && (
        <div className="px-2 py-1.5 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.35)] text-[#fca5a5] text-[11px] leading-tight">
          ⚠ {completeError}
        </div>
      )}
    </div>
  );
}

export function MissionShell({
  middle,
  activeMissions,
  missionDefs,
  missionHistory,
  profile,
  activityCollapsed,
  onToggleActivity,
  onOpenJob,
  onCompleteJob,
}: MissionShellProps) {
  const hasHistory = missionHistory.length > 0;
  const collapsed = activityCollapsed && hasHistory;
  const maxSlots = ANTI_WHALE_CAPS.maxActiveMissions(profile?.keeperLevel ?? 1);
  const emptyCount = Math.max(0, maxSlots - activeMissions.length);

  return (
    <Card className="mission-surface flex flex-col flex-1 min-h-0 overflow-y-auto touch-pan-y">
      {/* Mission Slots — sticky at top */}
      <section className="flex-shrink-0 p-3 border-b border-white/5">
        <SectionHeader title="Mission Slots" />
        <div className="flex flex-col gap-2">
          {activeMissions.map((m: any) => (
            <MissionActiveRow
              key={m.id}
              m={m}
              missionDefs={missionDefs}
              onOpenJob={onOpenJob}
              onCompleteJob={onCompleteJob}
            />
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <div
              key={`open-slot-${i}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-text-secondary"
            >
              <span className="text-[18px] text-white/30 font-light">＋</span>
              <span className="text-[12px] font-semibold tracking-wide">Mission Available</span>
            </div>
          ))}
        </div>
      </section>

      {/* Categories / mission list — scrollable middle */}
      <div className="flex-shrink-0 p-3">
        {middle}
      </div>

      {/* Mission Activity — sticky at bottom, collapsible */}
      <section className="flex-shrink-0 border-t border-white/5">
        <button
          type="button"
          onClick={() => hasHistory && onToggleActivity()}
          disabled={!hasHistory}
          aria-expanded={!collapsed}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 cursor-pointer disabled:cursor-default hover:bg-white/[0.02] transition-colors"
        >
          <SectionHeader title="Mission Activity" className="mb-0 px-0" />
          {hasHistory && (
            <span className="text-[10px] text-text-secondary" aria-hidden="true">
              {collapsed ? '▼' : '▲'}
            </span>
          )}
        </button>
        {!collapsed && (
          <div className="px-3 pb-3">
            {missionHistory.length === 0 ? (
              <EmptyState message="No mission activity yet." />
            ) : (
              <div className="flex flex-col gap-2">
                {missionHistory.slice(0, 5).map((m: any) => {
                  const histDefId = m.defId ?? m.missionDefId;
                  const histName =
                    missionDefs.find((d: any) => d.id === histDefId)?.name ??
                    histDefId ??
                    'Unknown Mission';
                  const isCompleted = m.status === 'completed';
                  return (
                    <div
                      key={m.id}
                      onClick={() => onOpenJob(m.id)}
                      className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[rgba(139,92,246,0.2)] bg-bg-card hover:border-[rgba(139,92,246,0.45)] transition-colors"
                    >
                      <span className="flex-1 min-w-0 text-[13px] font-bold text-text-primary truncate">
                        {histName}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide border whitespace-nowrap ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}
                      >
                        {isCompleted ? 'Success' : 'Failed'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </Card>
  );
}
