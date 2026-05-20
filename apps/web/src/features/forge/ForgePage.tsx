import {
  useCallback, useEffect, useLayoutEffect, useMemo,
  useRef, useState, useSyncExternalStore,
} from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
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
import type { EntityFilter, EntitySortBy } from '../entities/types';
import type { RecipeSort } from './components/ForgePickerArea';
import ItemQty from '../../components/ItemQty';
import { SectionHeader, Card } from '../../components/ui';
import { RosterCard } from '../entities/components';
import { ForgeJobRow } from './components/ForgeJobRow';
import { BuildingDetailHeader } from './components/BuildingDetailHeader';
import { ForgeRecipeCard } from './components/ForgeRecipeCard';
import { ForgeOutcomeCard } from './components/ForgeOutcomeCard';
import { ForgePickerArea } from './components/ForgePickerArea';
import { QUALITY_COLOURS } from './components/forgeUtils';

type SlideDir = 'left' | 'right';
type LocationState = { slideDir?: SlideDir };

export default function ForgePage() {
  const { id: outpostId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get('craftJob') || '';
  const focusedJobRef = useRef<HTMLDivElement | null>(null);
  const dispatch = useAppDispatch();
  const { execute } = useCommand();

  // ── Swipe gesture refs ──────────────────────────────────────────────────
  const cardRef = useRef<HTMLDivElement | null>(null);
  const navigatingRef = useRef(false);
  const mountedRef = useRef(false);
  const pointerRef = useRef<{
    startX: number;
    startY: number;
    axisLocked: boolean;
    pointerId: number;
    cardEl: HTMLDivElement;
  } | null>(null);

  const prefersReducedMotion = useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => {};
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );

  // ── Data hooks ──────────────────────────────────────────────────────────
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

  // ── Workshop validation ─────────────────────────────────────────────────
  const [workshopInfo, setWorkshopInfo] = useState<any>(null);
  const [workshopChecked, setWorkshopChecked] = useState(false);
  const [workshopLevel, setWorkshopLevel] = useState(1);

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

  // ── Selection state ─────────────────────────────────────────────────────
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<'recipe' | 'entity' | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [craftError, setCraftError] = useState('');
  const [jobsExpanded, setJobsExpanded] = useState(false);

  // ── Filter state ────────────────────────────────────────────────────────
  const [recipeSearch, setRecipeSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'available' | 'locked' | 'favorites' | 'all'>('available');
  const [recipeSort, setRecipeSort] = useState<RecipeSort>('name-asc');
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

  // ── Derived recipe / entity ─────────────────────────────────────────────
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

  useEffect(() => {
    if (selectedEntityId && !selectedEntityObj) {
      setSelectedEntityId(null);
    }
  }, [selectedEntityId, selectedEntityObj]);

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

  // ── Job preview (live outcome) ──────────────────────────────────────────
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

  // ── Recipe predicates ───────────────────────────────────────────────────
  const recipeIsLocked = useCallback((r: any): boolean => {
    const recipeTierNum = Number(r.tier ?? 1);
    const tierCap = craftPreview?.recipeTierCap ?? workshopLevel;
    if (typeof tierCap === 'number' && recipeTierNum > tierCap) return true;
    return false;
  }, [craftPreview?.recipeTierCap, workshopLevel]);

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
    const filtered = (craftingRecipes as any[]).filter((r: any) => {
      if (categoryFilter !== 'all') {
        if ((r.category || r.group || 'general') !== categoryFilter) return false;
      }
      if (availabilityFilter === 'available' && !recipeIsAvailable(r)) return false;
      if (availabilityFilter === 'locked' && !recipeIsLocked(r)) return false;
      if (availabilityFilter === 'favorites' && !favorites.has(r.id)) return false;
      if (search && !`${r.name || ''} ${r.description || ''}`.toLowerCase().includes(search)) return false;
      return true;
    });
    return filtered.slice().sort((a, b) => {
      switch (recipeSort) {
        case 'name-desc': return (b.name || '').localeCompare(a.name || '');
        case 'tier-asc':  return Number(a.tier ?? 1) - Number(b.tier ?? 1);
        case 'tier-desc': return Number(b.tier ?? 1) - Number(a.tier ?? 1);
        default:          return (a.name || '').localeCompare(b.name || '');
      }
    });
  }, [craftingRecipes, categoryFilter, recipeSearch, availabilityFilter, favorites, recipeIsAvailable, recipeIsLocked, recipeSort]);

  const idleEntities = useMemo(
    () => (entities as any[]).filter((e: any) => e.status === 'idle'),
    [entities],
  );

  // ── Blocked reasons ─────────────────────────────────────────────────────
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

  // ── Handlers ────────────────────────────────────────────────────────────
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

  // ── Navigation items — outpost overview + each building (in order) ───────
  // Add a slug here when a new building detail page is implemented.
  const BUILDING_ROUTE_SLUGS: Record<string, string> = { WORKSHOP: 'workshop' };

  const outpostBuildings = useMemo(
    () => (allBuildings as any[]).filter((b) => b.locationId === outpostId),
    [allBuildings, outpostId],
  );
  const navItems = useMemo(() => {
    const items: Array<{ path: string }> = [{ path: `/locations/${outpostId}` }];
    for (const b of outpostBuildings) {
      const cat = (b.category ?? b.buildingDef?.category ?? '') as string;
      const slug = BUILDING_ROUTE_SLUGS[cat];
      if (slug) {
        const p = `/locations/${outpostId}/${slug}`;
        if (!items.some((n) => n.path === p)) items.push({ path: p });
      }
    }
    return items;
  // BUILDING_ROUTE_SLUGS is a constant defined in render; stable reference not needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outpostId, outpostBuildings]);
  const workshopPath = `/locations/${outpostId}/workshop`;
  const currentNavIdx = Math.max(0, navItems.findIndex((n) => n.path === workshopPath));
  const prevPath = navItems[(currentNavIdx - 1 + navItems.length) % navItems.length]?.path ?? `/locations/${outpostId}`;
  const nextPath = navItems[(currentNavIdx + 1) % navItems.length]?.path ?? `/locations/${outpostId}`;
  const hasNav = navItems.length > 1;

  // ── Outcome display ─────────────────────────────────────────────────────
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

  // ── Preview requirements from live data ─────────────────────────────────
  const previewRequirements: Array<{ label: string; met: boolean }> =
    (preview?.requirements ?? []) as Array<{ label: string; met: boolean }>;

  // ── Swipe gesture ───────────────────────────────────────────────────────
  function springBack(card: HTMLDivElement) {
    card.style.transition = 'transform 0.2s ease-out';
    card.style.transform = 'translateX(0)';
    card.addEventListener('transitionend', function onEnd() {
      card.style.transition = '';
      card.style.transform = '';
      card.removeEventListener('transitionend', onEnd);
    }, { once: true });
  }

  function doNavigate(targetPath: string, dir: SlideDir) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    if (prefersReducedMotion) {
      navigate(targetPath, { state: { slideDir: dir } satisfies LocationState });
      return;
    }
    const card = cardRef.current;
    if (!card) {
      navigate(targetPath, { state: { slideDir: dir } satisfies LocationState });
      return;
    }
    const toX = dir === 'left' ? '-110%' : '110%';
    card.style.transition = 'transform 0.18s ease-out';
    card.style.transform = `translateX(${toX})`;
    setTimeout(() => {
      navigate(targetPath, { state: { slideDir: dir } satisfies LocationState });
    }, 170);
  }

  // Slide-in animation on mount when arriving from an adjacent page
  useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const state = location.state as LocationState | null;
    const dir = state?.slideDir;
    if (!dir || prefersReducedMotion) {
      navigatingRef.current = false;
      return;
    }
    const card = cardRef.current;
    if (!card) { navigatingRef.current = false; return; }
    const fromX = dir === 'left' ? '100%' : '-100%';
    card.style.transition = 'none';
    card.style.transform = `translateX(${fromX})`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.transition = 'transform 0.22s ease-out';
        card.style.transform = 'translateX(0)';
        card.addEventListener('transitionend', function onEnd() {
          card.style.transition = '';
          card.style.transform = '';
          navigatingRef.current = false;
          card.removeEventListener('transitionend', onEnd);
        }, { once: true });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopPath]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current) return;
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    if (!hasNav || prefersReducedMotion) return;
    pointerRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      axisLocked: false,
      pointerId: e.pointerId,
      cardEl: e.currentTarget,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.axisLocked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        pointerRef.current = null;
        return;
      }
      p.axisLocked = true;
      p.cardEl.setPointerCapture(p.pointerId);
    }
    const card = cardRef.current;
    if (!card) return;
    const clamped = Math.max(-90, Math.min(90, dx));
    card.style.transition = 'none';
    card.style.transform = `translateX(${clamped}px)`;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    pointerRef.current = null;
    if (!p?.axisLocked) return;
    const dx = e.clientX - p.startX;
    const card = cardRef.current;
    if (!card) return;
    if (Math.abs(dx) >= 50) {
      const dir: SlideDir = dx < 0 ? 'left' : 'right';
      const targetPath = dir === 'left' ? nextPath : prevPath;
      doNavigate(targetPath, dir);
    } else {
      springBack(card);
    }
  }

  function handlePointerCancel() {
    const p = pointerRef.current;
    pointerRef.current = null;
    if (!p?.axisLocked) return;
    const card = cardRef.current;
    if (card) springBack(card);
  }

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (!workshopChecked) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] sticky top-0 z-10">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              onClick={() => navigate(`/locations/${outpostId ?? ''}`)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-text-primary text-xl cursor-pointer transition-colors flex-shrink-0"
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

  // ── Page ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden motion-safe:animate-[detail-enter_0.28s_ease-out_both]"
      ref={cardRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* ── Sticky header ── */}
      <BuildingDetailHeader
        outpostName={outpostName}
        buildingName={workshopName}
        onBack={() => navigate(`/locations/${outpostId}`)}
        onPrev={() => doNavigate(prevPath, 'right')}
        onNext={() => doNavigate(nextPath, 'left')}
        hasNav={hasNav}
        badges={
          <>
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
          </>
        }
      />

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3 px-3 pt-3 pb-4">

          {/* ── Active crafting jobs — collapsible strip in Card ── */}
          {activeCraftingJobs.length > 0 && (
            <Card className="overflow-visible">
              <div className="p-3">
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
              </div>
            </Card>
          )}

          {/* ── Two-column row — always visible ── */}
          <div className="grid grid-cols-2 gap-[10px] items-stretch">

            {/* Left column: dashed-border empty slot or selected recipe card */}
            {!selectedRecipe ? (
              <button
                onClick={() => setActivePicker((p) => p === 'recipe' ? null : 'recipe')}
                aria-label="Select a recipe"
                className={`w-full flex flex-col items-center justify-center gap-2 p-4 rounded-[14px] border-2 cursor-pointer hover:brightness-110 transition-[border-color,filter] min-h-[120px] text-left ${
                  activePicker === 'recipe'
                    ? 'border-[rgba(139,92,246,0.75)] bg-[rgba(139,92,246,0.10)]'
                    : 'border-dashed border-[rgba(139,92,246,0.35)] bg-white/[0.02]'
                }`}
              >
                <span className="text-[22px]">⚗️</span>
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wide text-center">
                  Select Recipe
                </span>
              </button>
            ) : (
              <ForgeRecipeCard
                recipe={selectedRecipe}
                isActive={activePicker === 'recipe'}
                multicraft={multicraft}
                quantity={quantity}
                onQuantityChange={setQuantity}
                onClick={() => setActivePicker((p) => p === 'recipe' ? null : 'recipe')}
                requirements={previewRequirements}
              />
            )}

            {/* Right column: outcome card — always visible */}
            <ForgeOutcomeCard
              passRatePct={passRatePct}
              passRateColor={passRateColor}
              entityCl={craftPreview?.entityCl ?? undefined}
              recipeTiers={selectedRecipe?.tiers ?? null}
              centerOverrides={centerOverrides}
            />
          </div>

          {/* ── Picker row — sits above crafter row, collapses when null ── */}
          <ForgePickerArea
            activePicker={activePicker === 'recipe' || activePicker === 'entity' ? activePicker : null}
            onClose={() => setActivePicker(null)}
            recipes={filteredRecipes}
            selectedRecipeId={selectedRecipeId}
            recipeSearch={recipeSearch}
            setRecipeSearch={setRecipeSearch}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            availabilityFilter={availabilityFilter}
            setAvailabilityFilter={setAvailabilityFilter}
            recipeSort={recipeSort}
            setRecipeSort={setRecipeSort}
            recipeCategories={recipeCategories}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onRecipeSelect={handleRecipeSelect}
            recipeIsLocked={recipeIsLocked}
            currencyBalances={currencyBalances}
            syncItemsTable={syncItemsTable}
            profile={profile}
            idleEntities={idleEntities}
            selectedEntityId={selectedEntityId}
            entitySearch={entitySearch}
            setEntitySearch={setEntitySearch}
            entityFilter={entityFilter}
            setEntityFilter={setEntityFilter}
            entitySort={entitySort}
            setEntitySort={setEntitySort}
            onEntitySelect={handleEntitySelect}
          />

          {/* ── Crafter row ── */}
          <RosterCard
            title="Crafter"
            entities={idleEntities}
            selectedIds={selectedEntityObj ? [selectedEntityObj.id] : []}
            maxSlots={1}
            useCase="forge"
            onRemove={() => setSelectedEntityId(null)}
            isPickerOpen={activePicker === 'entity'}
            onPickerOpenChange={(open) => setActivePicker(open ? 'entity' : null)}
            inlinePicker={false}
          />

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
          {busy
            ? 'Starting…'
            : !canStart && selectedRecipeId && blockedReasons.length > 0
              ? blockedReasons[0]
              : 'Begin Crafting'}
        </button>
      </footer>
    </div>
  );
}
