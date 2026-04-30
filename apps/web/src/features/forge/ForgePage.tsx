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

export default function ForgePage() {
  const { id: outpostId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const materialFilter = searchParams.get('material') || '';
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

  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [workshopChecked, setWorkshopChecked] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'available' | 'locked' | 'favorites' | 'all'>('all');
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

  // Server-enforced "crafting is a place": validate that this outpost actually
  // hosts an enabled workshop owned by the player. If not, redirect away so
  // route fiddling can't bypass the requirement.
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
  useEffect(() => {
    let cancelled = false;
    setForecastLoading(true);
    api.getCraftingForecast(true, outpostId)
      .then((data) => { if (!cancelled) setForecast(data); })
      .catch(() => { if (!cancelled) setForecast(null); })
      .finally(() => { if (!cancelled) setForecastLoading(false); });
    return () => { cancelled = true; };
  }, [forecastBucket, outpostId]);

  const idleEntities = useMemo(() => {
    const list = entities.filter((e: any) => e.status === 'idle');
    if (!forecast) return list;
    const luck = new Map<string, number>(forecast.entities.map((f) => [f.entityId, f.craftingLuck]));
    return [...list].sort((a: any, b: any) => (luck.get(b.id) ?? -1) - (luck.get(a.id) ?? -1));
  }, [entities, forecast]);
  const recipe = craftingRecipes.find((r: any) => r.id === selectedRecipe);

  const recipeCategories = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const r of craftingRecipes as any[]) {
      const cat = (r.category || r.group || 'general') as string;
      set.add(cat);
    }
    return Array.from(set).sort();
  }, [craftingRecipes]);

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
      if (materialFilter) {
        const cost: Array<{ type: string; id: string }> = r.cost ?? [];
        if (!cost.some((c) => c.id === materialFilter || c.id === `mat_${materialFilter}`)) return false;
      }
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
  }, [craftingRecipes, materialFilter, categoryFilter, recipeSearch, availabilityFilter, favorites, recipeIsAvailable, recipeIsLocked]);

  const matName = useMemo(() => {
    if (!materialFilter) return '';
    return materialFilter.replace(/^mat_/, '').replace(/_/g, ' ');
  }, [materialFilter]);

  const clearMaterialFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('material');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Compute per-recipe blocked reasons (for slide-up sheet).
  // Mirrors the server's startCrafting checks so the UI surfaces every
  // shortfall up-front (currency + items + keeper level + idle Derp +
  // workshop tier cap + open crucible slots) instead of failing on submit.
  const recipeBlockedReasons = useMemo<string[]>(() => {
    if (!recipe) return [];
    const reasons: string[] = [];
    const cost: Array<{ type: string; id: string; amount: number }> = recipe.cost ?? [];
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
    if (profile && (recipe.requiredKeeperLevel || 1) > profile.keeperLevel) {
      reasons.push(`Requires Keeper Lvl ${recipe.requiredKeeperLevel}`);
    }
    const recipeTier = Number(recipe.tier ?? 1);
    const tierCap = forecast?.recipeTierCap;
    if (typeof tierCap === 'number' && recipeTier > tierCap) {
      reasons.push(`Requires Tier ${recipeTier} Workshop (this Forge is Tier ${tierCap})`);
    }
    const slotsOpen = forecast?.slotsOpen;
    if (typeof slotsOpen === 'number' && slotsOpen <= 0) {
      reasons.push('All crucibles are busy — collect a finished craft first');
    }
    if (idleEntities.length === 0) {
      reasons.push('No idle Derps available');
    }
    return reasons;
  }, [recipe, currencyBalances, syncItemsTable, profile, idleEntities.length, forecast?.recipeTierCap, forecast?.slotsOpen]);

  const recipeStyle: DisplayStyle = useMemo(
    () => mergeDisplayStyles(undefined, recipe?.displayDef?.style),
    [recipe],
  );
  const recipeOverlay = overlayToCss(recipeStyle.overlay);
  const recipeTitleStyle = textStyleToCss(recipeStyle.title);
  const recipeBodyStyle = textStyleToCss(recipeStyle.body);

  const heroStyle: DisplayStyle = useMemo(
    () => mergeDisplayStyles(undefined, workshopInfo?.displayDef?.style),
    [workshopInfo],
  );
  const heroOverlay = overlayToCss(heroStyle.overlay);
  const heroBgImage = workshopInfo?.displayDef?.backgroundImage || FORGE_FALLBACK.backgroundImage;
  const heroBorderColor = workshopInfo?.displayDef?.borderColor || FORGE_FALLBACK.borderColor;
  const heroTitleStyle = textStyleToCss(heroStyle.title);
  const heroBodyStyle = textStyleToCss(heroStyle.body);

  const selectedForecast = useMemo(
    () => (selectedEntity && forecast ? forecast.entities.find((e) => e.entityId === selectedEntity) : null),
    [selectedEntity, forecast],
  );

  const handleStart = async () => {
    if (!selectedRecipe || !selectedEntity) return;
    setError('');
    setBusy(true);
    try {
      audioEngine.play('ui.button_click');
      await execute('StartCrafting', { recipeId: selectedRecipe, entityId: selectedEntity, locationId: outpostId });
      audioEngine.play('sfx.craft.start');
      setSelectedRecipe(null);
      setSelectedEntity(null);
    } catch (e: any) {
      audioEngine.play('ui.error');
      setError(e?.message || 'Failed to start crafting');
    } finally {
      setBusy(false);
    }
  };

  const handleCollect = async (jobId: string) => {
    setError('');
    try {
      await execute('CollectCrafting', { jobId });
    } catch (e: any) {
      setError(e?.message || 'Failed to collect');
    }
  };

  if (!workshopChecked) {
    return (
      <div className="forge-scene">
        <div className="forge-loading">Validating workshop…</div>
      </div>
    );
  }

  return (
    <div className="forge-scene">
      <div
        className="forge-hero"
        style={{
          backgroundImage: bgImageCss(heroBgImage),
          borderColor: heroBorderColor,
        }}
      >
        <div className="forge-hero-overlay" style={{ background: heroOverlay || 'rgba(12,10,26,0.55)' }} />
        <button className="forge-back-pill" onClick={() => navigate(`/locations/${outpostId}`)}>
          ← Back to Outpost
        </button>
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
            // Tier-driven badges: surface the perks each workshop level grants
            // (parallel slots + timer speed-up). Forecast is authoritative; we
            // fall back to local workshopLevel while the request is in flight.
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

      {(() => {
        // Prefer server-authoritative slot counts from forecast. Fall back to
        // the shared workshopParallelSlots() helper while forecast is loading.
        const maxSlots = forecast?.slotsTotal ?? workshopParallelSlots(workshopLevel);
        const usedSlots = forecast?.slotsUsed ?? activeCraftingJobs.length;
        const emptySlots = Math.max(0, maxSlots - usedSlots);
        return (
          <section className="forge-section forge-jobs-section">
            <div className="forge-section-head">
              <h2>In the Crucible</h2>
              <span className="forge-section-sub">{usedSlots} / {maxSlots} crucibles</span>
            </div>
            <div className="forge-jobs">
              {activeCraftingJobs.map((job: any) => {
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
                    key={job.id}
                    ref={isFocused ? focusedJobRef : null}
                    className={`forge-job-card ${tierClass} ${isReady ? 'ready' : ''} ${isFocused ? 'is-focused' : ''}`}
                  >
                    <div className="forge-job-portrait">
                      {entity?.imageUrl ? (
                        <img src={entity.imageUrl} alt={entityName} />
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
                      <div className="forge-job-name">{recipeDef?.name || job.recipeId}</div>
                      <div className="forge-job-entity">{entityName}</div>
                    </div>
                    {isReady ? (
                      <button className="forge-collect-btn" onClick={() => handleCollect(job.id)}>
                        Collect
                      </button>
                    ) : (
                      <span className="forge-job-time">{fmtSeconds(remMs / 1000)} left</span>
                    )}
                  </div>
                );
              })}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <button
                  key={`empty-slot-${i}`}
                  className="forge-job-card forge-job-card-empty"
                  onClick={() => {
                    const el = document.querySelector('.forge-codex-section');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  aria-label="Empty crucible — pick a recipe"
                >
                  <div className="forge-job-empty-icon">＋</div>
                  <div className="forge-job-empty-label">Empty Crucible</div>
                </button>
              ))}
            </div>
          </section>
        );
      })()}

      <section className="forge-section forge-codex-section">
        <div className="forge-section-head">
          <h2>Recipe Codex</h2>
          <span className="forge-section-sub">
            {filteredRecipes.length === craftingRecipes.length
              ? `${craftingRecipes.length} known`
              : `${filteredRecipes.length} of ${craftingRecipes.length}`}
          </span>
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

        {materialFilter && (
          <div className="forge-filter-chip-row">
            <span className="forge-filter-chip">
              Filtered by <strong>{matName}</strong>
              <button onClick={clearMaterialFilter} aria-label="Clear filter">×</button>
            </span>
          </div>
        )}
        {filteredRecipes.length === 0 && materialFilter && (
          <div className="forge-empty">No recipes use <strong>{matName}</strong>. <button className="forge-link-btn" onClick={clearMaterialFilter}>Show all recipes</button></div>
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
            const recipeTier = Number(r.tier ?? 1);
            const tierCap = forecast?.recipeTierCap;
            const tierLocked = typeof tierCap === 'number' && recipeTier > tierCap;
            const dd = r.displayDef;
            const cardStyle: DisplayStyle = mergeDisplayStyles(undefined, dd?.style);
            const isFav = favorites.has(r.id);
            return (
              <div key={r.id} className="forge-recipe-card-wrap">
                <button
                  className={`forge-recipe-card ${selectedRecipe === r.id ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''}`}
                  style={{
                    background: dd?.cardBackground || 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(34,24,88,0.6))',
                    borderColor: dd?.borderColor || 'rgba(139,92,246,0.45)',
                  }}
                  onClick={() => setSelectedRecipe(r.id)}
                  title={
                    !meetsLevel
                      ? `Requires Keeper Lvl ${r.requiredKeeperLevel}`
                      : tierLocked
                        ? `Requires Tier ${recipeTier} Workshop`
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
                    {tierLocked && <span className="is-locked-tag is-tier-lock">Needs T{recipeTier} Workshop</span>}
                  </div>
                </button>
                <button
                  className={`forge-recipe-fav ${isFav ? 'is-fav' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(r.id); }}
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
      </section>

      {recipe && (
        <>
          <div className="forge-sheet-backdrop" onClick={() => setSelectedRecipe(null)} aria-hidden />
        <section
          className="forge-section forge-assign forge-sheet"
          role="dialog"
          aria-label={`Recipe details for ${recipe.name}`}
          style={{
            background: recipe.displayDef?.cardBackground || undefined,
            borderColor: recipe.displayDef?.borderColor || undefined,
          }}
        >
          {recipeOverlay && (
            <div className="forge-assign-overlay" style={{ background: recipeOverlay }} aria-hidden />
          )}
          <div className="forge-assign-inner">
            <button
              className="forge-sheet-close"
              onClick={() => { setSelectedRecipe(null); setSelectedEntity(null); }}
              aria-label="Close recipe sheet"
            >
              ×
            </button>
            <div className="forge-assign-head">
              <h2 style={recipeTitleStyle as React.CSSProperties}>Assign a Derp to "{recipe.name}"</h2>
              <p style={recipeBodyStyle as React.CSSProperties}>
                Crafting Luck = FOC×0.5 + LCK×0.3 (+bonuses). Higher CL pushes the result toward better quality tiers.
              </p>
              {recipeBlockedReasons.length > 0 && (
                <ul className="forge-blocked-reasons" role="alert">
                  {recipeBlockedReasons.map((r, i) => (
                    <li key={i}>⚠️ {r}</li>
                  ))}
                </ul>
              )}
            </div>

            {(() => {
              const forecasts: Record<string, EntityForecast> = {};
              forecast?.entities.forEach((f) => { forecasts[f.entityId] = f as EntityForecast; });
              return (
                <EntityList
                  entities={idleEntities}
                  mode="picker"
                  useCase="crafting"
                  selectedIds={selectedEntity ? [selectedEntity] : []}
                  onSelect={(entity) => setSelectedEntity(entity.id)}
                  forecasts={forecasts}
                  qualityColors={QUALITY_COLOURS}
                  emptyMessage="No idle Derps. Pull one back from a mission."
                />
              );
            })()}

            {forecast && (
              <div className="forge-forecast-box">
                <div className="forge-forecast-head">
                  <span>Quality Forecast</span>
                  {selectedForecast && (
                    <span style={{ color: QUALITY_COLOURS[selectedForecast.expectedQuality] || '#94a3b8' }}>
                      {selectedForecast.name} → expected {selectedForecast.expectedQualityLabel}
                    </span>
                  )}
                </div>
                <ForecastBar
                  cap={forecast.cap}
                  tiers={forecast.tiers}
                  marker={selectedForecast?.craftingLuck ?? null}
                  qualityKey={selectedForecast?.expectedQuality ?? null}
                />
                {selectedForecast && (
                  <div className="forge-forecast-probs">
                    {selectedForecast.probabilities.map((p) => (
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
                    {forecast.luckFloor > 0 && selectedForecast.rawCraftingLuck < forecast.luckFloor && (
                      <div className="forge-forecast-floor-note">
                        ⚒️ Workshop Tier {forecast.workshopTier} sets a luck floor of {forecast.luckFloor} (raw CL {selectedForecast.rawCraftingLuck.toFixed(0)}).
                      </div>
                    )}
                  </div>
                )}
                {!selectedEntity && !forecastLoading && (
                  <div className="forge-forecast-hint">
                    Select a Derp to see the full quality probability distribution.
                  </div>
                )}
              </div>
            )}

            <button
              className="forge-start-btn"
              disabled={!selectedEntity || busy || recipeBlockedReasons.length > 0}
              onClick={handleStart}
              title={recipeBlockedReasons[0]}
            >
              {busy
                ? 'Igniting…'
                : recipeBlockedReasons.length > 0
                  ? recipeBlockedReasons[0]
                  : `Begin Forging (${(recipe.cost ?? []).map((c: any) => `${c.amount} ${c.id.replace('soft_', '').replace('mat_', '')}`).join(' · ') || 'Free'})`}
            </button>
          </div>
        </section>
        </>
      )}
    </div>
  );
}
