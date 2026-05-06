import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncActiveCraftingJobs,
  useSyncCurrencyBalances,
} from '../../hooks/useSyncSelectors';
import { fetchCraftingRecipes } from '../../store/gameSlice';
import { useCommand } from '../../hooks/useCommand';
import { api } from '../../services/api';
import { audioEngine } from '../../services/AudioEngine';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../tick';
import { computeInventoryAmount } from '../../utils/locationProduction';
import {
  mergeDisplayStyles,
  overlayToCss,
  textStyleToCss,
  type DisplayStyle,
} from '@derp/shared';
import { workshopParallelSlots, workshopTimerMultiplier } from '@derp/math';
import { EntityList } from '../entities/components';
import type { EntityForecast } from '../entities/types';
import type { EntityFilter, EntitySortBy } from '../entities/types';
import { GameImage } from '../../components/GameImage';
import { getEntityImagePath } from '../../config/images';
import './ForgePage.css';

const FORGE_FALLBACK = {
  borderColor: '#f97316',
  backgroundImage: '/images/regions/sandcrypt-badlands.png',
  cardBackground: 'linear-gradient(180deg, rgba(249,115,22,0.18) 0%, rgba(34,24,88,0.95) 60%)',
};

const QUALITY_COLOURS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#34d399',
  rare: '#60a5fa',
  epic: '#c084fc',
};

