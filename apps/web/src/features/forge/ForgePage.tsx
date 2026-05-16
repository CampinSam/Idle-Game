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
import { useCurrentTick } from '../../tick';
import { workshopParallelSlots } from '@derp/math';
import { ForgeHero } from './components/ForgeHero';
import { ForgeJobRow } from './components/ForgeJobRow';
import { ForgeTrack } from './components/ForgeTrack';
import { SectionHeader } from '../../components/ui';
import type { ForecastResponse } from './components/forgeUtils';

export default function ForgePage() {
  const { id: outpostId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get('craftJob') || '';
  const focusedJobRef = useRef<HTMLDivElement | null>(null);
  const dispatch = useAppDispatch();
  const { execute } = useCommand();
  const tick = useCurrentTick();

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

  const handleCollect = async (jobId: string) => {
    setError('');
    try {
      await execute('CollectCrafting', { jobId });
    } catch (e: any) {
      setError(e?.message || 'Failed to collect');
    }
  };

  const backDest = outpostId ? `/locations/${outpostId}` : '/locations';

  const backButton = (
    <div className="sticky top-0 z-30 px-3 py-2 bg-bg-secondary/80 backdrop-blur-sm border-b border-border">
      <button
        onClick={() => navigate(backDest)}
        aria-label="Back to Outpost"
        className="px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-white text-[12px] font-bold hover:bg-white/10 cursor-pointer"
      >
        ← Back to Outpost
      </button>
    </div>
  );

  if (!workshopChecked) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-y-auto overscroll-contain pb-6">
        {backButton}
        <div className="text-center text-text-secondary text-[14px] py-12">Validating workshop…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-y-auto overscroll-contain pb-6">
      {backButton}

      <div className="px-3">
        <ForgeHero
          workshopInfo={workshopInfo}
          workshopLevel={workshopLevel}
          forecast={forecast}
          activeJobsCount={activeCraftingJobs.length}
        />
      </div>

      {error && (
        <div className="mx-3 px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-xs">
          {error}
        </div>
      )}

      {maxSlots > 0 && (
        <section className="px-3 flex flex-col gap-2">
          <SectionHeader
            title="Crucibles"
            right={<span className="text-[11px] font-semibold text-text-secondary">{usedSlots} / {maxSlots} active</span>}
          />
          <div className="flex flex-col gap-2.5">
            {activeCraftingJobs.map((job: any) => (
              <ForgeJobRow
                key={job.id}
                job={job}
                entities={entities}
                craftingRecipes={craftingRecipes as any[]}
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
