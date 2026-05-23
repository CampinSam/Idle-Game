import { useEffect, useState, useMemo } from 'react';
import ItemQty from '../../../components/ItemQty';
import { useAppSelector } from '../../../store';
import { useSyncEntities } from '../../../hooks/useSyncSelectors';
import { useCommand } from '../../../hooks/useCommand';
import { useJobPreview } from '../../jobs/useJobPreview';
import { createCountdownTimer, useCurrentTick } from '../../../tick';
import { useTickRemainingMs } from '../../../tick/useTickValue';
import { audioEngine } from '../../../services/AudioEngine';
import { api } from '../../../services/api';
import { useMissionJobStats } from '../hooks/useMissionJobStats';
import { extractTeamSizeBounds } from './missionUtils';
import { ContentDocumentRenderer } from '../../content-document/ContentDocumentRenderer';
import type { ContentDocumentContext, SurfaceContextOverrideRule } from '@derp/shared';

export interface MissionPanelProps {
  mode: 'planning' | 'in_progress' | 'outcome';
  defId?: string;
  selectedDef?: any;
  currentCat?: any;
  missionCategoryDefs?: any[];
  entities?: any[];
  idleEntities?: any[];
  initialSelectedEntities?: string[];
  currencyBalances?: Record<string, number>;
  inventoryItems?: Record<string, any>;
  error?: string;
  jobId?: string;
  onBack?: () => void;
  onMissionStarted?: () => void;
  onClose?: () => void;
}