function bgImageCss(bg?: string | null): string {
  if (!bg) return 'none';
  if (/^(linear-gradient|radial-gradient|url\()/i.test(bg)) return bg;
  return `url(${bg})`;
}

function fmtSeconds(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function costLabel(r: any): string {
  const cost: Array<{ type: string; id: string; amount: number }> = r?.cost ?? [];
  if (cost.length === 0) return 'Free';
  return cost.map((c) => `${c.amount} ${c.id.replace('soft_', '').replace('mat_', '')}`).join(' · ');
}

interface QualityProb { key: string; label: string; probability: number }
interface ForecastResponse {
  cap: number;
  tiers: Array<{ key: string; label: string; minCl: number }>;
  workshopTier: number;
  luckFloor: number;
  slotsTotal?: number;
  slotsUsed?: number;
  slotsOpen?: number;
  timerMultiplier?: number;
  recipeTierCap?: number;
  entities: Array<{
    entityId: string;
    name: string;
    level: number;
    status: string;
    idle: boolean;
    stats: { FOC: number; LCK: number };
    craftingLuck: number;
    rawCraftingLuck: number;
    luckFloor: number;
    probabilities: QualityProb[];
    expectedQuality: string;
    expectedQualityLabel: string;
  }>;
}

function ForecastBar({
  cap,
  tiers,
  marker,
  qualityKey,
}: {
  cap: number;
  tiers: ForecastResponse['tiers'];
  marker: number | null;
  qualityKey: string | null;
}) {
  const segs = useMemo(() => {
    const sorted = [...tiers].sort((a, b) => a.minCl - b.minCl);
    return sorted.map((t, i) => {
      const start = t.minCl;
      const end = i === sorted.length - 1 ? cap : sorted[i + 1].minCl;
      const widthPct = ((end - start) / cap) * 100;
      return { ...t, start, end, widthPct };
    });
  }, [tiers, cap]);

  const markerPct = marker == null ? null : Math.max(0, Math.min(100, (marker / cap) * 100));

  return (
    <div className="forge-forecast">
      <div className="forge-forecast-track">
        {segs.map((s) => (
          <div
            key={s.key}
            className={`forge-forecast-seg seg-${s.key} ${qualityKey === s.key ? 'is-active' : ''}`}
            style={{ width: `${s.widthPct}%`, background: QUALITY_COLOURS[s.key] || '#475569' }}
            title={`${s.label} — CL ≥ ${s.minCl}`}
          >
            <span className="forge-forecast-label">{s.label}</span>
          </div>
        ))}
        {markerPct != null && (
          <div className="forge-forecast-marker" style={{ left: `${markerPct}%` }} aria-hidden />
        )}
      </div>
      <div className="forge-forecast-axis">
        {segs.map((s) => (
          <span key={s.key} style={{ width: `${s.widthPct}%` }}>
            <small>{s.minCl}</small>
          </span>
        ))}
        <span className="forge-forecast-axis-end"><small>{cap}+</small></span>
      </div>
    </div>
  );
}

interface ForgeJobRowProps {
  job: any;
  entities: any[];
  craftingRecipes: any[];
  tick: number;
  tickRate: number;
  focusedJobId: string;
  focusedJobRef: React.RefObject<HTMLDivElement>;
  onCollect: (jobId: string) => void;
}

function ForgeJobRow({
  job,
  entities,
  craftingRecipes,
  tick,
  tickRate,
  focusedJobId,
  focusedJobRef,
  onCollect,
}: ForgeJobRowProps) {
  const timer = (job.startTick != null && job.durationTicks != null)
    ? createCountdownTimer({ startTick: job.startTick, durationTicks: job.durationTicks })
    : null;
  const remTicks = timer ? timer.getValue(tick) : Infinity;
  const remMs = timer && tickRate > 0 ? (remTicks / tickRate) * 1000 : Infinity;
  const isReady = remMs <= 0;
  const recipeDef = craftingRecipes.find((r: any) => r.id === job.recipeId);
  const entity = entities.find((e: any) => e.id === job.entityId);
  const entityName = entity?.name || 'Derp';
  const portraitInitial = entityName.trim().charAt(0).toUpperCase() || '?';
  const recipeTier = Number(recipeDef?.tier ?? 1);
  const tierClass = recipeTier >= 3 ? 'tier-3' : recipeTier >= 2 ? 'tier-2' : 'tier-1';
  const totalDurationTicks = Number(job.durationTicks ?? 0);
  const elapsedTicks = totalDurationTicks - (Number.isFinite(remTicks) ? Math.max(0, remTicks) : totalDurationTicks);
  const progress = totalDurationTicks > 0 ? Math.min(1, Math.max(0, elapsedTicks / totalDurationTicks)) : (isReady ? 1 : 0);
  const ringCircumference = 2 * Math.PI * 28;
  const ringDashOffset = ringCircumference * (1 - progress);
  const isFocused = focusedJobId && job.id === focusedJobId;

  return (
    <div
      ref={isFocused ? focusedJobRef : null}
      className={`forge-job-card forge-job-card--inline ${tierClass} ${isReady ? 'ready' : ''} ${isFocused ? 'is-focused' : ''}`}
    >
      <div className="forge-job-portrait">
        {entity?.imageUrl ? (
          <GameImage
            src={getEntityImagePath(entity.id, entity.archetype, entity.imageUrl, 'thumb')}
            category="entities"
            alt={entityName}
            className="forge-job-portrait-img"
            rounded
          />
        ) : (
          <span className="forge-job-portrait-initial">{portraitInitial}</span>
        )}
        <svg
          className="forge-job-ring"
          width="64"
          height="64"
          viewBox="0 0 64 64"
          aria-hidden="true"
        >
          <circle className="forge-job-ring-track" cx="32" cy="32" r="28" />
          <circle
            className="forge-job-ring-fill"
            cx="32"
            cy="32"
            r="28"
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringDashOffset}
          />
        </svg>
      </div>
      <div className="forge-job-info">
        <div className={`forge-job-eyebrow ${isReady ? 'forge-job-eyebrow--ready' : ''}`}>
          {isReady ? '✓ Ready to collect' : 'Crafting in progress'}
        </div>
        <div className="forge-job-name">{recipeDef?.name || job.recipeId}</div>
        <div className="forge-job-entity">{entityName}</div>
      </div>
      {isReady ? (
        <button className="forge-collect-btn" onClick={() => onCollect(job.id)}>
          Collect
        </button>
      ) : (
        <span className="forge-job-time">{fmtSeconds(remMs / 1000)} left</span>
      )}
    </div>
  );
}

interface ForgeTrackProps {
  slotId: string;
  outpostId: string | undefined;
  craftingRecipes: any[];
  idleEntities: any[];
  forecast: ForecastResponse | null;
  currencyBalances: Record<string, number>;
  syncItemsTable: any;
  profile: any;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onCraftComplete: (slotId: string) => void;
  onRequestForecastRefresh: () => void;
  execute: ReturnType<typeof useCommand>['execute'];
  recipeCategories: string[];
}

function ForgeTrack({
  slotId,
  outpostId,
  craftingRecipes,
  idleEntities,
  forecast,
  currencyBalances,
  syncItemsTable,
  profile,
  favorites,
  onToggleFavorite,
  onCraftComplete,
  onRequestForecastRefresh,
  execute,
  recipeCategories,
}: ForgeTrackProps) {
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [recipePickerOpen, setRecipePickerOpen] = useState(false);
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'available' | 'locked' | 'favorites' | 'all'>('available');
  const [entitySearch, setEntitySearch] = useState('');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('ALL');
  const [entitySort, setEntitySort] = useState<EntitySortBy>('name');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedRecipe = useMemo(
    () => craftingRecipes.find((r: any) => r.id === recipeId) ?? null,
    [craftingRecipes, recipeId],
  );

  const selectedEntityObj = useMemo(
    () => idleEntities.find((e: any) => e.id === entityId) ?? null,
    [idleEntities, entityId],
  );

  const selectedEntityForecast = useMemo(
    () => (entityId && forecast ? forecast.entities.find((e) => e.entityId === entityId) ?? null : null),
    [entityId, forecast],
  );

  const forecasts = useMemo<Record<string, EntityForecast>>(() => {
    const m: Record<string, EntityForecast> = {};
    forecast?.entities.forEach((f) => { m[f.entityId] = f as EntityForecast; });
    return m;
  }, [forecast]);

  const recipeIsAvailable = useCallback((r: any): boolean => {
    if (profile && (r.requiredKeeperLevel || 1) > profile.keeperLevel) return false;
    const recipeTier = Number(r.tier ?? 1);
    const tierCap = forecast?.recipeTierCap;
    if (typeof tierCap === 'number' && recipeTier > tierCap) return false;
    const slotsOpen = forecast?.slotsOpen;
    if (typeof slotsOpen === 'number' && slotsOpen <= 0) return false;
    const cost: Array<{ type: string; id: string; amount: number }> = r.cost ?? [];
    for (const c of cost) {
      if (c.type === 'currency') {
        if ((currencyBalances[c.id] ?? 0) < c.amount) return false;
      } else {
        const have = computeInventoryAmount('ITEM', c.id, syncItemsTable, currencyBalances);
        if (have < c.amount) return false;
      }
    }
    return true;
  }, [profile, currencyBalances, syncItemsTable, forecast?.recipeTierCap, forecast?.slotsOpen]);

  const recipeIsLocked = useCallback((r: any): boolean => {
    if (profile && (r.requiredKeeperLevel || 1) > profile.keeperLevel) return true;
    const recipeTier = Number(r.tier ?? 1);
    const tierCap = forecast?.recipeTierCap;
    if (typeof tierCap === 'number' && recipeTier > tierCap) return true;
    return false;
  }, [profile, forecast?.recipeTierCap]);

  const filteredRecipes = useMemo(() => {
    const search = recipeSearch.trim().toLowerCase();
    return (craftingRecipes as any[]).filter((r: any) => {
      if (categoryFilter !== 'all') {
        const cat = (r.category || r.group || 'general') as string;
        if (cat !== categoryFilter) return false;
      }
      if (availabilityFilter === 'available' && !recipeIsAvailable(r)) return false;
      if (availabilityFilter === 'locked' && !recipeIsLocked(r)) return false;
      if (availabilityFilter === 'favorites' && !favorites.has(r.id)) return false;
      if (search) {
        const hay = `${r.name || ''} ${r.description || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }, [craftingRecipes, categoryFilter, recipeSearch, availabilityFilter, favorites, recipeIsAvailable, recipeIsLocked]);

  const blockedReasons = useMemo<string[]>(() => {
    if (!selectedRecipe) return [];
    const reasons: string[] = [];
    const cost: Array<{ type: string; id: string; amount: number }> = selectedRecipe.cost ?? [];
    for (const c of cost) {
      const label = c.id.replace('soft_', '').replace('mat_', '').replace(/_/g, ' ');
      if (c.type === 'currency') {
        const have = currencyBalances[c.id] ?? 0;
        if (have < c.amount) reasons.push(`Need ${c.amount - have} more ${label}`);
      } else {
        const have = computeInventoryAmount('ITEM', c.id, syncItemsTable, currencyBalances);
        if (have < c.amount) reasons.push(`Need ${c.amount - have} more ${label}`);
      }
    }
    if (profile && (selectedRecipe.requiredKeeperLevel || 1) > profile.keeperLevel) {
      reasons.push(`Requires Keeper Lvl ${selectedRecipe.requiredKeeperLevel}`);
    }
    const recipeTierNum = Number(selectedRecipe.tier ?? 1);
    const tierCap = forecast?.recipeTierCap;
    if (typeof tierCap === 'number' && recipeTierNum > tierCap) {
      reasons.push(`Requires Tier ${recipeTierNum} Workshop (this Forge is Tier ${tierCap})`);
    }
    const slotsOpen = forecast?.slotsOpen;
    if (typeof slotsOpen === 'number' && slotsOpen <= 0) {
      reasons.push('All crucibles are busy — collect a finished craft first');
    }
    if (idleEntities.length === 0) {
      reasons.push('No idle Derps available');
    }
    return reasons;
  }, [selectedRecipe, currencyBalances, syncItemsTable, profile, idleEntities.length, forecast?.recipeTierCap, forecast?.slotsOpen]);

  const openRecipePicker = () => {
    setRecipePickerOpen(true);
    setEntityPickerOpen(false);
  };

  const openEntityPicker = () => {
    setEntityPickerOpen(true);
    setRecipePickerOpen(false);
  };

  const handleRecipeSelect = (r: any) => {
    setRecipeId(r.id);
    setRecipePickerOpen(false);
  };

  const handleEntitySelect = (entity: any) => {
    setEntityId(entity.id);
    setEntityPickerOpen(false);
  };

  const handleStart = async () => {
    if (!recipeId || !entityId) return;
    setBusy(true);
    setError('');
    try {
      await execute('StartCrafting', { recipeId, entityId, locationId: outpostId });
      audioEngine.play('sfx.craft.start');
      onCraftComplete(slotId);
    } catch (e: any) {
      audioEngine.play('ui.error');
      setError(e?.message || 'Failed to start crafting');
      setBusy(false);
    }
  };

  useEffect(() => {
    if (recipeId && entityId) {
      const t = setTimeout(onRequestForecastRefresh, 300);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, entityId]);

  const entityInitial = (selectedEntityObj?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="forge-track">
      <div className="forge-track-selectors">
        <div className="forge-track-slot">
          {selectedRecipe ? (
            <button
              className="forge-slot-card forge-slot-card--recipe"
              style={{
                background: selectedRecipe.displayDef?.cardBackground || 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(34,24,88,0.7))',
                borderColor: selectedRecipe.displayDef?.borderColor || 'rgba(249,115,22,0.6)',
              }}
              onClick={openRecipePicker}
            >
              <div className="forge-slot-card__eyebrow">Recipe</div>
              <div className="forge-slot-card__title">{selectedRecipe.name}</div>
              <div className="forge-slot-card__meta">
                <span>{costLabel(selectedRecipe)}</span>
                <span>{fmtSeconds(selectedRecipe.timer?.duration ?? 0)}</span>
              </div>
              <div className="forge-slot-card__change">Tap to change ↩</div>
            </button>
          ) : (
            <button
              className={`forge-slot-prompt forge-slot-prompt--recipe${recipePickerOpen ? ' is-open' : ''}`}
              onClick={openRecipePicker}
            >
              <div className="forge-slot-prompt__icon">📜</div>
              <div className="forge-slot-prompt__label">Choose Recipe</div>
            </button>
          )}
        </div>

        <div className="forge-track-plus">＋</div>

        <div className="forge-track-slot">
          {selectedEntityObj ? (
            <button
              className="forge-slot-card forge-slot-card--entity"
              onClick={openEntityPicker}
            >
              <div className="forge-slot-card__eyebrow">Derp</div>
              <div className="forge-slot-card__entity-row">
                <div className="forge-slot-card__portrait">
                  {selectedEntityObj.imageUrl ? (
                    <GameImage
                      src={getEntityImagePath(selectedEntityObj.id, selectedEntityObj.archetype, selectedEntityObj.imageUrl, 'thumb')}
                      category="entities"
                      alt={selectedEntityObj.name}
                      className="forge-slot-card__portrait-img"
                      rounded
                    />
                  ) : (
                    <span className="forge-slot-card__portrait-initial">{entityInitial}</span>
                  )}
                </div>
                <div className="forge-slot-card__entity-info">
                  <div className="forge-slot-card__title">{selectedEntityObj.name}</div>
                  <div className="forge-slot-card__meta">
                    <span>Lvl {selectedEntityObj.level || 1}</span>
                    {selectedEntityForecast && (
                      <span style={{ color: QUALITY_COLOURS[selectedEntityForecast.expectedQuality] || '#94a3b8' }}>
                        CL {selectedEntityForecast.craftingLuck.toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="forge-slot-card__change">Tap to change ↩</div>
            </button>
          ) : (
            <button
              className={`forge-slot-prompt forge-slot-prompt--entity${entityPickerOpen ? ' is-open' : ''}`}
              onClick={openEntityPicker}
            >
              <div className="forge-slot-prompt__icon">⚔️</div>
              <div className="forge-slot-prompt__label">Choose Derp</div>
            </button>
          )}
        </div>
      </div>

      {recipePickerOpen && (
        <div className="forge-track-picker">
          <div className="forge-picker-header">
            <h3 className="forge-picker-title">Select a Recipe</h3>
            <button
              className="forge-picker-close"
              onClick={() => setRecipePickerOpen(false)}
              aria-label="Close recipe picker"
            >
              ×
            </button>
          </div>
          <div className="forge-codex-controls">
            <input
              type="text"
              className="forge-codex-search"
              placeholder="Search recipes…"
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              aria-label="Search recipes"
            />
            <div className="forge-codex-cats" role="tablist" aria-label="Availability filter">
              {(['available', 'locked', 'favorites', 'all'] as const).map((key) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={availabilityFilter === key}
                  className={`forge-codex-cat forge-codex-pill ${availabilityFilter === key ? 'is-active' : ''}`}
                  onClick={() => setAvailabilityFilter(key)}
                >
                  {key === 'all' ? 'All' : key === 'available' ? '✓ Available' : key === 'locked' ? '🔒 Locked' : '★ Favorites'}
                </button>
              ))}
            </div>
            {recipeCategories.length > 1 && (
              <div className="forge-codex-cats" role="tablist" aria-label="Category filter">
                <button
                  role="tab"
                  aria-selected={categoryFilter === 'all'}
                  className={`forge-codex-cat ${categoryFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setCategoryFilter('all')}
                >
                  All
                </button>
                {recipeCategories.map((cat) => (
                  <button
                    key={cat}
                    role="tab"
                    aria-selected={categoryFilter === cat}
                    className={`forge-codex-cat ${categoryFilter === cat ? 'is-active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          {filteredRecipes.length === 0 && (
            <div className="forge-empty">No recipes match your search.</div>
          )}
          <div className="forge-recipe-grid">
            {filteredRecipes.map((r: any) => {
              const cost: Array<{ type: string; id: string; amount: number }> = r.cost ?? [];
              const canAfford = cost.every((c) =>
                c.type === 'currency'
                  ? (currencyBalances[c.id] ?? 0) >= c.amount
                  : computeInventoryAmount('ITEM', c.id, syncItemsTable, currencyBalances) >= c.amount);
              const meetsLevel = !profile || profile.keeperLevel >= (r.requiredKeeperLevel || 1);
              const isLocked = recipeIsLocked(r);
              const recipeTierNum = Number(r.tier ?? 1);
              const tierCap = forecast?.recipeTierCap;
              const tierLocked = typeof tierCap === 'number' && recipeTierNum > tierCap;
              const dd = r.displayDef;
              const cardStyle: DisplayStyle = mergeDisplayStyles(undefined, dd?.style);
              const isFav = favorites.has(r.id);
              return (
                <div key={r.id} className="forge-recipe-card-wrap">
                  <button
                    className={`forge-recipe-card ${recipeId === r.id ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''}`}
                    style={{
                      background: dd?.cardBackground || 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(34,24,88,0.6))',
                      borderColor: dd?.borderColor || 'rgba(139,92,246,0.45)',
                    }}
                    onClick={() => handleRecipeSelect(r)}
                    title={
                      !meetsLevel
                        ? `Requires Keeper Lvl ${r.requiredKeeperLevel}`
                        : tierLocked
                          ? `Requires Tier ${recipeTierNum} Workshop`
                          : undefined
                    }
                  >
                    <div className="forge-recipe-title" style={textStyleToCss(cardStyle.title) as React.CSSProperties}>
                      {r.name}
                    </div>
                    {r.description && (
                      <div className="forge-recipe-desc" style={textStyleToCss(cardStyle.body) as React.CSSProperties}>
                        {r.description}
                      </div>
                    )}
                    <div className="forge-recipe-meta">
                      <span className={canAfford ? '' : 'is-bad'}>
                        {cost.length === 0 ? 'Free' : cost.map((c) => `${c.amount} ${c.id.replace('soft_', '').replace('mat_', '')}`).join(' · ')}
                      </span>
                      <span>{fmtSeconds(r.timer?.duration ?? 0)}</span>
                      {!meetsLevel && <span className="is-locked-tag">Lvl {r.requiredKeeperLevel}</span>}
                      {tierLocked && <span className="is-locked-tag is-tier-lock">Needs T{recipeTierNum} Workshop</span>}
                    </div>
                  </button>
                  <button
                    className={`forge-recipe-fav ${isFav ? 'is-fav' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(r.id); }}
                    aria-label={isFav ? 'Unfavorite recipe' : 'Favorite recipe'}
                    aria-pressed={isFav}
                    type="button"
                  >
                    {isFav ? '★' : '☆'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {entityPickerOpen && (
        <div className="forge-track-picker">
          <div className="forge-picker-header">
            <h3 className="forge-picker-title">Select a Derp</h3>
            <button
              className="forge-picker-close"
              onClick={() => setEntityPickerOpen(false)}
              aria-label="Close entity picker"
            >
              ×
            </button>
          </div>
          <EntityList
            entities={idleEntities}
            mode="picker"
            useCase="crafting"
            showControls={true}
            search={entitySearch}
            onSearchChange={setEntitySearch}
            activeFilter={entityFilter}
            onFilterChange={setEntityFilter}
            sortBy={entitySort}
            onSortChange={setEntitySort}
            selectedIds={entityId ? [entityId] : []}
            onSelect={handleEntitySelect}
            forecasts={forecasts}
            qualityColors={QUALITY_COLOURS}
            emptyMessage="No idle Derps. Pull one back from a mission."
          />
        </div>
      )}

      {recipeId && entityId && !recipePickerOpen && !entityPickerOpen && (
        <div className="forge-track-footer">
          {forecast && (
            <div className="forge-forecast-box">
              <div className="forge-forecast-head">
                <span>Crafting Luck</span>
                {selectedEntityForecast && (
                  <span style={{ color: QUALITY_COLOURS[selectedEntityForecast.expectedQuality] || '#94a3b8' }}>
                    CL {selectedEntityForecast.craftingLuck.toFixed(0)} → {selectedEntityForecast.expectedQualityLabel}
                  </span>
                )}
              </div>
              <ForecastBar
                cap={forecast.cap}
                tiers={forecast.tiers}
                marker={selectedEntityForecast?.craftingLuck ?? null}
                qualityKey={selectedEntityForecast?.expectedQuality ?? null}
              />
              {selectedEntityForecast ? (
                <div className="forge-forecast-probs">
                  {selectedEntityForecast.probabilities.map((p) => (
                    <div key={p.key} className="forge-forecast-prob">
                      <div className="forge-forecast-prob-label" style={{ color: QUALITY_COLOURS[p.key] || '#94a3b8' }}>
                        {p.label}
                      </div>
                      <div className="forge-forecast-prob-bar">
                        <div
                          className="forge-forecast-prob-fill"
                          style={{ width: `${p.probability * 100}%`, background: QUALITY_COLOURS[p.key] || '#475569' }}
                        />
                      </div>
                      <div className="forge-forecast-prob-pct">{(p.probability * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                  {forecast.luckFloor > 0 && selectedEntityForecast.rawCraftingLuck < forecast.luckFloor && (
                    <div className="forge-forecast-floor-note">
                      ⚒️ Workshop Tier {forecast.workshopTier} sets a luck floor of {forecast.luckFloor} (raw CL {selectedEntityForecast.rawCraftingLuck.toFixed(0)}).
                    </div>
                  )}
                </div>
              ) : (
                <div className="forge-forecast-hint">Loading forecast…</div>
              )}
            </div>
          )}

          {error && <div className="forge-track-error">{error}</div>}

          {blockedReasons.length > 0 && (
            <ul className="forge-blocked-reasons" role="alert">
              {blockedReasons.map((r, i) => (
                <li key={i}>⚠️ {r}</li>
              ))}
            </ul>
          )}

          <button
            className="forge-start-btn"
            disabled={busy || blockedReasons.length > 0 || !forecast}
            onClick={handleStart}
            title={blockedReasons[0] ?? (!forecast ? 'Loading workshop data…' : undefined)}
          >
            {busy
              ? 'Igniting…'
              : blockedReasons.length > 0
                ? blockedReasons[0]
                : `Begin Crafting (${costLabel(selectedRecipe)})`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ForgePage() {
  const { id: outpostId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get('craftJob') || '';
  const focusedJobRef = useRef<HTMLDivElement | null>(null);
  const dispatch = useAppDispatch();
  const { execute } = useCommand();
  const tick = useCurrentTick();
  const tickRate = useTickRate();

  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const syncItemsTable = useAppSelector((s) => s.sync.items);
  const allActiveCraftingJobs = useSyncActiveCraftingJobs();
  const activeCraftingJobs = useMemo(
    () => allActiveCraftingJobs.filter(
      (j: any) => (j.data?.locationId || j.locationId) === outpostId,
    ),
    [allActiveCraftingJobs, outpostId],
  );
  const currencyBalances = useSyncCurrencyBalances();
  const { craftingRecipes } = useAppSelector((s) => s.game);

  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState('');
  const [workshopChecked, setWorkshopChecked] = useState(false);
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const prevEmptyRef = useRef<number | null>(null);
  const [workshopLevel, setWorkshopLevel] = useState(1);
  const [workshopInfo, setWorkshopInfo] = useState<any>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('forge:favorites');
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set<string>(); }
  });

  const toggleFavorite = useCallback((recipeId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      try { localStorage.setItem('forge:favorites', JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!outpostId) {
      navigate('/locations', { replace: true });
      return;
    }
    let cancelled = false;
    setWorkshopChecked(false);
    api.getCraftingWorkshopAtLocation(outpostId)
      .then((info: any) => {
        if (cancelled) return;
        setWorkshopChecked(true);
        setWorkshopInfo(info || null);
        if (info?.level) setWorkshopLevel(Number(info.level));
      })
      .catch(() => {
        if (cancelled) return;
        navigate(`/locations/${outpostId}`, { replace: true });
      });
    return () => { cancelled = true; };
  }, [outpostId, navigate]);

  useEffect(() => {
    dispatch(fetchCraftingRecipes());
  }, [dispatch]);

  useEffect(() => {
    if (!focusedJobId) return;
    const t = setTimeout(() => {
      focusedJobRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => clearTimeout(t);
  }, [focusedJobId, allActiveCraftingJobs.length]);

  const forecastBucket = Math.floor(tick / 30);
  const refreshForecast = useCallback(() => {
    let cancelled = false;
    api.getCraftingForecast(true, outpostId)
      .then((data) => { if (!cancelled) setForecast(data); })
      .catch(() => { if (!cancelled) setForecast(null); });
    return () => { cancelled = true; };
  }, [outpostId]);
  useEffect(() => {
    return refreshForecast();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastBucket, outpostId]);

  const maxSlots = forecast?.slotsTotal ?? workshopParallelSlots(workshopLevel);
  const usedSlots = forecast?.slotsUsed ?? activeCraftingJobs.length;
  const emptySlots = Math.max(0, maxSlots - usedSlots);

  useEffect(() => {
    if (!workshopChecked) return;
    const prev = prevEmptyRef.current;
    prevEmptyRef.current = emptySlots;
    if (prev === null) {
      setSlotIds(Array.from({ length: emptySlots }, () => crypto.randomUUID()));
      return;
    }
    if (emptySlots > prev) {
      setSlotIds((ids) => [
        ...ids,
        ...Array.from({ length: emptySlots - prev }, () => crypto.randomUUID()),
      ]);
    } else if (emptySlots < prev) {
      setSlotIds((ids) => (ids.length > emptySlots ? ids.slice(0, emptySlots) : ids));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emptySlots, workshopChecked]);

  const removeSlotId = useCallback((id: string) => {
    setSlotIds((prev) => prev.filter((s) => s !== id));
  }, []);

  const idleEntities = useMemo(() => {
    const list = entities.filter((e: any) => e.status === 'idle');
    if (!forecast) return list;
    const luck = new Map<string, number>(forecast.entities.map((f) => [f.entityId, f.craftingLuck]));
    return [...list].sort((a: any, b: any) => (luck.get(b.id) ?? -1) - (luck.get(a.id) ?? -1));
  }, [entities, forecast]);

  const recipeCategories = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const r of craftingRecipes as any[]) {
      const cat = (r.category || r.group || 'general') as string;
      set.add(cat);
    }
    return Array.from(set).sort();
  }, [craftingRecipes]);

  const heroStyle: DisplayStyle = useMemo(
    () => mergeDisplayStyles(undefined, workshopInfo?.displayDef?.style),
    [workshopInfo],
  );
  const heroOverlay = overlayToCss(heroStyle.overlay);
  const heroBgImage = workshopInfo?.displayDef?.backgroundImage || FORGE_FALLBACK.backgroundImage;
  const heroBorderColor = workshopInfo?.displayDef?.borderColor || FORGE_FALLBACK.borderColor;
  const heroTitleStyle = textStyleToCss(heroStyle.title);
  const heroBodyStyle = textStyleToCss(heroStyle.body);

  const handleCollect = async (jobId: string) => {
    setError('');
    try {
      await execute('CollectCrafting', { jobId });
    } catch (e: any) {
      setError(e?.message || 'Failed to collect');
    }
  };

  const backDest = outpostId ? `/locations/${outpostId}` : '/locations';

  if (!workshopChecked) {
    return (
      <div className="forge-page">
        <div className="forge-sticky-back">
          <button className="forge-back-btn" onClick={() => navigate(backDest)} aria-label="Back to Outpost">
            ← Back to Outpost
          </button>
        </div>
        <div className="forge-loading">Validating workshop…</div>
      </div>
    );
  }

  return (
    <div className="forge-page">
      <div className="forge-sticky-back">
        <button className="forge-back-btn" onClick={() => navigate(backDest)} aria-label="Back to Outpost">
          ← Back to Outpost
        </button>
      </div>

      <div
        className="forge-hero"
        style={{
          backgroundImage: bgImageCss(heroBgImage),
          borderColor: heroBorderColor,
        }}
      >
        <div className="forge-hero-overlay" style={{ background: heroOverlay || 'rgba(12,10,26,0.55)' }} />
        <div className="forge-hero-content">
          <div className="forge-hero-eyebrow" style={heroBodyStyle}>
            ⚒️  {workshopInfo?.locationName ? workshopInfo.locationName.toUpperCase() : 'WORKSHOP'}
          </div>
          <h1 className="forge-hero-title" style={heroTitleStyle}>
            {workshopInfo?.name || 'The Forge'}
          </h1>
          <p className="forge-hero-blurb" style={heroBodyStyle}>
            Crucibles roar, anvils sing. Pick a recipe, assign a Derp, and let server-side luck shape what you'll pull from the flames.
          </p>
          {(() => {
            const tier = forecast?.workshopTier ?? Math.max(1, Number(workshopLevel || 1));
            const slotsTotal = forecast?.slotsTotal ?? workshopParallelSlots(tier);
            const slotsUsed = forecast?.slotsUsed ?? activeCraftingJobs.length;
            const multiplier = forecast?.timerMultiplier ?? workshopTimerMultiplier(tier);
            const speedupPct = Math.round((1 - multiplier) * 100);
            const slotsFull = slotsUsed >= slotsTotal;
            return (
              <div className="forge-hero-pills" aria-label="Workshop perks">
                <span className={`forge-pill forge-pill-tier tier-${Math.min(3, Math.max(1, tier))}`}>
                  T{tier} Workshop
                </span>
                <span className={`forge-pill forge-pill-slots ${slotsFull ? 'is-full' : ''}`}>
                  {slotsUsed} / {slotsTotal} {slotsTotal === 1 ? 'slot' : 'slots'}
                </span>
                <span className={`forge-pill forge-pill-timer ${speedupPct > 0 ? 'is-bonus' : 'is-base'}`}>
                  {speedupPct > 0 ? `−${speedupPct}% craft time` : 'Standard craft time'}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {error && <div className="forge-error">{error}</div>}

      {maxSlots > 0 && (
        <section className="forge-section forge-crucibles-section">
          <div className="forge-section-head">
            <h2>Crucibles</h2>
            <span className="forge-section-sub">{usedSlots} / {maxSlots} active</span>
          </div>
          <div className="forge-tracks">
            {activeCraftingJobs.map((job: any) => (
              <ForgeJobRow
                key={job.id}
                job={job}
                entities={entities}
                craftingRecipes={craftingRecipes as any[]}
                tick={tick}
                tickRate={tickRate}
                focusedJobId={focusedJobId}
                focusedJobRef={focusedJobRef}
                onCollect={handleCollect}
              />
            ))}
            {slotIds.map((id) => (
              <ForgeTrack
                key={id}
                slotId={id}
                outpostId={outpostId}
                craftingRecipes={craftingRecipes as any[]}
                idleEntities={idleEntities}
                forecast={forecast}
                currencyBalances={currencyBalances}
                syncItemsTable={syncItemsTable}
                profile={profile}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onCraftComplete={removeSlotId}
                onRequestForecastRefresh={refreshForecast}
                execute={execute}
                recipeCategories={recipeCategories}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
