import { useRef } from 'react';
import { getDifficultyDisplay } from '@derp/shared';
import { Badge } from '../../../components/ui';
import { EntityCard, EntityList } from '../../entities/components';
import { MissionDetailFooter } from './MissionDetailFooter';
import { SynergyPanel } from './SynergyPanel';
import {
  bgImageCss,
  displayCssVars,
  extractRuleValue,
  extractTeamSizeBounds,
  extractTraitRequirements,
  formatDuration,
  getCategoryIcon,
  resolveDisplay,
  type ReqStatusEntry,
} from './missionUtils';
import { BUSY_PICKER_TOOLTIP } from '../../inventory/utils/statChangeHelpers';
import type { SynergyPreview } from '../../../services/api';
import { useJobPreview } from '../../jobs/useJobPreview';

interface MissionDetailProps {
  selectedDef: any;
  currentCat: any;
  missionCategoryDefs: any[];
  entities: any[];
  idleEntities: any[];
  selectedEntities: string[];
  setSelectedEntities: (updater: (prev: string[]) => string[]) => void;
  showEntityPicker: boolean;
  setShowEntityPicker: (b: boolean) => void;
  activeSlotIndex: number | null;
  setActiveSlotIndex: (n: number | null) => void;
  currencyBalances: Record<string, number>;
  inventoryItems: Record<string, any>;
  error: string;
  onBack: () => void;
  onStart: () => void;
  entityPickerRef: React.RefObject<HTMLDivElement>;
  synergyPreview?: SynergyPreview | null;
  onDismissSynergy?: () => void;
}

