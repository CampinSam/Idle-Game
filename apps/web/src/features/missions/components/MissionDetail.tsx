import { useMemo, useState } from 'react';
import { getDifficultyDisplay } from '@derp/shared';
import { Badge } from '../../../components/ui';
import { EntityCard, EntityList } from '../../entities/components';
import { buildCollectionOptions, SORT_OPTIONS } from '../../entities/entityListUtils';
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
} from './missionUtils';
import type { EntityFilter, EntitySortBy } from '../../entities/types';
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
    currencyBalances,
    inventoryItems,
    error,
    onBack,
    onStart,
    entityPickerRef,
    synergyPreview,
    onDismissSynergy,
  } = props;

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

  const canAffordMission = preview != null
    ? (preview.canAfford ?? true)
    : missionCost.every(e => getHaveForEntry(e) >= e.amount);

  const powerRatio = missionPower > 0 ? Math.min(1, missionPower / (missionPower + difficulty)) : 0;

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
  const catIcon = getCategoryIcon(currentCat.name);

  const traitReqs = extractTraitRequirements(selectedDef.requirements);
  const recommendedNote = traitReqs.length > 0
    ? ` · ${traitReqs.map((r: { key: string; value: number }) => `${r.key} ${r.value}+`).join(', ')} preferred`
    : null;


  const handleAutoAssign = () => {
    const auto = idleEntities.slice(0, teamMax).map((b: any) => b.id);
    setSelectedEntities(() => auto);
    setShowEntityPicker(false);
    setTimeout(() => entityPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  const toggleEntity = (entityId: string) => {
    setSelectedEntities((prev) => {
      if (prev.includes(entityId)) return prev.filter(id => id !== entityId);
      if (prev.length >= teamMax) return prev;
      return [...prev, entityId];
    });
  };

  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFilter, setPickerFilter] = useState<EntityFilter>('ALL');
  const [pickerSort, setPickerSort] = useState<EntitySortBy>('name');

  const atMax = selectedEntities.length >= teamMax;
  const pickerDisabledIds = useMemo(
    () => atMax ? entities.filter((e: any) => !selectedEntities.includes(e.id)).map((e: any) => e.id) : [],
    [atMax, entities, selectedEntities],
  );

  const previewRequirements = preview?.requirements ?? [];
  const collectionOptions = buildCollectionOptions(entities);

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

        {/* Single scrollable area — hero scrolls freely, stats row sticks */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* Hero — scrolls up and out of view */}
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
            {/* Hidden for now — kept for future use */}
            <div className="hidden relative z-10 mt-3 px-2.5 py-1.5 rounded-md bg-black/40 backdrop-blur-sm text-[11px] font-bold tracking-wide text-[#c4b5fd] border border-white/10">
              👥 RECOMMENDED: {teamMax} {teamMax === 1 ? 'Entity' : 'Entities'}
              {keeperLvl > 0 && <span className="text-text-secondary"> · Keeper Lv {keeperLvl}+</span>}
              {recommendedNote && <span className="text-text-secondary">{recommendedNote}</span>}
            </div>
          </div>

          {/* Description — scrolls */}
          {selectedDef.description && (
            <p className="m-0 px-4 pt-3 text-[13px] leading-relaxed text-text-secondary">{selectedDef.description}</p>
          )}

          {/* Sticky stats row — pins when it reaches the top of the scroll container */}
          <div
            className="sticky top-0 z-10 px-4 pt-3 pb-2 flex flex-col gap-3"
            style={{
              background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            }}
          >
            {/* Requirements | Team Power vs Difficulty */}
            <div className="grid grid-cols-2 gap-3">
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
                        <span
                          className="flex-1 font-medium truncate"
                          style={{ color: r.met ? '#10b981' : '#ef4444' }}
                        >
                          {r.label ?? 'Requirement'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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

            {/* Synergy — part of the sticky block, rules only (no header/chips) */}
            {liveSynergy && liveSynergy.matchedRules.length > 0 && (
              <div className="rounded-xl border border-[rgba(139,92,246,0.25)] bg-black/20 px-3 py-2 flex flex-col gap-1">
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
            )}

            {/* Picker search/filter/sort — sticky when picker is open */}
            {showEntityPicker && (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-[7px] bg-[rgba(0,0,0,0.25)] border border-[rgba(139,92,246,0.18)] rounded-lg px-2.5 h-[34px] min-w-0 focus-within:border-[rgba(139,92,246,0.5)]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary flex-shrink-0">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    className="flex-1 bg-transparent border-none text-text-primary text-[12px] outline-none min-w-0 placeholder:text-text-secondary [font-family:'Exo_2',system-ui,sans-serif]"
                  />
                </div>
                <select
                  className="entity-list__select entity-list__select--collection"
                  value={pickerFilter}
                  onChange={(e) => setPickerFilter(e.target.value as EntityFilter)}
                  aria-label="Filter by collection"
                >
                  {collectionOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                <select
                  className="entity-list__select entity-list__select--sort"
                  value={pickerSort}
                  onChange={(e) => setPickerSort(e.target.value as EntitySortBy)}
                  aria-label="Sort by"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Your Team picker + error — scrolls below the sticky row */}
          <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
            <div ref={entityPickerRef} className={panelClass}>

              {/* Roster view header: "Your Team (X/Y)" — shown only when picker is closed */}
              {!showEntityPicker && (
                <span className={panelTitleClass}>Your Team ({selectedEntities.length}/{teamMax})</span>
              )}

              {/* Roster: current team cards + icon-only empty slot */}
              {!showEntityPicker && (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
                  {selectedEntities.map((entityId) => {
                    const entity = entities.find((b: any) => b.id === entityId);
                    if (!entity) return null;
                    return (
                      <EntityCard
                        key={entity.id}
                        entity={entity}
                        useCase="mission"
                        selected
                        onClick={() => toggleEntity(entity.id)}
                        onRemove={() => toggleEntity(entity.id)}
                      />
                    );
                  })}
                  {selectedEntities.length < teamMax && (
                    <button
                      type="button"
                      onClick={() => setShowEntityPicker(true)}
                      className="rounded-xl border-2 border-dashed border-white/15 bg-bg-card hover:border-white/25 cursor-pointer overflow-hidden p-0 transition-colors"
                    >
                      <div className="aspect-square flex items-center justify-center bg-white/[0.03]">
                        <span className="text-[28px] text-white/20 font-light">＋</span>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* Picker view: status row + entity grid (controls are in the sticky block above) */}
              {showEntityPicker && (
                <>
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-[10px] font-extrabold tracking-widest uppercase text-text-secondary">
                      Tap to toggle · {selectedEntities.length}/{teamMax} chosen
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowEntityPicker(false)}
                      className="text-[11px] font-extrabold tracking-wide text-[#c4b5fd] hover:text-white cursor-pointer"
                    >
                      ▲ Close
                    </button>
                  </div>
                  <EntityList
                    entities={entities}
                    mode="picker"
                    useCase="mission"
                    showControls={false}
                    search={pickerSearch}
                    onSearchChange={setPickerSearch}
                    activeFilter={pickerFilter}
                    onFilterChange={setPickerFilter}
                    sortBy={pickerSort}
                    onSortChange={setPickerSort}
                    selectedIds={selectedEntities}
                    disabledIds={pickerDisabledIds}
                    busyDisabledTooltip="Busy"
                    onSelect={(entity) => toggleEntity(entity.id)}
                  />
                </>
              )}
            </div>

            {error && (
              <div className="px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-xs">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Bottom action bar */}
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
                  onClick={onStart}
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
