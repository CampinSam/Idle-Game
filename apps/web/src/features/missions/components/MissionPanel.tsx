import { useEffect, useRef, useState } from 'react';
import { getDifficultyDisplay } from '@derp/shared';
import { Badge } from '../../../components/ui';
import { RosterCard } from '../../entities/components';
import { useAppSelector } from '../../../store';
import {
  useSyncEntities,
} from '../../../hooks/useSyncSelectors';
import { useCommand } from '../../../hooks/useCommand';
import { useJobPreview } from '../../jobs/useJobPreview';
import { createCountdownTimer, useCurrentTick } from '../../../tick';
import { useTickRemainingMs } from '../../../tick/useTickValue';
import { audioEngine } from '../../../services/AudioEngine';
import { useMissionJobStats } from '../hooks/useMissionJobStats';
import {
  bgImageCss,
  displayCssVars,
  extractRuleValue,
  extractTeamSizeBounds,
  extractTraitRequirements,
  formatDuration,
  formatTimeShort,
  getCategoryIcon,
  resolveDisplay,
} from './missionUtils';

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
  const {
    onBack,
    onMissionStarted,
    onClose,
  } = props;

  const { execute } = useCommand();

  // ── Store slices (used by both planning & in_progress) ──
  const storeEntities = useSyncEntities();
  const storeMissionDefs = useAppSelector((s) => s.game.missionDefs);
  const storeMissionCategoryDefs = useAppSelector((s) => s.game.missionCategoryDefs);
  const storeCurrencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const storeInventoryItems = useAppSelector((s) => s.sync.items);
  const syncJobs: Record<string, any> = useAppSelector((s) => s.sync.jobs);

  // ── Resolve the mission def ──
  const resolvedDef =
    props.selectedDef ??
    storeMissionDefs.find((d: any) => d.id === props.defId);

  // ── For in_progress/outcome: find job from sync store ──
  const syncJob = props.jobId ? syncJobs[props.jobId] : null;

  // ── Derive initial mode: if job already completed, show outcome immediately ──
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
  const [selectedEntities, setSelectedEntities] = useState<string[]>(
    props.initialSelectedEntities ?? [],
  );
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [planningError, setPlanningError] = useState(props.error ?? '');
  const [collectLoading, setCollectLoading] = useState(false);
  const entityPickerRef = useRef<HTMLDivElement>(null);

  // ── Data sources (prefer props, fall back to store) ──
  const entities = props.entities ?? storeEntities;
  const idleEntities = props.idleEntities ?? entities.filter((e: any) => e.status === 'idle');
  const currencyBalances = props.currencyBalances ?? storeCurrencyBalances;
  const inventoryItems = props.inventoryItems ?? storeInventoryItems;
  const missionCategoryDefs = props.missionCategoryDefs ?? storeMissionCategoryDefs;
  const currentCat =
    props.currentCat ??
    missionCategoryDefs.find((c: any) => c.id === resolvedDef?.missionCategoryDefId) ??
    null;

  // ── Planning preview (only when planning mode + def available) ──
  const { preview, loading: previewLoading } = useJobPreview({
    jobType: 'mission',
    defId: localMode === 'planning' && resolvedDef ? resolvedDef.id : '',
    entityIds: localMode === 'planning' ? selectedEntities : [],
  });

  // ── Job stats (in_progress / outcome) ──
  const { stats: jobStats, loading: statsLoading } = useMissionJobStats(
    localMode !== 'planning' ? props.jobId : undefined,
  );

  // ── Timer for in_progress ──
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

  // ── Shared display calculations ──
  const activeDef = localMode === 'planning' ? resolvedDef : (jobStats?.def ? jobStats.def : resolvedDef);
  const diffInfo = activeDef ? getDifficultyDisplay(activeDef.difficulty) : null;
  const display = activeDef ? resolveDisplay(activeDef, missionCategoryDefs) : null;
  const heroCss = display ? displayCssVars(display, { hero: true }) : { vars: {}, titleStyle: {}, borderColor: '' };
  const catIcon = getCategoryIcon(currentCat?.name ?? '');
  const missionTags = activeDef?.tags ?? [];
  const duration = activeDef?.timer?.duration ?? 0;

  // ── Planning-specific computed values ──
  const localBounds = resolvedDef ? extractTeamSizeBounds(resolvedDef.requirements) : { min: 1, max: 4 };
  const teamMin = preview?.mission?.teamMin ?? localBounds.min;
  const teamMax = preview?.mission?.teamMax ?? localBounds.max;
  const keeperLvl = resolvedDef ? extractRuleValue(resolvedDef.requirements, 'player', 'keeperLevel') : 0;
  const traitReqs = resolvedDef ? extractTraitRequirements(resolvedDef.requirements) : [];
  const recommendedNote =
    traitReqs.length > 0
      ? ` · ${traitReqs.map((r: { key: string; value: number }) => `${r.key} ${r.value}+`).join(', ')} preferred`
      : null;

  const difficulty =
    localMode === 'planning'
      ? (preview?.mission?.difficulty ?? resolvedDef?.difficulty ?? 100)
      : (jobStats?.difficulty ?? 0);
  const missionPower =
    localMode === 'planning' ? (preview?.mission?.missionPower ?? 0) : (jobStats?.missionPower ?? 0);
  const successChance =
    localMode === 'planning' ? (preview?.mission?.successChance ?? 0) : (jobStats?.successChance ?? 0);
  const injuryChance =
    localMode === 'planning' ? (preview?.mission?.injuryChance ?? 0) : (jobStats?.injuryChance ?? 0);
  const injuryRate = activeDef?.injuryRate ?? 0;
  const liveSynergy =
    localMode === 'planning' ? (preview?.mission?.synergy ?? null) : (jobStats?.synergy ?? null);
  const powerRatio =
    missionPower > 0 ? Math.min(1, missionPower / (missionPower + difficulty)) : 0;

  const missionCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(resolvedDef?.cost)
    ? resolvedDef.cost
    : [];
  const getHaveForEntry = (entry: { type: string; id: string }) =>
    entry.type === 'currency'
      ? (currencyBalances[entry.id] ?? 0)
      : Object.values(inventoryItems)
          .filter((it: any) => it.definitionId === entry.id)
          .reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
  const canAffordMission =
    preview != null
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

  const successColor = successChance >= 70 ? '#10B981' : successChance >= 40 ? '#F59E0B' : '#EF4444';
  const injuryColor = injuryChance >= 60 ? '#EF4444' : '#F59E0B';

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
    if (!resolvedDef) return;
    setPlanningError('');
    try {
      await execute('StartMission', { defId: resolvedDef.id, entityIds: selectedEntities });
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

  const previewRequirements = preview?.requirements ?? [];
  const panelClass = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
  const panelTitleClass = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';
  const borderColor = display?.borderColor ?? 'rgba(139,92,246,0.3)';

  // ──────────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────────

  const heroSection = activeDef && display ? (
    <div
      className="relative w-full h-[185px] flex-shrink-0 bg-center bg-cover bg-no-repeat px-4 pt-4 pb-3"
      style={{ backgroundImage: bgImageCss(display.backgroundImage) }}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-3 left-3 z-20 px-3 py-1 rounded-full bg-black/45 text-white text-[12px] font-bold border border-white/15 backdrop-blur-sm hover:bg-black/60 cursor-pointer"
        >
          ← Back
        </button>
      )}
      {(onClose || !onBack) && (localMode === 'in_progress' || localMode === 'outcome') && onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-20 px-3 py-1 rounded-full bg-black/45 text-white text-[12px] font-bold border border-white/15 backdrop-blur-sm hover:bg-black/60 cursor-pointer"
        >
          ← Back
        </button>
      )}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(15,10,40,0.2) 0%, rgba(15,10,40,0.55) 50%, rgba(15,10,40,0.92) 100%)' }}
      />
      <div className="relative z-10 mt-8">
        <h1
          className="m-0 font-cinzel text-[24px] font-black tracking-[0.04em] leading-tight text-white flex items-center gap-2 [text-shadow:0_2px_8px_rgba(0,0,0,0.7)]"
          style={heroCss.titleStyle}
        >
          <span className="text-[28px]">{catIcon}</span>
          {activeDef.name}
        </h1>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {diffInfo && (
            <>
              <Badge tone="info" className="!border-[rgba(168,85,247,0.4)] !bg-[rgba(168,85,247,0.3)] !text-[#C084FC]">{diffInfo.tier}</Badge>
              <Badge tone="neutral" className="!border-transparent !text-white" style={{ background: diffInfo.color }}>{diffInfo.label}</Badge>
            </>
          )}
          <Badge tone="neutral" className="!bg-[rgba(0,0,0,0.35)] !text-white/80 !border-white/10">⏱ {formatDuration(duration)}</Badge>
          {missionTags.map((tag: any, i: number) => (
            <Badge key={i} tone="neutral" className="!border-transparent !text-white" style={{ background: tag.color || '#3B82F6' }}>
              {tag.text}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  const statsRow = (
    <div className="grid grid-cols-2 gap-3">
      {localMode === 'planning' && (
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
      )}

      <div className={`${panelClass} ${localMode !== 'planning' ? 'col-span-2' : ''}`}>
        <div className={panelTitleClass}>Team Power vs Difficulty</div>
        <div className="flex flex-col gap-2">
          {(localMode === 'planning' ? (previewLoading && !preview) : statsLoading) ? (
            <div className="text-[11px] text-text-secondary animate-pulse py-2 text-center">Calculating…</div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex flex-col items-start">
                  <span className="font-cinzel text-[22px] font-black text-[#10b981] tabular-nums flex items-baseline gap-1">
                    {liveSynergy && liveSynergy.missionPowerBonus > 0 && (
                      <span className="text-[16px] leading-none">⚡</span>
                    )}
                    {Number(missionPower.toFixed(2))}
                  </span>
                  <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">MP</span>
                </div>
                <div className="text-[12px] font-extrabold text-text-secondary uppercase tracking-widest">vs</div>
                <div className="flex flex-col items-end">
                  <span className="font-cinzel text-[22px] font-black text-[#ef4444] tabular-nums">{Number(difficulty.toFixed(2))}</span>
                  <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">D</span>
                </div>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-black/40">
                <div className="h-full bg-gradient-to-r from-[#10b981] to-[#34d399] transition-[width] duration-300" style={{ width: `${Number((powerRatio * 100).toFixed(2))}%` }} />
                <div className="h-full bg-gradient-to-r from-[#ef4444] to-[#f87171] transition-[width] duration-300" style={{ width: `${Number(((1 - powerRatio) * 100).toFixed(2))}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">Success Chance</span>
                <span className="text-[16px] font-extrabold tabular-nums" style={{ color: successColor }}>{successChance}%</span>
              </div>
              {injuryRate > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">Injury Risk</span>
                  <span className="text-[13px] font-extrabold tabular-nums" style={{ color: injuryColor }}>{injuryChance}%</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const synergySection = liveSynergy && liveSynergy.matchedRules.length > 0 ? (
    <div className="rounded-xl border border-[rgba(139,92,246,0.25)] bg-black/20 px-3 py-2 flex flex-col gap-1">
      {liveSynergy.matchedRules.map((rule: any) => {
        const color = rule.isPenalty ? '#ef4444' : '#10b981';
        const ruleBorderColor = rule.isPenalty ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)';
        const bgColor = rule.isPenalty ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.05)';
        const parts: string[] = [];
        if (rule.scoreContrib !== 0) parts.push(`${rule.scoreContrib > 0 ? '+' : ''}${Number(rule.scoreContrib.toFixed(1))} pts`);
        if (rule.mpBonusContrib !== 0) parts.push(`MP ${rule.mpBonusContrib > 0 ? '+' : ''}${Number(rule.mpBonusContrib.toFixed(1))}%`);
        if (rule.durationBonusContrib !== 0) parts.push(`Dur ${rule.durationBonusContrib > 0 ? '+' : ''}${Number(rule.durationBonusContrib.toFixed(1))}%`);
        const label = parts.join(' · ');
        return (
          <div key={rule.ruleId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ background: bgColor, borderColor: ruleBorderColor }}>
            <span className="text-sm leading-none flex-shrink-0">{rule.isPenalty ? '💀' : '⚡'}</span>
            <span className="flex-1 text-[11px] font-bold text-text-primary truncate">{rule.name}</span>
            {rule.applications > 1 && <span className="text-[10px] text-text-secondary flex-shrink-0">×{rule.applications}</span>}
            {label && <span className="text-[10px] font-extrabold tabular-nums flex-shrink-0" style={{ color }}>{label}</span>}
          </div>
        );
      })}
    </div>
  ) : null;

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
      <div
        className="flex flex-col flex-1 min-h-0 motion-safe:animate-[detail-enter_0.28s_ease-out_both]"
      >
        <div
          className="overflow-hidden rounded-2xl border flex flex-col relative flex-1 min-h-0"
          style={{ borderColor, background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)', ...heroCss.vars } as React.CSSProperties}
        >
          {heroSection}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4 flex flex-col gap-3">
            {/* Result banner */}
            <div
              className="rounded-xl px-4 py-3 text-center border"
              style={isSuccess
                ? { background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.35)' }
                : { background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.3)' }}
            >
              <div className="text-[28px] leading-none mb-1">{isSuccess ? '🏆' : '💀'}</div>
              <div className="font-cinzel text-[17px] font-black tracking-wider uppercase" style={{ color: isSuccess ? '#10b981' : '#ef4444' }}>
                {isSuccess ? 'Mission Complete' : 'Mission Failed'}
              </div>
              {results?.qualityLabel && (
                <div className="text-[12px] text-text-secondary mt-0.5">{results.qualityLabel}</div>
              )}
            </div>

            {/* Rewards */}
            {rewards.filter((r: any) => r.type !== 'emitEvent').length > 0 && (
              <div className={panelClass}>
                <div className={panelTitleClass}>Rewards</div>
                <div className="flex flex-col gap-1.5">
                  {rewards.filter((r: any) => r.type !== 'emitEvent').map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
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

            {/* Entity outcomes */}
            {entityResults.length > 0 && (
              <div className={panelClass}>
                <div className={panelTitleClass}>Team Outcomes</div>
                <div className="flex flex-col gap-1.5">
                  {entityResults.map((er: any) => (
                    <div key={er.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
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

          {/* Close button */}
          <div className="p-3 border-t border-[rgba(139,92,246,0.18)] bg-black/20">
            <button
              onClick={onClose ?? onBack}
              className="w-full px-3 py-2.5 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
            >
              Close
            </button>
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
          style={{ borderColor, background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)', ...heroCss.vars } as React.CSSProperties}
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            {heroSection}

            {activeDef?.description && (
              <p className="m-0 px-4 pt-3 text-[13px] leading-relaxed text-text-secondary">{activeDef.description}</p>
            )}

            <div className="sticky top-0 z-10 px-4 pt-3 pb-2 flex flex-col gap-3"
              style={{ background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)', boxShadow: '0 4px 16px rgba(0,0,0,0.45)' }}>
              {statsRow}
              {synergySection}
            </div>

            {/* Timer progress */}
            <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
              <div className={panelClass}>
                <div className={panelTitleClass}>Mission Progress</div>
                <div className="flex flex-col gap-2">
                  {isReady ? (
                    <div className="text-[13px] font-extrabold text-[#10b981] text-center py-1">✅ Ready to Collect!</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-text-secondary uppercase font-bold tracking-wide">Remaining</span>
                        <span className="text-[14px] font-extrabold tabular-nums text-[#F59E0B]">⏱ {formatTimeShort(remainingMs)}</span>
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

              {/* Team roster (read-only) */}
              {jobStats?.entities && jobStats.entities.length > 0 && (
                <div className={panelClass}>
                  <div className={panelTitleClass}>Team</div>
                  <div className="flex flex-col gap-1.5">
                    {jobStats.entities.map((e: any) => (
                      <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                        <span className="text-[14px] leading-none flex-shrink-0">⚔️</span>
                        <span className="flex-1 text-[13px] font-bold text-text-primary truncate">{e.name}</span>
                        <span className="text-[11px] font-semibold text-text-secondary flex-shrink-0">Lv {e.level}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Collect bar */}
          <div className="p-3 border-t border-[rgba(139,92,246,0.18)] bg-black/20 grid grid-cols-2 gap-2">
            <button
              onClick={onClose ?? onBack}
              className="px-3 py-2.5 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
            >
              Close
            </button>
            <button
              onClick={handleCollect}
              disabled={!isReady || collectLoading}
              className="px-3 py-2.5 rounded-xl text-white border border-[rgba(16,185,129,0.55)] bg-gradient-to-br from-[#10b981] to-[#059669] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
            >
              {collectLoading ? '...' : isReady ? 'COLLECT ✅' : 'IN PROGRESS'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // MODE: PLANNING
  // ──────────────────────────────────────────────────────────────
  if (!resolvedDef || !currentCat) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center">
        <p className="text-text-secondary text-[13px]">Loading mission…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 pt-2">
      <div
        key={resolvedDef.id}
        className="overflow-hidden rounded-2xl border flex flex-col relative flex-1 min-h-0 motion-safe:animate-[detail-enter_0.28s_ease-out_both]"
        style={{ borderColor, background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)', ...heroCss.vars } as React.CSSProperties}
      >
        <div className="flex-1 min-h-0 overflow-y-auto">
          {heroSection}

          {resolvedDef.description && (
            <p className="m-0 px-4 pt-3 text-[13px] leading-relaxed text-text-secondary">{resolvedDef.description}</p>
          )}

          <div
            className="sticky top-0 z-10 px-4 pt-3 pb-2 flex flex-col gap-3"
            style={{ background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)', boxShadow: '0 4px 16px rgba(0,0,0,0.45)' }}
          >
            {statsRow}
            {synergySection}
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
