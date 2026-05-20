import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncActiveCraftingJobs,
  useSyncCurrencyBalances,
  useSyncBuildings,
} from '../../hooks/useSyncSelectors';
import { fetchCraftingRecipes } from '../../store/gameSlice';
import { useCommand } from '../../hooks/useCommand';
import { api } from '../../services/api';
import { useJobPreview } from '../jobs/useJobPreview';
import { workshopParallelSlots } from '@derp/math';
import { audioEngine } from '../../services/AudioEngine';
import { computeInventoryAmount } from '../../utils/locationProduction';
import { EntityList } from '../entities/components';
import type { EntityFilter, EntitySortBy } from '../entities/types';
import ItemQty from '../../components/ItemQty';
import { SectionHeader } from '../../components/ui';
import { ForgeJobRow } from './components/ForgeJobRow';
import { ForgeRecipePicker } from './components/ForgeRecipePicker';
import { RarityCurveChart } from './components/RarityCurveChart';
import { QUALITY_COLOURS, fmtSeconds } from './components/forgeUtils';

export default function ForgePage() {
  const { id: outpostId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get('craftJob') || '';
  const focusedJobRef = useRef<HTMLDivElement | null>(null);
  const dispatch = useAppDispatch();
  const { execute } = useCommand();

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
  const allBuildings = useSyncBuildings();

  const [workshopInfo, setWorkshopInfo] = useState<any>(null);
  const [workshopChecked, setWorkshopChecked] = useState(false);
  const [workshopLevel, setWorkshopLevel] = useState(1);

  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<'recipe' | 'entity' | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [craftError, setCraftError] = useState('');
  const [jobsExpanded, setJobsExpanded] = useState(false);

  const [recipeSearch, setRecipeSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'available' | 'locked' | 'favorites' | 'all'>('available');
  const [entitySearch, setEntitySearch] = useState('');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('ALL');
  const [entitySort, setEntitySort] = useState<EntitySortBy>('name');

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
    if (!outpostId) { navigate('/locations', { replace: true }); return; }
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

  useEffect(() => { dispatch(fetchCraftingRecipes()); }, [dispatch]);

  useEffect(() => {
    if (!focusedJobId) return;
    const t = setTimeout(() => {
      focusedJobRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => clearTimeout(t);
  }, [focusedJobId, allActiveCraftingJobs.length]);

  const selectedRecipe = useMemo(
    () => (craftingRecipes as any[]).find((r: any) => r.id === selectedRecipeId) ?? null,
    [craftingRecipes, selectedRecipeId],
  );
  const multicraft = selectedRecipe?.multicraft ?? null;

  useEffect(() => {
    if (multicraft?.mode === 'tiers' && Array.isArray(multicraft.tiers) && multicraft.tiers.length > 0) {
      setQuantity(multicraft.tiers[0]);
    } else {
      setQuantity(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipeId]);

  const selectedEntityObj = useMemo(
    () => entities.find((e: any) => e.id === selectedEntityId && e.status === 'idle') ?? null,
    [entities, selectedEntityId],
  );

  const centerOverrides = useMemo<Partial<Record<string, number>>>(() => {
    if (!selectedRecipe?.tiers) return {};
    const overrides: Partial<Record<string, number>> = {};
    for (const [key, block] of Object.entries(selectedRecipe.tiers as Record<string, any>)) {
      if (key !== 'failure' && block && typeof (block as any).clRequirement === 'number') {
        overrides[key] = (block as any).clRequirement;
      }
    }
    return overrides;
  }, [selectedRecipe]);

  const { preview } = useJobPreview({
    jobType: 'crafting',
    defId: selectedRecipeId ?? '',
    entityId: selectedEntityId ?? undefined,
    quantity,
    locationId: outpostId,
    debounceMs: 300,
  });
  const craftPreview = preview?.crafting ?? null;

  const workshopTier = craftPreview?.workshopTier ?? Math.max(1, workshopLevel);
  const slotsTotal = craftPreview?.slotsTotal ?? workshopParallelSlots(workshopTier);
  const slotsUsed = craftPreview?.slotsUsed ?? activeCraftingJobs.length;
  const slotsOpen = craftPreview?.slotsOpen ?? Math.max(0, slotsTotal - slotsUsed);

  const recipeIsLocked = useCallback((r: any): boolean => {
    if (profile && (r.requiredKeeperLevel || 1) > profile.keeperLevel) return true;
    const recipeTierNum = Number(r.tier ?? 1);
    const tierCap = craftPreview?.recipeTierCap ?? workshopLevel;
    if (typeof tierCap === 'number' && recipeTierNum > tierCap) return true;
    return false;
  }, [profile, craftPreview?.recipeTierCap, workshopLevel]);

  const recipeIsAvailable = useCallback((r: any): boolean => {
    if (recipeIsLocked(r)) return false;
    if (slotsOpen <= 0) return false;
    const cost: Array<{ type: string; id: string; amount: number }> = r.cost ?? [];
    for (const c of cost) {
      const have = c.type === 'currency'
        ? (currencyBalances[c.id] ?? 0)
        : computeInventoryAmount('ITEM', c.id, syncItemsTable, currencyBalances);
      if (have < c.amount) return false;
    }
    return true;
  }, [recipeIsLocked, slotsOpen, currencyBalances, syncItemsTable]);

  const recipeCategories = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const r of craftingRecipes as any[]) {
      set.add((r.category || r.group || 'general') as string);
    }
    return Array.from(set).sort();
  }, [craftingRecipes]);

  const filteredRecipes = useMemo(() => {
    const search = recipeSearch.trim().toLowerCase();
    return (craftingRecipes as any[]).filter((r: any) => {
      if (categoryFilter !== 'all') {
        if ((r.category || r.group || 'general') !== categoryFilter) return false;
      }
      if (availabilityFilter === 'available' && !recipeIsAvailable(r)) return false;
      if (availabilityFilter === 'locked' && !recipeIsLocked(r)) return false;
      if (availabilityFilter === 'favorites' && !favorites.has(r.id)) return false;
      if (search && !`${r.name || ''} ${r.description || ''}`.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [craftingRecipes, categoryFilter, recipeSearch, availabilityFilter, favorites, recipeIsAvailable, recipeIsLocked]);

  const idleEntities = useMemo(
    () => (entities as any[]).filter((e: any) => e.status === 'idle'),
    [entities],
  );

  const blockedReasons = useMemo<string[]>(() => {
    if (!selectedRecipe) return [];
    const reasons: string[] = [];
    const cost: Array<{ type: string; id: string; amount: number }> = selectedRecipe.cost ?? [];
    const effectiveCost = multicraft && quantity > 1
      ? cost.map((c: any) => ({ ...c, amount: c.amount * quantity }))
      : cost;
    for (const c of effectiveCost) {
      const label = c.id.replace(/^soft_|^mat_/g, '').replace(/_/g, ' ');
      const have = c.type === 'currency'
        ? (currencyBalances[c.id] ?? 0)
        : computeInventoryAmount('ITEM', c.id, syncItemsTable, currencyBalances);
      if (have < c.amount) reasons.push(`Need ${c.amount - have} more ${label}`);
    }
    if (profile && (selectedRecipe.requiredKeeperLevel || 1) > profile.keeperLevel) {
      reasons.push(`Requires Keeper Lvl ${selectedRecipe.requiredKeeperLevel}`);
    }
    const recipeTierNum = Number(selectedRecipe.tier ?? 1);
    if (typeof craftPreview?.recipeTierCap === 'number' && recipeTierNum > craftPreview.recipeTierCap) {
      reasons.push(`Requires Tier ${recipeTierNum} Workshop (this Forge is Tier ${craftPreview.recipeTierCap})`);
    }
    if (slotsOpen <= 0) reasons.push('All crucibles busy — collect a finished craft first');
    if (!selectedEntityId) reasons.push('No Derp selected');
    else if (!selectedEntityObj) reasons.push('Selected Derp is no longer idle');
    return reasons;
  }, [selectedRecipe, quantity, multicraft, currencyBalances, syncItemsTable, profile, craftPreview, slotsOpen, selectedEntityId, selectedEntityObj]);

  const canStart = !!(selectedRecipeId && selectedEntityId && selectedEntityObj && blockedReasons.length === 0 && !busy);

  const handleRecipeSelect = useCallback((r: any) => {
    setSelectedRecipeId(r.id);
    setActivePicker(null);
  }, []);

  const handleEntitySelect = useCallback((entity: any) => {
    setSelectedEntityId(entity.id);
    setActivePicker(null);
  }, []);

  const handleStart = async () => {
    if (!selectedRecipeId || !selectedEntityId) return;
    setBusy(true);
    setCraftError('');
    try {
      await execute('StartCrafting', {
        recipeId: selectedRecipeId,
        entityId: selectedEntityId,
        locationId: outpostId,
        quantity: multicraft ? quantity : 1,
      });
      audioEngine.play('sfx.craft.start');
      setSelectedRecipeId(null);
      setSelectedEntityId(null);
      setActivePicker(null);
    } catch (e: any) {
      audioEngine.play('ui.error');
      setCraftError(e?.message || 'Failed to start crafting');
    } finally {
      setBusy(false);
    }
  };

  const handleCollect = async (jobId: string) => {
    setCraftError('');
    try {
      await execute('CollectCrafting', { jobId });
    } catch (e: any) {
      setCraftError(e?.message || 'Failed to collect');
    }
  };

  const outpostBuildings = useMemo(
    () => (allBuildings as any[]).filter((b) => b.locationId === outpostId),
    [allBuildings, outpostId],
  );
  const hasWorkshopBuilding = outpostBuildings.some(
    (b) => (b.category ?? b.buildingDef?.category) === 'WORKSHOP',
  );
  const navItems = useMemo(() => {
    const items: Array<{ path: string }> = [{ path: `/locations/${outpostId}` }];
    if (hasWorkshopBuilding) items.push({ path: `/locations/${outpostId}/workshop` });
    return items;
  }, [outpostId, hasWorkshopBuilding]);
  const currentNavIdx = Math.max(0, navItems.findIndex((n) => n.path === `/locations/${outpostId}/workshop`));
  const prevPath = navItems[(currentNavIdx - 1 + navItems.length) % navItems.length]?.path ?? `/locations/${outpostId}`;
  const nextPath = navItems[(currentNavIdx + 1) % navItems.length]?.path ?? `/locations/${outpostId}`;

  const passRatePct = craftPreview?.passRate != null ? Math.round(craftPreview.passRate * 100) : null;
  const passRateColor =
    passRatePct == null ? '#94a3b8'
    : passRatePct >= 80 ? '#34d399'
    : passRatePct >= 50 ? '#fbbf24'
    : '#ef4444';

  const footerCost = useMemo<Array<{ type: string; id: string; amount: number }>>(() => {
    const base: Array<{ type: string; id: string; amount: number }> = selectedRecipe?.cost ?? [];
    if (!multicraft || quantity <= 1) return base;
    return base.map((c: any) => ({ ...c, amount: c.amount * quantity }));
  }, [selectedRecipe, multicraft, quantity]);

  const workshopName = workshopInfo?.name || 'The Forge';
  const outpostName = workshopInfo?.locationName || '';

  if (!workshopChecked) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] sticky top-0 z-10">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              onClick={() => navigate(`/locations/${outpostId ?? ''}`)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-text-primary text-xl cursor-pointer transition-colors flex-shrink-0 active:bg-[rgba(139,92,246,0.28)]"
            >
              ←
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-secondary text-[14px]">
          Validating workshop…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Sticky header — matches EntityDetailPage ── */}
      <div className="bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2">

          {/* Back */}
          <button
            onClick={() => navigate(`/locations/${outpostId}`)}
            aria-label="Back to Outpost"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-text-primary text-xl cursor-pointer transition-colors flex-shrink-0 active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
          >
            ←
          </button>

          {/* Title + subtitle */}
          <div className="flex-1 min-w-0">
            {outpostName && (
              <p className="text-[10px] font-extrabold tracking-[0.13em] uppercase text-[#fcd34d] leading-none truncate m-0 mb-0.5">
                {outpostName}
              </p>
            )}
            <h1 className="text-sm font-bold tracking-wide text-text-primary truncate m-0 leading-tight">
              {workshopName.toUpperCase()}
            </h1>
            {/* Status badges in subtitle row */}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.4)] text-[#c4b5fd]">
                T{workshopTier} Workshop
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                slotsOpen > 0
                  ? 'bg-[rgba(16,185,129,0.15)] border-[rgba(16,185,129,0.4)] text-[#6ee7b7]'
                  : 'bg-[rgba(239,68,68,0.15)] border-[rgba(239,68,68,0.4)] text-[#fca5a5]'
              }`}>
                {slotsUsed}/{slotsTotal} Slots
              </span>
            </div>
          </div>

          {/* Carousel arrows */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => navigate(prevPath)}
              aria-label="Previous"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-2xl text-text-primary cursor-pointer transition-colors active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
            >
              ‹
            </button>
            <button
              onClick={() => navigate(nextPath)}
              aria-label="Next"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-2xl text-text-primary cursor-pointer transition-colors active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3 px-3 pt-3 pb-4">

          {/* Active crafting jobs */}
          {activeCraftingJobs.length > 0 && (
            <section>
              <button
                onClick={() => setJobsExpanded((x) => !x)}
                className="w-full flex items-center justify-between gap-2 py-0.5 cursor-pointer"
                aria-expanded={jobsExpanded}
              >
                <SectionHeader
                  title={`Active Crafts (${activeCraftingJobs.length})`}
                  className="pointer-events-none flex-1"
                />
                <span className="text-[11px] text-text-secondary flex-shrink-0">
                  {jobsExpanded ? '▲' : '▼'}
                </span>
              </button>
              {jobsExpanded && (
                <div className="flex flex-col gap-2 mt-2">
                  {activeCraftingJobs.map((job: any) => (
                    <ForgeJobRow
                      key={job.id}
                      job={job}
                      entities={entities as any[]}
                      craftingRecipes={craftingRecipes as any[]}
                      focusedJobId={focusedJobId}
                      focusedJobRef={focusedJobRef}
                      onCollect={handleCollect}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Two-column primary row ── */}
          <div className="grid grid-cols-2 gap-[10px] items-stretch">

            {/* Left: Recipe card */}
            <button
              onClick={() => setActivePicker((p) => p === 'recipe' ? null : 'recipe')}
              aria-label={selectedRecipe ? `Change recipe (${selectedRecipe.name})` : 'Choose recipe'}
              className={`text-left rounded-[14px] border p-3 flex flex-col gap-2 transition-[border-color,filter] cursor-pointer hover:brightness-110 min-h-[148px] ${
                activePicker === 'recipe'
                  ? 'border-[rgba(167,139,250,0.75)] bg-[rgba(139,92,246,0.13)]'
                  : selectedRecipe
                    ? ''
                    : 'border-dashed border-white/20 bg-white/[0.02]'
              }`}
              style={selectedRecipe ? {
                background: selectedRecipe.displayDef?.cardBackground
                  || 'linear-gradient(160deg,rgba(249,115,22,0.12) 0%,rgba(34,24,88,0.85) 100%)',
                borderColor: activePicker === 'recipe'
                  ? 'rgba(167,139,250,0.75)'
                  : (selectedRecipe.displayDef?.borderColor || 'rgba(249,115,22,0.45)'),
              } : undefined}
            >
              {selectedRecipe ? (
                <>
                  <div className="text-[9px] font-extrabold tracking-[0.12em] uppercase text-[#fcd34d]">
                    Recipe
                  </div>
                  <div className="text-[13px] font-cinzel font-extrabold text-white leading-snug line-clamp-2">
                    {selectedRecipe.name}
                  </div>
                  {selectedRecipe.description && (
                    <div className="text-[10px] text-white/55 line-clamp-2 leading-relaxed">
                      {selectedRecipe.description}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-1 flex-wrap">
                    <span className="text-[11px] text-white/70 flex items-center gap-0.5">
                      {(selectedRecipe.cost ?? []).length === 0
                        ? <span className="text-[10px] text-white/50">Free</span>
                        : (selectedRecipe.cost ?? []).map((c: any, i: number) => (
                            <ItemQty key={i} src={c.id} amount={c.amount} size={12} />
                          ))}
                    </span>
                    <span className="text-[10px] text-white/45 tabular-nums">
                      {fmtSeconds(selectedRecipe.timer?.duration ?? 0)}
                    </span>
                  </div>

                  {/* Quantity picker */}
                  {multicraft && (
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[9px] font-bold text-[#c4b5fd] uppercase tracking-wide">Qty</span>
                      {multicraft.mode === 'tiers' && Array.isArray(multicraft.tiers) ? (
                        <div className="flex gap-1">
                          {(multicraft.tiers as number[]).map((qty: number) => (
                            <button
                              key={qty}
                              onClick={(e) => { e.stopPropagation(); setQuantity(qty); }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                quantity === qty
                                  ? 'bg-[rgba(139,92,246,0.35)] border-[rgba(139,92,246,0.8)] text-white'
                                  : 'bg-black/20 border-white/15 text-slate-400'
                              }`}
                            >
                              {qty}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuantity(Math.max(1, quantity - 1)); }}
                            className="w-5 h-5 rounded border border-white/15 bg-black/20 text-slate-300 text-[12px] flex items-center justify-center cursor-pointer"
                          >−</button>
                          <span className="w-5 text-center text-[10px] font-bold text-white tabular-nums">{quantity}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuantity(Math.min(multicraft.max ?? 99, quantity + 1)); }}
                            className="w-5 h-5 rounded border border-white/15 bg-black/20 text-slate-300 text-[12px] flex items-center justify-center cursor-pointer"
                          >+</button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[9px] text-white/35 italic">tap to change</div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-2">
                  <span className="text-[28px]">📜</span>
                  <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wide text-center">
                    Choose Recipe
                  </span>
                </div>
              )}
            </button>

            {/* Right: Outcome card — pure display, no picker */}
            <div
              className="rounded-[14px] border border-[rgba(139,92,246,0.2)] p-3 flex flex-col gap-2 min-h-[148px]"
              style={{ background: 'linear-gradient(160deg,#1a1640 0%,#1e1850 100%)' }}
            >
              <div className="text-[9px] font-extrabold tracking-[0.12em] uppercase text-[#93c5fd]">
                Outcome
              </div>

              {/* Success chance headline */}
              <div className="flex flex-col leading-none">
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-secondary">
                  Success
                </div>
                <div
                  className="text-[32px] font-black tabular-nums leading-none"
                  style={{ color: passRateColor }}
                >
                  {passRatePct != null ? `${passRatePct}%` : '—'}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/10 w-full flex-shrink-0" />

              {/* Bell curve chart */}
              <div className="flex-1 min-h-0 flex flex-col justify-end">
                <RarityCurveChart
                  entityCl={craftPreview?.entityCl ?? undefined}
                  centerOverrides={centerOverrides}
                  className="rounded overflow-hidden"
                />
              </div>
            </div>
          </div>

          {/* ── Entity roster row (below two columns) ── */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-extrabold tracking-[0.12em] uppercase text-text-secondary">
              Crafter
            </div>
            {selectedEntityObj ? (
              <button
                onClick={() => setActivePicker((p) => p === 'entity' ? null : 'entity')}
                aria-label={`Change crafter (${selectedEntityObj.name})`}
                className={`w-full flex items-center gap-3 p-3 rounded-[14px] border text-left cursor-pointer hover:brightness-110 transition-[border-color,filter] ${
                  activePicker === 'entity'
                    ? 'border-[rgba(96,165,250,0.75)] bg-[rgba(59,130,246,0.13)]'
                    : 'border-[rgba(96,165,250,0.35)] bg-gradient-to-br from-[rgba(96,165,250,0.07)] to-[rgba(34,24,88,0.65)]'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[16px] flex-shrink-0">
                  ⚔️
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-extrabold text-white truncate">
                    {selectedEntityObj.name}
                  </div>
                  {craftPreview?.entityCl != null && (
                    <div className="text-[10px] tabular-nums" style={{ color: QUALITY_COLOURS['common'] }}>
                      CL {craftPreview.entityCl.toFixed(0)}
                    </div>
                  )}
                </div>
                <div className="text-[9px] text-white/35 italic flex-shrink-0">tap to change</div>
              </button>
            ) : (
              <button
                onClick={() => setActivePicker((p) => p === 'entity' ? null : 'entity')}
                aria-label="Pick a Derp"
                className={`w-full flex items-center justify-center gap-2 p-3 rounded-[14px] border-2 cursor-pointer hover:brightness-110 transition-[border-color,filter] min-h-[52px] ${
                  activePicker === 'entity'
                    ? 'border-[rgba(96,165,250,0.75)] bg-[rgba(59,130,246,0.10)]'
                    : 'border-dashed border-white/20 bg-white/[0.02]'
                }`}
              >
                <span className="text-[18px]">⚔️</span>
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">
                  Pick a Derp
                </span>
              </button>
            )}
          </div>

          {/* ── Picker area ── */}
          {activePicker === 'recipe' && (
            <ForgeRecipePicker
              recipes={filteredRecipes}
              selectedRecipeId={selectedRecipeId}
              recipeSearch={recipeSearch}
              setRecipeSearch={setRecipeSearch}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              availabilityFilter={availabilityFilter}
              setAvailabilityFilter={setAvailabilityFilter}
              recipeCategories={recipeCategories}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onClose={() => setActivePicker(null)}
              onSelect={handleRecipeSelect}
              recipeIsLocked={recipeIsLocked}
              currencyBalances={currencyBalances}
              syncItemsTable={syncItemsTable}
              profile={profile}
              forecast={null}
            />
          )}

          {activePicker === 'entity' && (
            <div className="rounded-xl border border-[rgba(96,165,250,0.3)] bg-black/30 p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-[13px] font-extrabold tracking-[0.08em] uppercase text-[#93c5fd] font-cinzel">
                  Select a Derp
                </h3>
                <button
                  onClick={() => setActivePicker(null)}
                  aria-label="Close Derp picker"
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
                selectedIds={selectedEntityId ? [selectedEntityId] : []}
                onSelect={handleEntitySelect}
                qualityColors={QUALITY_COLOURS}
                emptyMessage="No idle Derps. Pull one back from a mission."
              />
            </div>
          )}

          {/* Blocked reasons */}
          {selectedRecipeId && blockedReasons.length > 0 && (
            <ul className="list-none m-0 p-0 flex flex-col gap-1" role="alert">
              {blockedReasons.map((r, i) => (
                <li key={i} className="text-[11px] text-[#fbbf24]">⚠ {r}</li>
              ))}
            </ul>
          )}

          {craftError && (
            <div className="px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-[12px]">
              {craftError}
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <footer className="flex-shrink-0 z-20 flex items-center gap-3 px-3 py-2.5 bg-[rgba(26,22,64,0.97)] backdrop-blur-md border-t border-[rgba(139,92,246,0.12)]">
        <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
          {footerCost.length > 0
            ? footerCost.map((c: any, i: number) => (
                <ItemQty key={i} src={c.id} amount={c.amount} size={14} />
              ))
            : selectedRecipe
              ? <span className="text-[11px] text-text-secondary">Free</span>
              : <span className="text-[11px] text-text-secondary italic">Select a recipe</span>}
        </div>
        <button
          onClick={handleStart}
          disabled={!canStart}
          data-sfx="ui.button_primary"
          className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-white text-[13px] font-extrabold uppercase tracking-[0.07em] transition-[opacity,filter] ${
            canStart ? 'opacity-100 hover:brightness-110 cursor-pointer' : 'opacity-40 cursor-not-allowed'
          }`}
          style={{ background: canStart ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(80,80,100,0.6)' }}
        >
          {busy ? 'Starting…' : 'Begin Crafting'}
        </button>
      </footer>
    </div>
  );
}