export function MissionDetail(props: MissionDetailProps) {
  const {
    selectedDef,
    currentCat,
    missionCategoryDefs,
    entities,
    idleEntities,
    selectedEntities,
    setSelectedEntities,
    showEntityPicker,
    setShowEntityPicker,
    activeSlotIndex,
    setActiveSlotIndex,
    currencyBalances,
    inventoryItems,
    error,
    onBack,
    onStart,
    entityPickerRef,
    synergyPreview,
    onDismissSynergy,
  } = props;

  const teamGridRef = useRef<HTMLDivElement>(null);

  const { preview, loading: previewLoading } = useJobPreview({
    jobType: 'mission',
    defId: selectedDef.id,
    entityIds: selectedEntities,
  });

  const diffInfo = getDifficultyDisplay(selectedDef.difficulty);
  const display = resolveDisplay(selectedDef, missionCategoryDefs);
  const missionTags = selectedDef.tags || [];

  const missionCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(selectedDef.cost) ? selectedDef.cost : [];
  const getHaveForEntry = (entry: { type: string; id: string }) =>
    entry.type === 'currency'
      ? (currencyBalances[entry.id] ?? 0)
      : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id).reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);

  const heroCss = displayCssVars(display, { hero: true });

  const localBounds = extractTeamSizeBounds(selectedDef.requirements);
  const teamMin = preview?.mission?.teamMin ?? localBounds.min;
  const teamMax = preview?.mission?.teamMax ?? localBounds.max;

  const keeperLvl = extractRuleValue(selectedDef.requirements, 'player', 'keeperLevel');
  const duration = selectedDef.timer?.duration ?? 0;
  const difficulty = preview?.mission?.difficulty ?? selectedDef.difficulty ?? 100;

  const missionPower = preview?.mission?.missionPower ?? 0;
  const successChance = preview?.mission?.successChance ?? 0;
  const injuryChance = preview?.mission?.injuryChance ?? 0;
  const injuryRate = selectedDef.injuryRate ?? 0;
  const liveSynergy = preview?.mission?.synergy ?? null;

  const canAffordMission = missionCost.every(e => getHaveForEntry(e) >= e.amount);
  const powerRatio = missionPower > 0 ? Math.min(1, missionPower / (missionPower + difficulty)) : 0;

  const reqRows: ReqStatusEntry[] = Array.isArray(selectedDef.requirementStatus) ? selectedDef.requirementStatus : [];
  const launchReqRows: ReqStatusEntry[] = Array.isArray(selectedDef.launchRequirementStatus) ? selectedDef.launchRequirementStatus : [];

  const allDefReqsMet = reqRows.length === 0 || reqRows.every(r => r.met);
  const canStart = !!(
    selectedEntities.length > 0 &&
    selectedEntities.length >= teamMin &&
    selectedEntities.length <= teamMax &&
    allDefReqsMet &&
    canAffordMission
  );

  const injuryColor = injuryChance >= 60 ? '#EF4444' : '#F59E0B';
  const grade = successChance >= 90 ? 'A' : successChance >= 75 ? 'B' : successChance >= 55 ? 'C' : successChance >= 35 ? 'D' : 'F';
  const gradeColor = successChance >= 75 ? '#10B981' : successChance >= 55 ? '#F59E0B' : '#EF4444';
  const successColor = successChance >= 70 ? '#10B981' : successChance >= 40 ? '#F59E0B' : '#EF4444';

  const reqStatus: ReqStatusEntry[] = reqRows;
  const catIcon = getCategoryIcon(currentCat.name);

  const traitReqs = extractTraitRequirements(selectedDef.requirements);
  const recommendedNote = traitReqs.length > 0
    ? ` · ${traitReqs.map((r: { key: string; value: number }) => `${r.key} ${r.value}+`).join(', ')} preferred`
    : null;

  const costSubtitleParts: string[] = [];
  if (missionCost.length > 0) {
    costSubtitleParts.push(`Cost: ${missionCost.map((e) => e.amount.toLocaleString()).join('+')} `);
  }
  costSubtitleParts.push(`Duration: ${formatDuration(duration)}`);
  const costSubtitle = costSubtitleParts.join('• ');

  const removeEntityFromSlot = (index: number) => {
    setSelectedEntities((prev) => prev.filter((_, i) => i !== index));
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const openSlot = (index: number) => {
    setActiveSlotIndex(index);
    setShowEntityPicker(true);
  };

  const handleAutoAssign = () => {
    const auto = idleEntities.slice(0, teamMax).map((b: any) => b.id);
    setSelectedEntities(() => auto);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
    setTimeout(() => teamGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  const panelClass = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
  const panelTitleClass = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';

  return (
    <div className="flex flex-col flex-1 min-h-0 pt-2">
      <div
        key={selectedDef.id}
        className="overflow-hidden rounded-2xl border flex flex-col relative flex-1 min-h-0 motion-safe:animate-[detail-enter_0.28s_ease-out_both]"
        style={{
          borderColor: display.borderColor,
          background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)',
          ...heroCss.vars,
        } as React.CSSProperties}
      >
        {synergyPreview && onDismissSynergy && (
          <SynergyPanel synergyPreview={synergyPreview} onDismiss={onDismissSynergy} />
        )}
        <div
          className="relative w-full h-[185px] flex-shrink-0 bg-center bg-cover bg-no-repeat px-4 pt-4 pb-3"
          style={{ backgroundImage: bgImageCss(display.backgroundImage) }}
        >
          <button
            onClick={onBack}
            className="absolute top-3 left-3 z-20 px-3 py-1 rounded-full bg-black/45 text-white text-[12px] font-bold border border-white/15 backdrop-blur-sm hover:bg-black/60 cursor-pointer"
          >
            ← Back
          </button>
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
              {selectedDef.name}
            </h1>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <Badge tone="info" className="!border-[rgba(168,85,247,0.4)] !bg-[rgba(168,85,247,0.3)] !text-[#C084FC]">{diffInfo.tier}</Badge>
              <Badge tone="neutral" className="!border-transparent !text-white" style={{ background: diffInfo.color }}>{diffInfo.label}</Badge>
              <Badge tone="neutral" className="!bg-[rgba(0,0,0,0.35)] !text-white/80 !border-white/10">⏱ {formatDuration(duration)}</Badge>
              {missionTags.map((tag: any, i: number) => (
                <Badge key={i} tone="neutral" className="!border-transparent !text-white" style={{ background: tag.color || '#3B82F6' }}>
                  {tag.text}
                </Badge>
              ))}
            </div>
          </div>
          <div className="relative z-10 mt-3 px-2.5 py-1.5 rounded-md bg-black/40 backdrop-blur-sm text-[11px] font-bold tracking-wide text-[#c4b5fd] border border-white/10">
            👥 RECOMMENDED: {teamMax} {teamMax === 1 ? 'Entity' : 'Entities'}
            {keeperLvl > 0 && <span className="text-text-secondary"> · Keeper Lv {keeperLvl}+</span>}
            {recommendedNote && <span className="text-text-secondary">{recommendedNote}</span>}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          {selectedDef.description && (
            <p className="m-0 text-[13px] leading-relaxed text-text-secondary">{selectedDef.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className={panelClass}>
              <div className={panelTitleClass}>Potential Rewards</div>
              <div className="flex flex-col gap-1.5">
                {selectedDef.rewardPreview && selectedDef.rewardPreview.length > 0
                  ? selectedDef.rewardPreview.map((line: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                        <div className="text-base leading-none">🎁</div>
                        <div className="text-[12px] text-text-primary flex-1 truncate">{line}</div>
                      </div>
                    ))
                  : <span className="text-[12px] text-text-secondary italic">No reward data</span>
                }
              </div>
            </div>

            <div className={panelClass}>
              <div className={panelTitleClass}>Team Power vs Difficulty</div>
              <div className="flex flex-col gap-2">
                {previewLoading && !preview ? (
                  <div className="text-[11px] text-text-secondary animate-pulse py-2 text-center">Calculating…</div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex flex-col items-start">
                        <span className="font-cinzel text-[22px] font-black text-[#10b981] tabular-nums">{Number(missionPower.toFixed(2))}</span>
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
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={panelClass} ref={teamGridRef}>
              <div className="flex items-center justify-between gap-2">
                <span className={panelTitleClass}>Select Your Team</span>
                <span className="text-[12px] font-bold text-text-primary tabular-nums">{selectedEntities.length}/{teamMax}</span>
              </div>
              <div className="grid gap-2 justify-start" style={{ gridTemplateColumns: 'repeat(auto-fill, 90px)' }}>
                {selectedEntities.map((entityId, slotIndex) => {
                  const entity = entities.find((b: any) => b.id === entityId);
                  if (!entity) return null;
                  const isActive = activeSlotIndex === slotIndex;
                  return (
                    <EntityCard
                      key={entity.id}
                      entity={entity}
                      useCase="mission"
                      active={isActive}
                      onClick={() => openSlot(slotIndex)}
                      onRemove={() => removeEntityFromSlot(slotIndex)}
                    />
                  );
                })}
                {selectedEntities.length < teamMax && (
                  <button
                    type="button"
                    onClick={() => openSlot(selectedEntities.length)}
                    className={`w-[90px] rounded-xl border-2 border-dashed cursor-pointer overflow-hidden flex flex-col p-0 transition-colors ${
                      activeSlotIndex === selectedEntities.length
                        ? 'border-[rgba(139,92,246,0.5)] bg-[rgba(139,92,246,0.1)] shadow-[0_0_12px_rgba(139,92,246,0.5),inset_0_0_8px_rgba(139,92,246,0.15)]'
                        : 'border-white/15 bg-bg-card hover:border-white/25'
                    }`}
                  >
                    <div className="aspect-square flex items-center justify-center bg-white/[0.03]">
                      <span className="text-[28px] text-white/20 font-light">＋</span>
                    </div>
                    <div className="px-2 py-2 bg-bg-card text-center">
                      <span className="block text-[11px] font-extrabold text-text-primary uppercase tracking-wide">Add Entity</span>
                    </div>
                  </button>
                )}
              </div>
            </div>

            <div className={panelClass}>
              <div className={panelTitleClass}>Mission Readiness</div>
              {previewLoading && !preview ? (
                <div className="text-[11px] text-text-secondary animate-pulse py-2 text-center">Calculating…</div>
              ) : (
                <>
                  <div className="flex items-baseline gap-3" style={{ color: gradeColor }}>
                    <span className="font-cinzel text-[40px] font-black leading-none">{grade}</span>
                    <span className="text-[16px] font-bold tabular-nums">{successChance}%</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {reqRows.length > 0 && (
                      <>
                        {launchReqRows.length > 0 && (
                          <span className="text-[10px] font-extrabold tracking-widest uppercase text-text-secondary mt-0.5">Requirements</span>
                        )}
                        {reqRows.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-[12px]">
                            <span className="text-base leading-none">{r.met ? '✅' : '❌'}</span>
                            <span className="flex-1 text-text-secondary">{r.label ?? 'Requirement'}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {launchReqRows.length > 0 && (
                      <>
                        {reqRows.length > 0 && (
                          <span className="text-[10px] font-extrabold tracking-widest uppercase text-text-secondary mt-0.5">Launch Requirements</span>
                        )}
                        {launchReqRows.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-[12px]">
                            <span className="text-base leading-none">{r.met ? '✅' : '❌'}</span>
                            <span className="flex-1 text-text-secondary">{r.label ?? 'Requirement'}</span>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="text-base leading-none">{selectedEntities.length > 0 && selectedEntities.length >= teamMin && selectedEntities.length <= teamMax ? '✅' : '⚠️'}</span>
                      <span className="flex-1 text-text-secondary">Team Size</span>
                      <span className="font-bold text-text-primary tabular-nums">{selectedEntities.length}/{teamMax}</span>
                    </div>
                    {missionCost.length > 0 && (
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-base leading-none">{canAffordMission ? '✅' : '❌'}</span>
                        <span className="flex-1 text-text-secondary">Can Afford</span>
                        <span className="font-bold text-text-primary tabular-nums">{canAffordMission ? 'Yes' : 'No'}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="text-base leading-none">{successChance >= 70 ? '✅' : successChance >= 40 ? '⚠️' : '❌'}</span>
                      <span className="flex-1 text-text-secondary">Power Ratio</span>
                      <span className="font-bold tabular-nums" style={{ color: successColor }}>{successChance >= 70 ? 'Good' : successChance >= 40 ? 'Marginal' : 'Low'}</span>
                    </div>
                    {injuryRate > 0 && (
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-base leading-none">⚠️</span>
                        <span className="flex-1 text-text-secondary">Injury on Failure</span>
                        <span className="font-bold tabular-nums" style={{ color: injuryColor }}>{injuryChance}% chance</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {(previewLoading || liveSynergy) && (
            <div className="rounded-xl border border-[rgba(139,92,246,0.25)] bg-black/20 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className={panelTitleClass}>⚡ Synergy Preview</span>
                {previewLoading && (
                  <span className="text-[10px] text-text-secondary animate-pulse">Calculating…</span>
                )}
                {!previewLoading && liveSynergy && (
                  <span
                    className="font-cinzel text-[15px] font-black tabular-nums"
                    style={{ color: liveSynergy.synergyScore > 0 ? '#10b981' : liveSynergy.synergyScore < 0 ? '#ef4444' : '#94a3b8' }}
                  >
                    {liveSynergy.synergyScore > 0 ? '+' : ''}{liveSynergy.synergyScore}
                  </span>
                )}
              </div>
              {!previewLoading && liveSynergy && (
                <>
                  {(liveSynergy.missionPowerBonus !== 0 || liveSynergy.durationBonus !== 0) && (
                    <div className="flex gap-2 flex-wrap">
                      {liveSynergy.missionPowerBonus !== 0 && (
                        <span
                          className="text-[11px] font-extrabold tabular-nums px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08]"
                          style={{ color: liveSynergy.missionPowerBonus > 0 ? '#10b981' : '#ef4444' }}
                        >
                          MP {liveSynergy.missionPowerBonus > 0 ? '+' : ''}{Number(liveSynergy.missionPowerBonus.toFixed(1))}%
                        </span>
                      )}
                      {liveSynergy.durationBonus !== 0 && (
                        <span
                          className="text-[11px] font-extrabold tabular-nums px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08]"
                          style={{ color: liveSynergy.durationBonus < 0 ? '#10b981' : '#ef4444' }}
                        >
                          Dur {liveSynergy.durationBonus > 0 ? '+' : ''}{Number(liveSynergy.durationBonus.toFixed(1))}%
                        </span>
                      )}
                    </div>
                  )}
                  {liveSynergy.matchedRules.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {liveSynergy.matchedRules.map((rule) => {
                        const color = rule.isPenalty ? '#ef4444' : '#10b981';
                        const borderColor = rule.isPenalty ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)';
                        const bgColor = rule.isPenalty ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.05)';
                        const parts: string[] = [];
                        if (rule.scoreContrib !== 0) parts.push(`${rule.scoreContrib > 0 ? '+' : ''}${Number(rule.scoreContrib.toFixed(1))} pts`);
                        if (rule.mpBonusContrib !== 0) parts.push(`MP ${rule.mpBonusContrib > 0 ? '+' : ''}${Number(rule.mpBonusContrib.toFixed(1))}%`);
                        if (rule.durationBonusContrib !== 0) parts.push(`Dur ${rule.durationBonusContrib > 0 ? '+' : ''}${Number(rule.durationBonusContrib.toFixed(1))}%`);
                        const label = parts.join(' · ');
                        return (
                          <div
                            key={rule.ruleId}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border"
                            style={{ background: bgColor, borderColor }}
                          >
                            <span className="text-sm leading-none flex-shrink-0">{rule.isPenalty ? '💀' : '⚡'}</span>
                            <span className="flex-1 text-[11px] font-bold text-text-primary truncate">{rule.name}</span>
                            {rule.applications > 1 && (
                              <span className="text-[10px] text-text-secondary flex-shrink-0">×{rule.applications}</span>
                            )}
                            {label && (
                              <span className="text-[10px] font-extrabold tabular-nums flex-shrink-0" style={{ color }}>{label}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-sm leading-none">🔮</span>
                      <span className="text-[11px] text-text-secondary italic">No synergy rules matched for this team</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {showEntityPicker && (
            <div ref={entityPickerRef} className="rounded-xl border border-[rgba(139,92,246,0.3)] bg-black/30 p-3 flex flex-col gap-2">
              <h4 className="m-0 text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">
                Select an Entity
              </h4>
              <EntityList
                entities={entities}
                mode="picker"
                useCase="mission"
                selectedIds={selectedEntities.filter((_id, i) => i !== activeSlotIndex)}
                disabledIds={selectedEntities.filter((_id, i) => i !== activeSlotIndex)}
                activeId={activeSlotIndex !== null ? selectedEntities[activeSlotIndex] : null}
                busyDisabledTooltip={BUSY_PICKER_TOOLTIP}
                onSelect={(entity) => {
                  setSelectedEntities((prev) => {
                    const next = [...prev];
                    if (activeSlotIndex !== null && activeSlotIndex < next.length) {
                      next[activeSlotIndex] = entity.id;
                    } else {
                      next.push(entity.id);
                    }
                    return next;
                  });
                  setShowEntityPicker(false);
                  setActiveSlotIndex(null);
                }}
                emptyMessage="No entities available."
              />
            </div>
          )}

          <MissionDetailFooter
            currentCat={currentCat}
            diffInfo={diffInfo}
            duration={duration}
            difficulty={difficulty}
            teamMin={teamMin}
            teamMax={teamMax}
            keeperLvl={keeperLvl}
            reqStatus={reqStatus}
            missionCost={missionCost}
            getHaveForEntry={getHaveForEntry}
            error={error}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 border-t border-[rgba(139,92,246,0.18)] bg-black/20">
          {idleEntities.length === 0 && selectedEntities.length === 0 ? (
            <div className="col-span-2 text-center text-[13px] font-bold text-text-secondary py-2">No entities available</div>
          ) : (
            <>
              <button
                onClick={handleAutoAssign}
                disabled={idleEntities.length === 0}
                className="flex flex-col items-center justify-center gap-0.5 px-3 py-3 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <span className="text-[13px] font-extrabold tracking-wide uppercase">AUTO BUILD TEAM</span>
                <span className="text-[10px] font-semibold text-text-secondary">Find the best team</span>
              </button>
              {selectedEntities.length > 0 && (
                <button
                  disabled={!canStart}
                  onClick={onStart}
                  className="flex flex-col items-center justify-center gap-0.5 px-3 py-3 rounded-xl text-white border border-[rgba(167,139,250,0.55)] bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="text-[13px] font-extrabold tracking-wide uppercase">START MISSION ⚡</span>
                  <span className="text-[10px] font-semibold text-white/80">{costSubtitle}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
