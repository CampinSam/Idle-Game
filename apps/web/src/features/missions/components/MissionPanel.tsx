import { useEffect, useRef, useState } from 'react';
import { useAppSelector } from '../../../store';
import {
  useSyncEntities,
} from '../../../hooks/useSyncSelectors';
import { useCommand } from '../../../hooks/useCommand';
import { useJobPreview } from '../../jobs/useJobPreview';
import { createCountdownTimer, useCurrentTick } from '../../../tick';
import { useTickRemainingMs } from '../../../tick/useTickValue';
import { audioEngine } from '../../../services/AudioEngine';
import { api } from '../../../services/api';
import { useMissionJobStats } from '../hooks/useMissionJobStats';
import { RosterCard } from '../../entities/components';
import {
  extractRuleValue,
  extractTeamSizeBounds,
  extractTraitRequirements,
} from './missionUtils';
import { MissionHeroPanel } from './panels/MissionHeroPanel';
import { MissionStatsPanel } from './panels/MissionStatsPanel';
import { MissionSynergyPanel } from './panels/MissionSynergyPanel';
import { MissionRosterPanel } from './panels/MissionRosterPanel';

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
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [planningError, setPlanningError] = useState(props.error ?? '');
  const [collectLoading, setCollectLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const entityPickerRef = useRef<HTMLDivElement>(null);

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
  const panelClass = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
  const panelTitleClass = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';

  const isSkipable = rawActiveDef?.timer?.skipable ?? false;

  // ── Handlers ──
  const handleAutoAssign = () => {
    const auto = idleEntities.slice(0, teamMax).map((e: any) => e.id);
    setSelectedEntities(() => auto);
    setShowEntityPicker(false);
    setTimeout(() => entityPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
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
    setShowEntityPicker(false);
    setPlanningError('');
    setLocalMode('planning');
  };

  // ── Shared header back handler ──
  const handleBack = onBack ?? onClose;

  // ──────────────────────────────────────────────────────────────
  // MODE: OUTCOME
  // ──────────────────────────────────────────────────────────────
  if (localMode === 'outcome') {
    const outcomeSyncJob = syncJob ?? (props.jobId ? syncJobs[props.jobId] : null);
    const results = outcomeSyncJob?.results ?? jobStats?.job?.results ?? null;
    const isSuccess = results?.success ?? false;
    const rewards: any[] = results?.rewards ?? [];
    const entityResults: any[] = results?.entityResults ?? [];

    return (
      <div className="flex flex-col flex-1 min-h-0 motion-safe:animate-[detail-enter_0.28s_ease-out_both]">
        <div
          className="overflow-hidden rounded-2xl border flex flex-col relative flex-1 min-h-0"
          style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)' }}
        >
          {rawActiveDef && currentCat && (
            <MissionHeroPanel
              def={rawActiveDef}
              currentCat={currentCat}
              missionCategoryDefs={missionCategoryDefs}
              onBack={handleBack}
            />
          )}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4 flex flex-col gap-3">
            {/* Result banner — scales + fades in first */}
            <div
              className="rounded-xl px-4 py-3 text-center border motion-safe:animate-[outcome-banner-in_0.4s_cubic-bezier(0.34,1.56,0.64,1)_both]"
              style={isSuccess
                ? { background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.35)' }
                : { background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.3)' }}
            >
              <div className="text-[28px] leading-none mb-1">{isSuccess ? '🏆' : '💀'}</div>
              <div
                className="font-cinzel text-[17px] font-black tracking-wider uppercase"
                style={{ color: isSuccess ? '#10b981' : '#ef4444' }}
              >
                {isSuccess ? 'Mission Complete' : 'Mission Failed'}
              </div>
              {results?.qualityLabel && (
                <div className="text-[12px] text-text-secondary mt-0.5">{results.qualityLabel}</div>
              )}
            </div>

            {/* Rewards — stagger in one by one after banner */}
            {rewards.filter((r: any) => r.type !== 'emitEvent').length > 0 && (
              <div className={panelClass}>
                <div className={panelTitleClass}>Rewards</div>
                <div className="flex flex-col gap-1.5">
                  {rewards.filter((r: any) => r.type !== 'emitEvent').map((r: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] motion-safe:animate-[outcome-row-in_0.3s_ease-out_both]"
                      style={{ animationDelay: `${0.3 + i * 0.08}s` }}
                    >
                      <span className="text-[14px] leading-none flex-shrink-0">
                        {r.type === 'currency' ? '💰' : r.type === 'item' ? '📦' : r.type === 'entity_xp' ? '✨' : r.type === 'keeper_xp' ? '⭐' : '🎁'}
                      </span>
                      <span className="flex-1 text-[13px] font-bold text-text-primary truncate">{r.name ?? r.key ?? r.type}</span>
                      {r.amount != null && (
                        <span className="text-[12px] font-extrabold text-[#10b981] tabular-nums flex-shrink-0">+{r.amount}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Entity outcomes — stagger in after rewards */}
            {entityResults.length > 0 && (
              <div className={panelClass}>
                <div className={panelTitleClass}>Team Outcomes</div>
                <div className="flex flex-col gap-1.5">
                  {entityResults.map((er: any, i: number) => (
                    <div
                      key={er.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] motion-safe:animate-[outcome-row-in_0.3s_ease-out_both]"
                      style={{ animationDelay: `${0.3 + rewards.filter((r: any) => r.type !== 'emitEvent').length * 0.08 + 0.12 + i * 0.08}s` }}
                    >
                      <span className="text-[14px] leading-none flex-shrink-0">
                        {er.injured ? '🩹' : er.leveledUp ? '⬆️' : '⚔️'}
                      </span>
                      <span className="flex-1 text-[13px] font-bold text-text-primary truncate">{er.name}</span>
                      <span className="flex flex-col items-end gap-0.5">
                        {er.leveledUp && (
                          <span className="text-[11px] font-extrabold text-[#fbbf24]">Lv {er.oldLevel} → {er.newLevel} ⬆️</span>
                        )}
                        {er.injured && (
                          <span className="text-[11px] font-extrabold text-[#ef4444]">Injured 🩹</span>
                        )}
                        {er.xpGained > 0 && (
                          <span className="text-[10px] text-text-secondary">+{er.xpGained} XP</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Narrative texts */}
            {results?.texts && results.texts.length > 0 && (
              <div className={panelClass}>
                <div className={panelTitleClass}>Report</div>
                <div className="flex flex-col gap-1.5">
                  {results.texts.map((t: string, i: number) => (
                    <p key={i} className="m-0 text-[12px] leading-relaxed text-text-secondary italic">{t}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Retry + Close */}
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
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // MODE: IN_PROGRESS
  // ──────────────────────────────────────────────────────────────
  if (localMode === 'in_progress') {
    return (
      <div className="flex flex-col flex-1 min-h-0 pt-2 motion-safe:animate-[detail-enter_0.28s_ease-out_both]">
        <div
          className="overflow-hidden rounded-2xl border flex flex-col relative flex-1 min-h-0"
          style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)' }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            {rawActiveDef && currentCat && (
              <MissionHeroPanel
                def={rawActiveDef}
                currentCat={currentCat}
                missionCategoryDefs={missionCategoryDefs}
                onBack={handleBack}
              />
            )}

            {rawActiveDef?.description && (
              <p className="m-0 px-4 pt-3 text-[13px] leading-relaxed text-text-secondary">{rawActiveDef.description}</p>
            )}

            <div
              className="sticky top-0 z-10 px-4 pt-3 pb-2 flex flex-col gap-3"
              style={{ background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)', boxShadow: '0 4px 16px rgba(0,0,0,0.45)' }}
            >
              <MissionStatsPanel
                missionPower={missionPower}
                difficulty={difficulty}
                successChance={successChance}
                injuryChance={injuryChance}
                injuryRate={injuryRate}
                powerRatio={powerRatio}
                hasSynergyBonus={!!(liveSynergy && liveSynergy.missionPowerBonus > 0)}
                loading={statsLoading}
              />
              {liveSynergy && <MissionSynergyPanel matchedRules={liveSynergy.matchedRules} />}
            </div>

            <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
              {/* Timer progress */}
              <div className={panelClass}>
                <div className={panelTitleClass}>Mission Progress</div>
                <div className="flex flex-col gap-2">
                  {isReady ? (
                    <div className="text-[13px] font-extrabold text-[#10b981] text-center py-1">✅ Ready to Collect!</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-text-secondary uppercase font-bold tracking-wide">Remaining</span>
                        <span className="text-[14px] font-extrabold tabular-nums text-[#F59E0B]">
                          ⏱ {Math.floor(remainingMs / 60000)}m {Math.floor((remainingMs % 60000) / 1000)}s
                        </span>
                      </div>
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-black/40">
                        <div
                          className="h-full bg-gradient-to-r from-[#a78bfa] to-[#8b5cf6] transition-[width] duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {jobStats?.entities && jobStats.entities.length > 0 && (
                <MissionRosterPanel entities={jobStats.entities} />
              )}
            </div>
          </div>

          {/* Skip + Close + Collect */}
          <div
            className="p-3 border-t border-[rgba(139,92,246,0.18)] bg-black/20 flex flex-col gap-2"
          >
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
                {isSkipable && (
                  <button
                    onClick={handleSkip}
                    disabled={skipLoading}
                    className="px-3 py-2.5 rounded-xl text-white border border-[rgba(251,191,36,0.45)] bg-gradient-to-br from-[#d97706] to-[#b45309] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
                  >
                    {skipLoading ? '...' : 'SKIP ⚡'}
                  </button>
                )}
                <button
                  onClick={onClose ?? onBack}
                  className={`px-3 py-2.5 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer text-[13px] font-extrabold tracking-wide uppercase ${isSkipable ? '' : 'col-span-2'}`}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // MODE: PLANNING
  // ──────────────────────────────────────────────────────────────
  if (!rawActiveDef || !currentCat) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center">
        <p className="text-text-secondary text-[13px]">Loading mission…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 pt-2">
      <div
        key={rawActiveDef.id}
        className="overflow-hidden rounded-2xl border flex flex-col relative flex-1 min-h-0 motion-safe:animate-[detail-enter_0.28s_ease-out_both]"
        style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)' }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MissionHeroPanel
            def={rawActiveDef}
            currentCat={currentCat}
            missionCategoryDefs={missionCategoryDefs}
            onBack={handleBack}
          />

          {rawActiveDef.description && (
            <p className="m-0 px-4 pt-3 text-[13px] leading-relaxed text-text-secondary">{rawActiveDef.description}</p>
          )}

          <div
            className="sticky top-0 z-10 px-4 pt-3 pb-2 flex flex-col gap-3"
            style={{ background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)', boxShadow: '0 4px 16px rgba(0,0,0,0.45)' }}
          >
            {/* Requirements | Stats — 2-col grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left: Requirements */}
              <div className={panelClass}>
                <div className={panelTitleClass}>Requirements</div>
                {previewLoading && previewRequirements.length === 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-4/5" />
                    <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-3/5" />
                  </div>
                ) : previewRequirements.length === 0 ? (
                  <span className="text-[12px] text-text-secondary italic">No requirements</span>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {previewRequirements.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px]">
                        <span className="text-base leading-none flex-shrink-0">{r.met ? '✅' : '❌'}</span>
                        <span className="flex-1 font-medium truncate" style={{ color: r.met ? '#10b981' : '#ef4444' }}>
                          {r.label ?? 'Requirement'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Stats */}
              <MissionStatsPanel
                missionPower={missionPower}
                difficulty={difficulty}
                successChance={successChance}
                injuryChance={injuryChance}
                injuryRate={injuryRate}
                powerRatio={powerRatio}
                hasSynergyBonus={!!(liveSynergy && liveSynergy.missionPowerBonus > 0)}
                loading={previewLoading && !preview}
              />
            </div>

            {liveSynergy && <MissionSynergyPanel matchedRules={liveSynergy.matchedRules} />}
          </div>

          <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
            <RosterCard
              title="Your Team"
              entities={entities}
              selectedIds={selectedEntities}
              maxSlots={teamMax}
              useCase="mission"
              onRemove={(entityId) => toggleEntity(entityId)}
              onAdd={(entityId) => toggleEntity(entityId)}
              busyDisabledTooltip="Busy"
              panelRef={entityPickerRef}
              isPickerOpen={showEntityPicker}
              onPickerOpenChange={setShowEntityPicker}
              inlinePicker
            />

            {planningError && (
              <div className="px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-xs">
                {planningError}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-2 border-t border-[rgba(139,92,246,0.18)] bg-black/20">
          {idleEntities.length === 0 && selectedEntities.length === 0 ? (
            <div className="col-span-2 text-center text-[13px] font-bold text-text-secondary py-1">No entities available</div>
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
                  className="px-3 py-2 rounded-xl text-white border border-[rgba(167,139,250,0.55)] bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
                >
                  START MISSION ⚡
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
