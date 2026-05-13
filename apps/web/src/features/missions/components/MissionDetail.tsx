import { useMemo, useRef } from 'react';
import { getDifficultyDisplay } from '@derp/shared';
import { calculateInjuryChance } from '@derp/math';
import { Badge } from '../../../components/ui';
import { EntityCard, EntityList } from '../../entities/components';
import { getEntityMP } from '../../entities/utils';
import { MissionDetailFooter } from './MissionDetailFooter';
import {
  bgImageCss,
  displayCssVars,
  formatDuration,
  getCategoryIcon,
  getReqValue,
  resolveDisplay,
  type ReqStatusEntry,
} from './missionUtils';
import { BUSY_PICKER_TOOLTIP } from '../../inventory/utils/statChangeHelpers';

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
  } = props;

  const teamGridRef = useRef<HTMLDivElement>(null);

  const diffInfo = getDifficultyDisplay(selectedDef.difficulty);
  const display = resolveDisplay(selectedDef, missionCategoryDefs);
  const missionTags = selectedDef.tags || [];

  const missionCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(selectedDef.cost) ? selectedDef.cost : [];
  const getHaveForEntry = (entry: { type: string; id: string }) =>
    entry.type === 'currency'
      ? (currencyBalances[entry.id] ?? 0)
      : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id).reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
  const canAffordMission = missionCost.every(e => getHaveForEntry(e) >= e.amount);

  const heroCss = displayCssVars(display, { hero: true });

  const teamMin = getReqValue(selectedDef.requirements, 'team_size', 1, 'gte');
  const teamMax = getReqValue(selectedDef.requirements, 'team_size', 1, 'lte');
  const keeperLvl = getReqValue(selectedDef.requirements, 'keeper_level');
  const duration = selectedDef.timer?.duration ?? 0;
  const difficulty = selectedDef.difficulty || 100;

  const teamMP = useMemo(() => {
    return selectedEntities.reduce((sum, id) => {
      const entity = entities.find((b: any) => b.id === id);
      return sum + (entity ? getEntityMP(entity) : 0);
    }, 0);
  }, [selectedEntities, entities]);

  const successChance = useMemo(() => {
    if (selectedEntities.length === 0) return 0;
    const minChance = selectedDef.minSuccessChance ?? 0;
    const maxChance = selectedDef.maxSuccessChance ?? 100;
    const raw = teamMP / (teamMP + difficulty);
    return Math.round(Math.min(Math.max(raw * 100, minChance), maxChance));
  }, [teamMP, selectedDef, selectedEntities, difficulty]);

  const powerRatio = teamMP > 0 ? Math.min(1, teamMP / (teamMP + difficulty)) : 0;
  const teamMeetsMin = selectedEntities.length >= teamMin;
  const teamMeetsMax = selectedEntities.length <= teamMax;
  const canStart = teamMeetsMin && teamMeetsMax && canAffordMission && selectedEntities.length > 0;

  const injuryRate = selectedDef.injuryRate ?? 0;
  const injuryChance = useMemo(() => {
    if (injuryRate <= 0) return 0;
    return Math.round(calculateInjuryChance(difficulty, teamMP, injuryRate) * 100);
  }, [difficulty, teamMP, injuryRate]);
  const injuryColor = injuryChance >= 60 ? '#EF4444' : '#F59E0B';

  const grade = successChance >= 90 ? 'A' : successChance >= 75 ? 'B' : successChance >= 55 ? 'C' : successChance >= 35 ? 'D' : 'F';
  const gradeColor = successChance >= 75 ? '#10B981' : successChance >= 55 ? '#F59E0B' : '#EF4444';
  const successColor = successChance >= 70 ? '#10B981' : successChance >= 40 ? '#F59E0B' : '#EF4444';

  const reqStatus: ReqStatusEntry[] = Array.isArray(selectedDef.requirementStatus) ? selectedDef.requirementStatus : [];
  const catIcon = getCategoryIcon(currentCat.name);

  const traitReqs = Array.isArray(selectedDef.requirements)
    ? selectedDef.requirements.filter((r: { type: string }) => r.type === 'trait')
    : [];
  const recommendedNote = traitReqs.length > 0
    ? ` · ${traitReqs.map((r: { key?: string; value?: number }) => `${r.key ?? 'trait'} ${r.value ?? 1}+`).join(', ')} preferred`
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
    <div className="flex flex-col flex-1 min-h-0 pt-2 page-transition-wrapper">
      <div
        key={selectedDef.id}
        className="overflow-hidden rounded-2xl border flex flex-col relative motion-safe:animate-[detail-enter_0.28s_ease-out_both]"
        style={{
          borderColor: display.borderColor,
          background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)',
          height: 'calc(100dvh - 160px)',
          ...heroCss.vars,
        } as React.CSSProperties}
      >
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
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex flex-col items-start">
                    <span className="font-cinzel text-[22px] font-black text-[#10b981] tabular-nums">{Number(teamMP.toFixed(2))}</span>
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
              <div className="flex items-baseline gap-3" style={{ color: gradeColor }}>
                <span className="font-cinzel text-[40px] font-black leading-none">{grade}</span>
                <span className="text-[16px] font-bold tabular-nums">{successChance}%</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  {
                    icon: teamMeetsMin && teamMeetsMax ? '✅' : teamMeetsMax && !teamMeetsMin ? '⚠️' : '❌',
                    name: 'Team Size',
                    val: `${selectedEntities.length}/${teamMax}`,
                    color: undefined,
                  },
                  {
                    icon: canAffordMission ? '✅' : '❌',
                    name: 'Can Afford',
                    val: canAffordMission ? 'Yes' : 'No',
                    color: undefined,
                  },
                  ...(keeperLvl > 0 ? [{ icon: '🛡️', name: 'Keeper Lv', val: `${keeperLvl}+`, color: undefined }] : []),
                  {
                    icon: successChance >= 70 ? '✅' : successChance >= 40 ? '⚠️' : '❌',
                    name: 'Power Ratio',
                    val: successChance >= 70 ? 'Good' : successChance >= 40 ? 'Marginal' : 'Low',
                    color: successColor,
                  },
                  ...(injuryRate > 0 ? [{
                    icon: '⚠️',
                    name: 'Injury on Failure',
                    val: `${injuryChance}% chance`,
                    color: injuryColor,
                  }] : []),
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="text-base leading-none">{row.icon}</span>
                    <span className="flex-1 text-text-secondary">{row.name}</span>
                    <span className="font-bold text-text-primary tabular-nums" style={row.color ? { color: row.color } : undefined}>
                      {row.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

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
