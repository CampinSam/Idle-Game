import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeGeneratorProduction, computeConsumptionFromBuildings, aggregateByResource, computeInventoryAmount } from '../../utils/locationProduction';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncLocations,
  useAllActiveJobs,
  useSyncCurrencyBalances,
} from '../../hooks/useSyncSelectors';
import { useAppSelector, useAppDispatch } from '../../store';
import { fetchCraftingRecipes } from '../../store/gameSlice';
import { useModal } from '../../context/ModalContext';
import { useCollectJob } from '../../hooks/useCollectJob';
import { api } from '../../services/api';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../tick';
import { GameImage } from '../../components/GameImage';
import ItemQty from '../../components/ItemQty';
import { HomePageSkeleton } from '../../components/Skeleton';
import {
  Card,
  SectionHeader,
  Divider,
  EmptyState,
  StatPill,
  IconLabel,
  KeyValue,
  Chip,
} from '../../components/ui';
import { workshopParallelSlots, workshopTimerMultiplier } from '@derp/math';
import { BannerCarousel } from './BannerCarousel';
import { MissionReadyRow, MissionInProgressRow } from './MissionRow';

function formatTime(ms: number) {
  if (ms <= 0) return null;
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s left`;
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { pushModal } = useModal();
  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const locations = useSyncLocations();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const allActiveJobs = useAllActiveJobs();
  const { collectJob } = useCollectJob();
  const dispatch = useAppDispatch();
  const currencyBalances = useSyncCurrencyBalances();
  const syncItemsTable = useAppSelector((s) => s.sync.items);
  const craftingRecipes = useAppSelector((s) => s.game.craftingRecipes);
  const [claimError, setClaimError] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [workshops, setWorkshops] = useState<Array<{
    buildingId: string;
    locationId: string;
    name: string;
    level: number;
    enabled: boolean;
    displayDef?: {
      borderColor?: string | null;
      backgroundImage?: string | null;
      cardBackground?: string | null;
    } | null;
  }>>([]);

  useEffect(() => {
    let cancelled = false;
    api.getCraftingWorkshops()
      .then((list) => { if (!cancelled) setWorkshops(list); })
      .catch(() => { if (!cancelled) setWorkshops([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!craftingRecipes || craftingRecipes.length === 0) {
      dispatch(fetchCraftingRecipes());
    }
  }, [dispatch, craftingRecipes]);

  const primaryWorkshop = workshops.find((w) => w.enabled) ?? workshops[0] ?? null;
  const goToForge = useCallback((locationId?: string, craftJobId?: string) => {
    const target = locationId || primaryWorkshop?.locationId;
    if (target) {
      const suffix = craftJobId ? `?craftJob=${encodeURIComponent(craftJobId)}` : '';
      navigate(`/locations/${target}/workshop${suffix}`);
    } else {
      navigate('/locations');
    }
  }, [navigate, primaryWorkshop]);

  const openModalSpec = useCallback(async (params: { jobId?: string; giftId?: string }) => {
    try {
      const spec = await api.getModalSpec(params);
      if (spec?.version === 1) {
        pushModal(spec);
      }
    } catch (err) {
      console.error('[HomePage] Failed to fetch modal spec:', err);
    }
  }, [pushModal]);

  const getJobRemaining = useCallback((j: any): number => {
    if (j.startTick == null || j.durationTicks == null) return Infinity;
    const timer = createCountdownTimer({ startTick: j.startTick, durationTicks: j.durationTicks });
    return timer.getRemainingMs(currentTick, tickRate);
  }, [currentTick, tickRate]);

  const { completedJobs, inProgressJobs } = useMemo(() => ({
    completedJobs: allActiveJobs.filter((j: any) => getJobRemaining(j) <= 0),
    inProgressJobs: allActiveJobs.filter((j: any) => getJobRemaining(j) > 0),
  }), [allActiveJobs, getJobRemaining]);

  if (!profile) return <HomePageSkeleton />;

  const totalProductionByResource = (locations as any[]).reduce<Record<string, number>>((acc, loc) => {
    const generators = computeGeneratorProduction(loc);
    const consumptionRates = computeConsumptionFromBuildings(loc);
    const resTypes: Record<string, string> = (loc as any).storage?.resourceTypes || {};
    const summaries = aggregateByResource(loc, generators, consumptionRates, resTypes);
    for (const summary of summaries) {
      acc[summary.outputRefId] = (acc[summary.outputRefId] ?? 0) + summary.netRatePerHour;
    }
    return acc;
  }, {});
  const arcaniumRate = totalProductionByResource['soft_arcanium'] ?? 0;
  const otherRate = Object.entries(totalProductionByResource)
    .filter(([id]) => id !== 'soft_arcanium')
    .reduce((sum, [, rate]) => sum + rate, 0);

  const idleEntities = entities.filter((b: any) => b.status === 'idle').length;
  const busyEntities = entities.length - idleEntities;

  const getJobIcon = (type: string) => {
    if (type === 'MissionJob') return '🗺️';
    if (type === 'CraftingJob') return '⚒️';
    if (type === 'BuildingJob') return '🏗️';
    return '⏱️';
  };

  const handleClaim = async (missionId: string) => {
    setClaimError('');
    setClaimingId(missionId);
    try {
      await collectJob(missionId);
    } catch (err: any) {
      console.error('[HomePage] Mission claim failed:', err);
      setClaimError(err?.message || 'Failed to claim mission');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
      <BannerCarousel />

      <Card className="mb-4">
        <div className="px-4 pt-3.5">
          <div className="text-[13px] font-extrabold tracking-wider text-[#c4b5fd] uppercase">
            OUTPOST PRODUCTION
          </div>
          <div className="relative w-full h-[130px] overflow-hidden rounded-[10px] mt-2.5 [&_img]:w-full [&_img]:h-full [&_img]:object-cover after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-10 after:bg-gradient-to-b after:from-transparent after:to-[rgba(26,22,64,0.8)]">
            <GameImage
              src="/media/images/regions/derpshire-valley.png"
              category="regions"
              alt="Outpost"
              fallbackSrc="/media/images/regions/fallback.png"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 py-3 items-center">
            <div className="flex items-center gap-1.5">
              <ItemQty src="soft_arcanium" amount={arcaniumRate} size={15} suffix="/h" />
            </div>
            {otherRate > 0 && (
              <StatPill icon="⭐" value={`${otherRate.toLocaleString()} /h`} />
            )}
            <StatPill icon="🏠" value={locations.length} />
            <button
              className="col-span-3 bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-[#1a1640] border-0 rounded-lg p-2.5 text-sm font-extrabold tracking-wider cursor-pointer transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(245,158,11,0.4)]"
              onClick={() => navigate('/locations')}
            >
              CLAIM ALL
            </button>
          </div>
        </div>

        <Divider className="mx-4" />

        <div className="py-1">
          {claimError && (
            <div className="text-error-red text-xs px-3 py-1 bg-[rgba(239,68,68,0.1)] rounded-md mx-2 mb-2">
              {claimError}
            </div>
          )}

          {completedJobs.map((j: any) => (
            <MissionReadyRow
              key={j.id}
              name={j.name}
              showClaim={j.type === 'MissionJob'}
              claiming={claimingId === j.id}
              onClick={() => openModalSpec({ jobId: j.id })}
              onClaim={() => handleClaim(j.id)}
            />
          ))}

          {inProgressJobs.map((j: any) => {
            const timeStr = formatTime(getJobRemaining(j));
            const isCrafting = j.type === 'CraftingJob';
            const craftLoc = j.data?.locationId || j.locationId;
            const handleRowClick = isCrafting ? () => goToForge(craftLoc, j.id) : () => openModalSpec({ jobId: j.id });
            return (
              <MissionInProgressRow
                key={j.id}
                name={j.name}
                icon={getJobIcon(j.type)}
                subtitle={isCrafting ? 'Tap to open The Forge →' : undefined}
                timeLabel={timeStr}
                onClick={handleRowClick}
              />
            );
          })}

          {allActiveJobs.length === 0 && (
            <EmptyState
              message="No active jobs"
              action={
                <button
                  data-sfx="ui.button_primary"
                  className="bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white border-0 rounded-lg px-5 py-2.5 text-[13px] font-bold tracking-wide cursor-pointer"
                  onClick={() => navigate('/missions')}
                >
                  START A MISSION
                </button>
              }
            />
          )}
        </div>
      </Card>

      <ForgeHero
        primaryWorkshop={primaryWorkshop}
        allActiveJobs={allActiveJobs}
        getJobRemaining={getJobRemaining}
        idleEntities={idleEntities}
        craftingRecipes={craftingRecipes}
        currencyBalances={currencyBalances}
        syncItemsTable={syncItemsTable}
        keeperLevel={profile?.keeperLevel ?? 1}
        goToForge={goToForge}
      />

      <div className="mb-4">
        <SectionHeader title="KEEPER STATUS" />
        <Card className="p-4 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <div className="text-4xl font-black text-derp-purple leading-none">{profile.keeperLevel}</div>
            <div className="text-[11px] font-bold tracking-wider text-[#c4b5fd] leading-tight">
              KEEPER<br />LEVEL
            </div>
          </div>
          <div className="flex-1 min-w-[120px]">
            <div className="text-xs text-text-secondary mb-1.5">
              {profile.keeperXp} / {profile.xpToNextLevel || 100} XP
            </div>
            <div className="h-2 bg-[rgba(139,92,246,0.15)] rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-derp-purple to-[#a78bfa] rounded transition-[width] duration-500 ease-in min-w-[2px]"
                style={{ width: `${(profile.keeperXp / (profile.xpToNextLevel || 100)) * 100}%` }}
              />
            </div>
          </div>
          <div className="w-full grid grid-cols-4 gap-2 pt-2 border-t border-[rgba(139,92,246,0.15)]">
            <KeyValue label={<IconLabel icon="🪶" size="sm">Entities</IconLabel>} value={entities.length} />
            <KeyValue label={<IconLabel icon="🟢" size="sm">Idle</IconLabel>} value={idleEntities} />
            <KeyValue label={<IconLabel icon="🟡" size="sm">Busy</IconLabel>} value={busyEntities} />
            <KeyValue label={<IconLabel icon="🏅" size="sm">Prestige</IconLabel>} value={profile.prestigeTokens || 0} />
          </div>
        </Card>
      </div>
    </div>
  );
}

interface ForgeHeroProps {
  primaryWorkshop: any;
  allActiveJobs: any[];
  getJobRemaining: (j: any) => number;
  idleEntities: number;
  craftingRecipes: any[];
  currencyBalances: Record<string, number>;
  syncItemsTable: any;
  keeperLevel: number;
  goToForge: (locationId?: string, craftJobId?: string) => void;
}

function ForgeHero({
  primaryWorkshop,
  allActiveJobs,
  getJobRemaining,
  idleEntities,
  craftingRecipes,
  currencyBalances,
  syncItemsTable,
  keeperLevel,
  goToForge,
}: ForgeHeroProps) {
  if (!primaryWorkshop) return null;
  const readyCraftJob = allActiveJobs.find(
    (j: any) => j.type === 'CraftingJob' && getJobRemaining(j) <= 0,
  );
  const wsTier = Math.max(1, Number(primaryWorkshop.level || 1));
  const slotsTotal = workshopParallelSlots(wsTier);
  const wsActive = allActiveJobs.filter(
    (j: any) => j.type === 'CraftingJob' && (j.data?.locationId || j.locationId) === primaryWorkshop.locationId,
  );
  const slotOpen = wsActive.length < slotsTotal;
  const idleHasSlot = idleEntities > 0;

  const recipeTierCap = wsTier;
  const passesVisibility = (r: any) =>
    (r.requiredKeeperLevel || 1) <= keeperLevel && Number(r.tier ?? 1) <= recipeTierCap;
  const affordableCount = (craftingRecipes || []).filter((r: any) => {
    if (!passesVisibility(r)) return false;
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
  }).length;
  const hasAffordable = affordableCount > 0;

  const visibleRecipeIds = (craftingRecipes || [])
    .filter(passesVisibility)
    .map((r: any) => String(r.id))
    .sort();
  const seenKey = `forge.recipes.seen.${primaryWorkshop.locationId}`;
  let previouslySeen: string[] = [];
  try { previouslySeen = JSON.parse(localStorage.getItem(seenKey) || '[]'); } catch { previouslySeen = []; }
  const seenSet = new Set(previouslySeen);
  const newlyUnlockedIds = visibleRecipeIds.filter((id) => !seenSet.has(id));
  const newlyUnlocked = newlyUnlockedIds.length > 0;
  const triggerKind: 'ready' | 'actionable' | 'unlocked' | null = readyCraftJob
    ? 'ready'
    : (slotOpen && idleHasSlot && hasAffordable)
    ? 'actionable'
    : newlyUnlocked
    ? 'unlocked'
    : null;
  if (!triggerKind) return null;
  const heroTitle =
    triggerKind === 'ready'
      ? 'A Craft is Ready to Collect'
      : triggerKind === 'actionable'
      ? 'The Forge Awaits'
      : 'Your Forge is Unlocked';
  const tierSpeedupPct = Math.round((1 - workshopTimerMultiplier(wsTier)) * 100);
  const tierClass = wsTier >= 3 ? 'tier-3' : wsTier >= 2 ? 'tier-2' : 'tier-1';
  const heroSub: React.ReactNode =
    triggerKind === 'ready'
      ? 'Pull it from the flames before it cools.'
      : triggerKind === 'actionable'
      ? (
        <>
          {`${affordableCount} recipe${affordableCount === 1 ? '' : 's'} ready`}
          <Chip tone={tierClass}>T{wsTier}</Chip>
          {` · ${slotsTotal - wsActive.length}/${slotsTotal} crucible${slotsTotal === 1 ? '' : 's'} open`}
          {tierSpeedupPct > 0 && <Chip tone="success">−{tierSpeedupPct}% time</Chip>}
        </>
      )
      : `Lvl ${primaryWorkshop.level} ${primaryWorkshop.name} — pick a recipe to forge your first item.`;
  const heroBtn =
    triggerKind === 'ready' ? 'COLLECT NOW' : triggerKind === 'actionable' ? 'ENTER THE FORGE' : 'BEGIN CRAFTING';
  const wsDisplay = (primaryWorkshop as any)?.displayDef || null;
  const heroBgImage = wsDisplay?.backgroundImage || null;
  const heroBorder = wsDisplay?.borderColor || null;
  const heroBgStyle = heroBgImage
    ? (/^(linear-gradient|radial-gradient|url\()/i.test(heroBgImage) ? heroBgImage : `url(${heroBgImage})`)
    : null;

  return (
    <div className="mb-4">
      <div
        className="relative bg-bg-card rounded-2xl border border-[rgba(249,115,22,0.55)] overflow-hidden cursor-pointer transition-all isolate hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(249,115,22,0.25)] after:content-[''] after:absolute after:inset-0 after:z-0 after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_100%,rgba(254,215,170,0.32),transparent_55%),linear-gradient(to_top,rgba(249,115,22,0.55)_0%,rgba(34,24,88,0.55)_70%)]"
        onClick={() => goToForge(primaryWorkshop.locationId)}
        style={heroBorder ? { borderColor: heroBorder } : undefined}
      >
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={heroBgStyle ? { backgroundImage: heroBgStyle } : undefined}
        />
        <div className="relative z-[1] p-[18px] flex flex-col gap-1.5 text-[#fff7ed]">
          <div className="text-[11px] font-extrabold text-[#fed7aa] tracking-[0.18em] uppercase">
            {triggerKind === 'ready' ? '✨  READY' : triggerKind === 'unlocked' ? '🆕  NEW' : '⚒️  WORKSHOP'}
          </div>
          <h3 className="font-cinzel m-0 text-[22px] font-black tracking-wider uppercase [text-shadow:0_3px_14px_rgba(249,115,22,0.55)]">
            {heroTitle}
          </h3>
          <p className="m-0 text-[13px] text-[#fde68a] flex flex-wrap items-center gap-1.5">{heroSub}</p>
          <button
            className="mt-2 self-start px-4 py-2.5 rounded-[10px] border border-[rgba(254,215,170,0.55)] bg-[rgba(15,12,38,0.55)] text-[#fff7ed] font-extrabold tracking-wider cursor-pointer text-xs hover:bg-[rgba(15,12,38,0.8)]"
            onClick={(e) => {
              e.stopPropagation();
              try { localStorage.setItem(seenKey, JSON.stringify(visibleRecipeIds)); } catch {}
              const targetLocId =
                triggerKind === 'ready'
                  ? (readyCraftJob?.data?.locationId || readyCraftJob?.locationId || primaryWorkshop.locationId)
                  : primaryWorkshop.locationId;
              const focusJobId = triggerKind === 'ready' ? readyCraftJob?.id : undefined;
              goToForge(targetLocId, focusJobId);
            }}
          >
            {heroBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