export function MissionPanel(props: MissionPanelProps) {
  const { onBack, onMissionStarted, onClose } = props;

  const { execute } = useCommand();

  // ── Store slices ──
  const storeEntities = useSyncEntities();
  const storeMissionDefs = useAppSelector((s) => s.game.missionDefs);
  const storeMissionCategoryDefs = useAppSelector((s) => s.game.missionCategoryDefs);
  const storeCurrencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const storeInventoryItems = useAppSelector((s) => s.sync.items);
  const syncJobs: Record<string, any> = useAppSelector((s) => s.sync.jobs);

  // ── Resolve the mission def (always from store for correct displayDef shape) ──
  const propsDefId = props.defId ?? props.selectedDef?.id;
  const syncJob = props.jobId ? syncJobs[props.jobId] : null;
  const activeDefId = propsDefId ?? syncJob?.defId;
  const rawActiveDef = activeDefId ? storeMissionDefs.find((d: any) => d.id === activeDefId) : props.selectedDef ?? null;

  // ── Derive initial mode ──
  const [localMode, setLocalMode] = useState<'planning' | 'in_progress' | 'outcome'>(() => {
    if (props.mode !== 'in_progress') return props.mode;
    if (syncJob?.status === 'completed' || syncJob?.status === 'failed') return 'outcome';
    return 'in_progress';
  });

  // ── Auto-transition to outcome when job completes via SSE ──
  useEffect(() => {
    if (localMode !== 'in_progress') return;
    if (!syncJob) return;
    if (syncJob.status === 'completed' || syncJob.status === 'failed') {
      setLocalMode('outcome');
    }
  }, [localMode, syncJob?.status]);

  // ── Planning state ──
  const [selectedEntities, setSelectedEntities] = useState<string[]>(props.initialSelectedEntities ?? []);
  const [planningError, setPlanningError] = useState(props.error ?? '');
  const [collectLoading, setCollectLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);

  // ── Data sources ──
  const entities = props.entities ?? storeEntities;
  const idleEntities = props.idleEntities ?? entities.filter((e: any) => e.status === 'idle');
  const currencyBalances = props.currencyBalances ?? storeCurrencyBalances;
  const inventoryItems = props.inventoryItems ?? storeInventoryItems;
  const missionCategoryDefs = props.missionCategoryDefs ?? storeMissionCategoryDefs;
  const currentCat =
    props.currentCat ??
    missionCategoryDefs.find((c: any) => c.id === rawActiveDef?.missionCategoryDefId) ??
    null;

  // ── Planning preview ──
  const { preview, loading: previewLoading } = useJobPreview({
    jobType: 'mission',
    defId: localMode === 'planning' && rawActiveDef ? rawActiveDef.id : '',
    entityIds: localMode === 'planning' ? selectedEntities : [],
  });

  // ── Job stats (in_progress / outcome) ──
  const { stats: jobStats, loading: statsLoading } = useMissionJobStats(
    localMode !== 'planning' ? props.jobId : undefined,
  );

  // ── Timer ──
  const startTick = syncJob?.startTick ?? jobStats?.job?.startTick;
  const durationTicks = syncJob?.durationTicks ?? jobStats?.job?.durationTicks;
  const timer =
    startTick != null && durationTicks != null
      ? createCountdownTimer({ startTick, durationTicks })
      : null;
  const currentTick = useCurrentTick();
  const remainingMs = useTickRemainingMs(timer);
  const isReady = remainingMs <= 0;
  const remainingTicks = timer ? timer.getValue(currentTick) : 0;
  const progressPct =
    durationTicks > 0
      ? Math.min(100, Math.max(2, ((durationTicks - remainingTicks) / durationTicks) * 100))
      : 2;

  // ── Stats values ──
  const difficulty =
    localMode === 'planning'
      ? (preview?.mission?.difficulty ?? rawActiveDef?.difficulty ?? 100)
      : (jobStats?.difficulty ?? 0);
  const missionPower =
    localMode === 'planning' ? (preview?.mission?.missionPower ?? 0) : (jobStats?.missionPower ?? 0);
  const successChance =
    localMode === 'planning' ? (preview?.mission?.successChance ?? 0) : (jobStats?.successChance ?? 0);
  const injuryChance =
    localMode === 'planning' ? (preview?.mission?.injuryChance ?? 0) : (jobStats?.injuryChance ?? 0);
  const injuryRate = rawActiveDef?.injuryRate ?? 0;
  const liveSynergy =
    localMode === 'planning' ? (preview?.mission?.synergy ?? null) : (jobStats?.synergy ?? null);
  const powerRatio = missionPower > 0 ? Math.min(1, missionPower / (missionPower + difficulty)) : 0;

  // ── Planning requirements ──
  const localBounds = rawActiveDef ? extractTeamSizeBounds(rawActiveDef.requirements) : { min: 1, max: 4 };
  const teamMin = preview?.mission?.teamMin ?? localBounds.min;
  const teamMax = preview?.mission?.teamMax ?? localBounds.max;

  const missionCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(rawActiveDef?.cost)
    ? rawActiveDef.cost : [];
  const getHaveForEntry = (entry: { type: string; id: string }) =>
    entry.type === 'currency'
      ? (currencyBalances[entry.id] ?? 0)
      : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id)
          .reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
  const canAffordMission = preview != null
    ? (preview.canAfford ?? true)
    : missionCost.every((e) => getHaveForEntry(e) >= e.amount);
  const allReqsMet = preview != null ? (preview.allRequirementsMet ?? false) : true;
  const canStart = !!(
    selectedEntities.length > 0 &&
    selectedEntities.length >= teamMin &&
    selectedEntities.length <= teamMax &&
    allReqsMet &&
    canAffordMission
  );

  const previewRequirements = preview?.requirements ?? [];
  const isSkipable = rawActiveDef?.timer?.skipable ?? false;

  // ── Shared header back handler ──
  const handleBack = onBack ?? onClose;

  // ── Handlers ──
  const handleAutoAssign = () => {
    const auto = idleEntities.slice(0, teamMax).map((e: any) => e.id);
    setSelectedEntities(auto);
  };

  const toggleEntity = (entityId: string) => {
    setSelectedEntities((prev) => {
      if (prev.includes(entityId)) return prev.filter((id) => id !== entityId);
      if (prev.length >= teamMax) return prev;
      return [...prev, entityId];
    });
  };

  const handleStart = async () => {
    if (!rawActiveDef) return;
    setPlanningError('');
    try {
      await execute('StartMission', { defId: rawActiveDef.id, entityIds: selectedEntities });
      audioEngine.play('sfx.mission.start');
      onMissionStarted?.();
    } catch (e: any) {
      audioEngine.play('ui.error');
      setPlanningError(e.message || 'Failed to start mission');
    }
  };

  const handleCollect = async () => {
    if (!props.jobId || collectLoading) return;
    setCollectLoading(true);
    try {
      await execute('CompleteMission', { jobId: props.jobId });
    } catch (e: any) {
      console.error('[MissionPanel] Collect error:', e);
    } finally {
      setCollectLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!props.jobId || skipLoading) return;
    setSkipLoading(true);
    try {
      await api.skipJob(props.jobId);
    } catch (e: any) {
      console.error('[MissionPanel] Skip error:', e);
    } finally {
      setSkipLoading(false);
    }
  };

  const handleRetry = () => {
    setSelectedEntities([]);
    setPlanningError('');
    setLocalMode('planning');
  };

  // ── Document ID per mode ──
  const documentId =
    localMode === 'planning'
      ? 'mission_planning_document'
      : localMode === 'in_progress'
      ? 'mission_active_document'
      : 'mission_outcome_document';

  // ── Base context per mode ──
  const baseContext: ContentDocumentContext =
    localMode === 'planning'
      ? { missionMode: 'planning', teamMode: 'editable', rewardMode: 'preview' }
      : localMode === 'in_progress'
      ? { missionMode: 'in_progress', teamMode: 'locked', rewardMode: 'preview' }
      : { missionMode: 'outcome', teamMode: 'locked', rewardMode: 'actual' };

  // ── Override rules (SSE-driven context transition for in_progress) ──
  const overrideRules: SurfaceContextOverrideRule[] = useMemo(() => {
    if (localMode !== 'in_progress' || !props.jobId) return [];
    return [
      {
        on: 'job.completed',
        jobId: props.jobId,
        apply: { missionMode: 'outcome', teamMode: 'locked', rewardMode: 'actual' },
      },
      {
        on: 'job.failed',
        jobId: props.jobId,
        apply: { missionMode: 'outcome', teamMode: 'locked', rewardMode: 'actual' },
      },
    ];
  }, [localMode, props.jobId]);

  // ── Outcome data ──
  const outcomeSyncJob = syncJob ?? (props.jobId ? syncJobs[props.jobId] : null);
  const results = outcomeSyncJob?.results ?? jobStats?.job?.results ?? null;

  // ── Data bag for block registry ──
  const blockData: Record<string, any> = {
    def: rawActiveDef,
    currentCat,
    missionCategoryDefs,
    onBack: handleBack,
    missionPower,
    difficulty,
    successChance,
    injuryChance,
    injuryRate,
    powerRatio,
    synergy: liveSynergy,
    statsLoading: localMode === 'planning' ? (previewLoading && !preview) : statsLoading,
    previewRequirements,
    previewLoading,
    entities,
    selectedEntities,
    teamMax,
    onToggle: toggleEntity,
    remainingMs,
    progressPct,
    isReady,
    rosterEntities: jobStats?.entities ?? [],
    isSuccess: results?.success ?? false,
    results: localMode !== 'planning' ? results : null,
    narrativeTexts: localMode !== 'planning' ? (results?.texts ?? []) : [],
    rewards: localMode !== 'planning' ? (results?.rewards ?? []) : (preview?.rewards ?? []),
  };

  // ── Loading guard (planning mode only) ──
  if (localMode === 'planning' && (!rawActiveDef || !currentCat)) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center">
        <p className="text-text-secondary text-[13px]">Loading mission…</p>
      </div>
    );
  }

  const outerClass =
    localMode === 'outcome'
      ? 'flex flex-col flex-1 min-h-0 motion-safe:animate-[detail-enter_0.28s_ease-out_both]'
      : 'flex flex-col flex-1 min-h-0 pt-2 motion-safe:animate-[detail-enter_0.28s_ease-out_both]';

  return (
    <div className={outerClass}>
      <div
        key={localMode === 'planning' ? rawActiveDef?.id : localMode}
        className="overflow-hidden rounded-2xl border flex flex-col relative flex-1 min-h-0"
        style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)' }}
      >
        {/* ── Content — rendered via block registry ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ContentDocumentRenderer
            documentId={documentId}
            baseContext={baseContext}
            overrideRules={overrideRules}
            data={blockData}
            className="flex flex-col gap-3 px-4 pt-3 pb-4"
          />
        </div>

        {/* ── Footer: OUTCOME — surface concern ── */}
        {localMode === 'outcome' && (
          <div className="grid grid-cols-2 gap-2 p-3 border-t border-[rgba(139,92,246,0.18)] bg-black/20">
            <button
              onClick={onClose ?? onBack}
              className="px-3 py-2.5 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
            >
              Close
            </button>
            {rawActiveDef && (
              <button
                onClick={handleRetry}
                className="px-3 py-2.5 rounded-xl text-white border border-[rgba(167,139,250,0.55)] bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:brightness-110 cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
              >
                Retry ⚡
              </button>
            )}
          </div>
        )}

        {/* ── Footer: IN_PROGRESS — surface concern ── */}
        {localMode === 'in_progress' && (
          <div className="p-3 border-t border-[rgba(139,92,246,0.18)] bg-black/20 flex flex-col gap-2">
            {isReady ? (
              <button
                onClick={handleCollect}
                disabled={collectLoading}
                className="w-full px-3 py-2.5 rounded-xl text-white border border-[rgba(16,185,129,0.55)] bg-gradient-to-br from-[#10b981] to-[#059669] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
              >
                {collectLoading ? '...' : 'COLLECT ✅'}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onClose ?? onBack}
                  className={`px-3 py-2.5 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer text-[13px] font-extrabold tracking-wide uppercase ${isSkipable ? '' : 'col-span-2'}`}
                >
                  Close
                </button>
                {isSkipable && (() => {
                  const skipCost: Array<{ type: string; id: string; amount: number }> = rawActiveDef?.timer?.skip_cost ?? [];
                  return (
                    <button
                      onClick={handleSkip}
                      disabled={skipLoading}
                      className="flex flex-col items-center justify-center px-3 py-2 rounded-xl text-white border border-[rgba(251,191,36,0.45)] bg-gradient-to-br from-[#d97706] to-[#b45309] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="text-[13px] font-extrabold tracking-wide uppercase leading-tight">
                        {skipLoading ? '...' : 'SKIP ⚡'}
                      </span>
                      {!skipLoading && skipCost.length > 0 && (
                        <span className="flex items-center gap-1 mt-0.5 opacity-80">
                          {skipCost.map((c, i) => (
                            <ItemQty key={i} src={c.id} amount={c.amount} size={11} />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── Footer: PLANNING — surface concern ── */}
        {localMode === 'planning' && (
          <div className="flex flex-col">
            {planningError && (
              <div className="px-3 pt-2 mx-3">
                <div className="px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-xs">
                  {planningError}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 p-2 border-t border-[rgba(139,92,246,0.18)] bg-black/20">
              {idleEntities.length === 0 && selectedEntities.length === 0 ? (
                <div className="col-span-2 text-center text-[13px] font-bold text-text-secondary py-1">
                  No entities available
                </div>
              ) : (
                <>
                  <button
                    onClick={handleAutoAssign}
                    disabled={idleEntities.length === 0}
                    className="px-3 py-2 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
                  >
                    AUTO BUILD TEAM
                  </button>
                  {selectedEntities.length > 0 && (
                    <button
                      disabled={!canStart}
                      onClick={handleStart}
                      className="flex flex-col items-center justify-center px-3 py-2 rounded-xl text-white border border-[rgba(167,139,250,0.55)] bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="text-[13px] font-extrabold tracking-wide uppercase leading-tight">
                        START MISSION ⚡
                      </span>
                      {missionCost.length > 0 && (
                        <span className={`flex items-center gap-1 mt-0.5 ${canAffordMission ? 'opacity-75' : 'opacity-90 [filter:hue-rotate(-30deg)_saturate(2)_brightness(0.9)]'}`}>
                          {missionCost.map((c, i) => (
                            <ItemQty key={i} src={c.id} amount={c.amount} size={11} />
                          ))}
                        </span>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
