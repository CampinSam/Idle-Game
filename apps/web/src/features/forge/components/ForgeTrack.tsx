import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCommand } from '../../../hooks/useCommand';
import { audioEngine } from '../../../services/AudioEngine';
import { computeInventoryAmount } from '../../../utils/locationProduction';
import { EntityList } from '../../entities/components';
import type { EntityForecast, EntityFilter, EntitySortBy } from '../../entities/types';
import { GameImage } from '../../../components/GameImage';
import { getEntityImagePath } from '../../../config/images';
import ItemQty from '../../../components/ItemQty';
import { ForgeRecipePicker } from './ForgeRecipePicker';
import { ForgeForecastPanel } from './ForgeForecastPanel';
import { QUALITY_COLOURS, fmtSeconds, type ForecastResponse } from './forgeUtils';

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

export function ForgeTrack({
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
  const [quantity, setQuantity] = useState(1);

  const selectedRecipe = useMemo(
    () => craftingRecipes.find((r: any) => r.id === recipeId) ?? null,
    [craftingRecipes, recipeId],
  );

  const multicraft = useMemo(() => selectedRecipe?.multicraft ?? null, [selectedRecipe]);

  // Reset quantity to 1 when recipe changes
  useEffect(() => { setQuantity(1); }, [recipeId]);
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

  const openRecipePicker = () => { setRecipePickerOpen(true); setEntityPickerOpen(false); };
  const openEntityPicker = () => { setEntityPickerOpen(true); setRecipePickerOpen(false); };
  const handleRecipeSelect = (r: any) => { setRecipeId(r.id); setRecipePickerOpen(false); };
  const handleEntitySelect = (entity: any) => { setEntityId(entity.id); setEntityPickerOpen(false); };

  const handleStart = async () => {
    if (!recipeId || !entityId) return;
    setBusy(true);
    setError('');
    try {
      await execute('StartCrafting', { recipeId, entityId, locationId: outpostId, quantity: multicraft ? quantity : 1 });
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

  const slotPromptClass = (open: boolean) =>
    `flex-1 min-h-[110px] flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed cursor-pointer transition-colors p-3 ${
      open
        ? 'border-[rgba(167,139,250,0.6)] bg-[rgba(139,92,246,0.1)]'
        : 'border-white/15 bg-white/[0.02] hover:border-white/30'
    }`;

  const slotCardBaseClass =
    'flex-1 min-h-[110px] text-left rounded-xl border-2 p-3 cursor-pointer flex flex-col gap-1 hover:brightness-110 transition-[filter]';

  return (
    <div className="rounded-2xl border border-[rgba(139,92,246,0.22)] bg-gradient-to-br from-[#1a1640] to-[#221a50] overflow-hidden">
      <div className="flex items-stretch gap-2 p-3">
        <div className="flex-1 flex">
          {selectedRecipe ? (
            <button
              className={slotCardBaseClass}
              style={{
                background: selectedRecipe.displayDef?.cardBackground || 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(34,24,88,0.7))',
                borderColor: selectedRecipe.displayDef?.borderColor || 'rgba(249,115,22,0.6)',
              }}
              onClick={openRecipePicker}
            >
              <div className="text-[10px] font-extrabold tracking-[0.1em] uppercase text-[#fcd34d]">Recipe</div>
              <div className="text-[14px] font-extrabold text-white truncate">{selectedRecipe.name}</div>
              <div className="flex items-center justify-between gap-2 mt-auto text-[11px] text-white/70">
                <span className="inline-flex items-center gap-1">
                  {(selectedRecipe.cost ?? []).length === 0
                    ? 'Free'
                    : (selectedRecipe.cost ?? []).map((c: any, i: number) => (
                        <ItemQty key={i} src={c.id} amount={c.amount} size={13} />
                      ))}
                </span>
                <span className="tabular-nums">{fmtSeconds(selectedRecipe.timer?.duration ?? 0)}</span>
              </div>
              <div className="text-[10px] text-white/50 mt-1 italic">Tap to change ↩</div>
            </button>
          ) : (
            <button className={slotPromptClass(recipePickerOpen)} onClick={openRecipePicker}>
              <div className="text-[28px]">📜</div>
              <div className="text-[12px] font-bold text-text-secondary uppercase tracking-wide">Choose Recipe</div>
            </button>
          )}
        </div>

        <div className="flex items-center justify-center text-[24px] font-light text-white/30 self-center">＋</div>

        <div className="flex-1 flex">
          {selectedEntityObj ? (
            <button
              className={slotCardBaseClass}
              style={{
                background: 'linear-gradient(135deg, rgba(96,165,250,0.14), rgba(34,24,88,0.7))',
                borderColor: 'rgba(96,165,250,0.55)',
              }}
              onClick={openEntityPicker}
            >
              <div className="text-[10px] font-extrabold tracking-[0.1em] uppercase text-[#93c5fd]">Derp</div>
              <div className="flex items-center gap-2.5">
                <div className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-black/40 flex items-center justify-center">
                  {selectedEntityObj.imageUrl ? (
                    <GameImage
                      src={getEntityImagePath(selectedEntityObj.id, selectedEntityObj.archetype, selectedEntityObj.imageUrl, 'thumb')}
                      category="entities"
                      alt={selectedEntityObj.name}
                      className="w-full h-full object-cover"
                      rounded
                    />
                  ) : (
                    <span className="text-[20px] font-black text-[#93c5fd]">{entityInitial}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="text-[14px] font-extrabold text-white truncate">{selectedEntityObj.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-white/70">
                    <span>Lvl {selectedEntityObj.level || 1}</span>
                    {selectedEntityForecast && (
                      <span style={{ color: QUALITY_COLOURS[selectedEntityForecast.expectedQuality] || '#94a3b8' }}>
                        CL {selectedEntityForecast.craftingLuck.toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-white/50 mt-auto italic">Tap to change ↩</div>
            </button>
          ) : (
            <button className={slotPromptClass(entityPickerOpen)} onClick={openEntityPicker}>
              <div className="text-[28px]">⚔️</div>
              <div className="text-[12px] font-bold text-text-secondary uppercase tracking-wide">Choose Derp</div>
            </button>
          )}
        </div>
      </div>

      {recipePickerOpen && (
        <div className="px-3 pb-3">
          <ForgeRecipePicker
            recipes={filteredRecipes}
            selectedRecipeId={recipeId}
            recipeSearch={recipeSearch}
            setRecipeSearch={setRecipeSearch}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            availabilityFilter={availabilityFilter}
            setAvailabilityFilter={setAvailabilityFilter}
            recipeCategories={recipeCategories}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onClose={() => setRecipePickerOpen(false)}
            onSelect={handleRecipeSelect}
            recipeIsLocked={recipeIsLocked}
            currencyBalances={currencyBalances}
            syncItemsTable={syncItemsTable}
            profile={profile}
            forecast={forecast}
          />
        </div>
      )}

      {entityPickerOpen && (
        <div className="px-3 pb-3">
          <div className="rounded-xl border border-[rgba(139,92,246,0.3)] bg-black/30 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-[13px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd] font-cinzel">
                Select a Derp
              </h3>
              <button
                onClick={() => setEntityPickerOpen(false)}
                aria-label="Close entity picker"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white text-lg leading-none hover:bg-white/10 cursor-pointer"
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
        </div>
      )}

      {recipeId && entityId && !recipePickerOpen && !entityPickerOpen && multicraft && (
        <div className="flex items-center gap-3 px-3 pt-3">
          <span className="text-[12px] font-bold text-[#c4b5fd]">Quantity</span>
          {multicraft.mode === 'tiers' && Array.isArray(multicraft.tiers) ? (
            <div className="flex gap-1.5">
              {(multicraft.tiers as number[]).map((qty: number) => (
                <button
                  key={qty}
                  onClick={() => setQuantity(qty)}
                  className={`px-3 py-1 rounded-lg text-[12px] font-bold border transition-colors ${
                    quantity === qty
                      ? 'bg-[rgba(139,92,246,0.3)] border-[rgba(139,92,246,0.7)] text-white'
                      : 'bg-black/20 border-white/15 text-slate-400 hover:border-white/30'
                  }`}
                >
                  {qty}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-7 h-7 rounded-lg border border-white/15 bg-black/20 text-slate-300 hover:border-white/30 font-bold text-[14px] flex items-center justify-center"
              >−</button>
              <span className="w-8 text-center text-[13px] font-bold text-white tabular-nums">{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(multicraft.max ?? 99, quantity + 1))}
                className="w-7 h-7 rounded-lg border border-white/15 bg-black/20 text-slate-300 hover:border-white/30 font-bold text-[14px] flex items-center justify-center"
              >+</button>
              {multicraft.max && (
                <span className="text-[11px] text-slate-500">/ {multicraft.max}</span>
              )}
            </div>
          )}
        </div>
      )}

      {recipeId && entityId && !recipePickerOpen && !entityPickerOpen && (
        forecast ? (
          <ForgeForecastPanel
            forecast={forecast}
            selectedEntityForecast={selectedEntityForecast}
            difficulty={selectedRecipe?.difficulty ?? 0}
            recipeTiers={selectedRecipe?.tiers ?? {}}
            busy={busy}
            blockedReasons={blockedReasons}
            error={error}
            onStart={handleStart}
          />
        ) : (
          <div className="flex flex-col gap-3 p-3 border-t border-[rgba(139,92,246,0.18)]">
            <div className="text-[12px] text-text-secondary italic text-center py-4">Loading forecast…</div>
            {error && (
              <div className="text-[12px] text-[#fca5a5] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {blockedReasons.length > 0 && (
              <ul className="list-none m-0 p-0 flex flex-col gap-1" role="alert">
                {blockedReasons.map((r, i) => (
                  <li key={i} className="text-[11px] text-[#fbbf24]">⚠️ {r}</li>
                ))}
              </ul>
            )}
            <button
              disabled
              className="w-full py-3 rounded-xl text-white text-[14px] font-extrabold uppercase tracking-[0.08em] cursor-not-allowed opacity-50"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
            >
              Loading…
            </button>
          </div>
        )
      )}
    </div>
  );
}
