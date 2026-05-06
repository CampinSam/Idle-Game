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
import { workshopParallelSlots, workshopTimerMultiplier } from '@derp/math';
import { BannerCarousel } from './BannerCarousel';
import { MissionReadyRow, MissionInProgressRow } from './MissionRow';
import './HomePage.css';

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
    const remainingTicks = timer.getValue(currentTick);
    return tickRate > 0 ? (remainingTicks / tickRate) * 1000 : Infinity;
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
    <div className="hp">
      <BannerCarousel />

      <div className="hp-combined-card">
        <div className="hp-combined-top">
          <div className="hp-section-label">OUTPOST PRODUCTION</div>
          <div className="hp-outpost-scene">
            <GameImage
              src="/media/images/regions/derpshire-valley.png"
              category="regions"
              alt="Outpost"
              fallbackSrc="/media/images/regions/fallback.png"
            />
          </div>
          <div className="hp-outpost-stats">
            <div className="hp-outpost-stat">
              <ItemQty src="soft_arcanium" amount={arcaniumRate} size={15} suffix="/h" />
            </div>
            {otherRate > 0 && (
              <div className="hp-outpost-stat">
                <span className="hp-outpost-stat-icon">⭐</span>
                <span className="hp-outpost-stat-val">{otherRate.toLocaleString()} /h</span>
              </div>
            )}
            <div className="hp-outpost-stat">
              <span className="hp-outpost-stat-icon">🏠</span>
              <span className="hp-outpost-stat-val">{locations.length}</span>
            </div>
            <button className="hp-claim-all-btn" onClick={() => navigate('/locations')}>
              CLAIM ALL
            </button>
          </div>
        </div>

        <div className="hp-combined-divider" />

        <div className="hp-combined-bottom">
          {claimError && (
            <div style={{ color: '#ef4444', fontSize: '0.75rem', padding: '4px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, margin: '0 8px 8px' }}>{claimError}</div>
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
            <div className="hp-empty-state">
              <span>No active jobs</span>
              <button className="hp-start-btn" onClick={() => navigate('/missions')}>START A MISSION</button>
            </div>
          )}
        </div>
      </div>

      {(() => {
        if (!primaryWorkshop) return null;
        const readyCraftJob = allActiveJobs.find(
          (j: any) => j.type === 'CraftingJob' && getJobRemaining(j) <= 0,
        );
        // Place-scoped slot count: only crucibles at the primary workshop count.
        const wsTier = Math.max(1, Number(primaryWorkshop.level || 1));
        const slotsTotal = workshopParallelSlots(wsTier);
        const wsActive = allActiveJobs.filter(
          (j: any) => j.type === 'CraftingJob' && (j.data?.locationId || j.locationId) === primaryWorkshop.locationId,
        );
        const slotOpen = wsActive.length < slotsTotal;
        const idleHasSlot = idleEntities > 0;

        // Affordable recipes the player can start NOW: passes keeperLevel +
        // workshop tier cap + currency cost + material cost (inventory).
        const keeperLvl = profile?.keeperLevel ?? 1;
        const recipeTierCap = wsTier;
        const passesVisibility = (r: any) =>
          (r.requiredKeeperLevel || 1) <= keeperLvl && Number(r.tier ?? 1) <= recipeTierCap;
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
        const heroSub: React.ReactNode =
          triggerKind === 'ready'
            ? 'Pull it from the flames before it cools.'
            : triggerKind === 'actionable'
            ? (
              <>
                {`${affordableCount} recipe${affordableCount === 1 ? '' : 's'} ready`}
                <span className={`hp-forge-tier-pill tier-${Math.min(3, wsTier)}`}>T{wsTier}</span>
                {` · ${slotsTotal - wsActive.length}/${slotsTotal} crucible${slotsTotal === 1 ? '' : 's'} open`}
                {tierSpeedupPct > 0 && (
                  <span className="hp-forge-tier-bonus">−{tierSpeedupPct}% time</span>
                )}
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
        // Note: wsDisplay.cardBackground is intentionally NOT applied to the
        // parent here — it was a translucent override that revealed the page
        // background through the card. The card chassis is always the solid
        // .hp-forge-hero CSS surface; themed visuals belong on the
        // .hp-forge-hero-bg overlay below via wsDisplay.backgroundImage.
        return (
          <div className="hp-section">
            <div
              className={`hp-forge-hero hp-forge-hero-${triggerKind}`}
              onClick={() => goToForge(primaryWorkshop.locationId)}
              style={heroBorder ? { borderColor: heroBorder } : undefined}
            >
              {heroBgStyle ? (
                <div className="hp-forge-hero-bg" style={{ backgroundImage: heroBgStyle }} />
              ) : (
                <div className="hp-forge-hero-bg" />
              )}
              <div className="hp-forge-hero-content">
                <div className="hp-forge-hero-eyebrow">
                  {triggerKind === 'ready' ? '✨  READY' : triggerKind === 'unlocked' ? '🆕  NEW' : '⚒️  WORKSHOP'}
                </div>
                <h3 className="hp-forge-hero-title">{heroTitle}</h3>
                <p className="hp-forge-hero-sub">{heroSub}</p>
                <button
                  className="hp-forge-hero-btn"
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
      })()}

      <div className="hp-section">
        <div className="hp-section-header">
          <h2>KEEPER STATUS</h2>
        </div>
        <div className="hp-keeper-card">
          <div className="hp-keeper-level">
            <div className="hp-keeper-level-num">{profile.keeperLevel}</div>
            <div className="hp-keeper-level-label">KEEPER<br/>LEVEL</div>
          </div>
          <div className="hp-keeper-xp">
            <div className="hp-xp-text">{profile.keeperXp} / {profile.xpToNextLevel || 100} XP</div>
            <div className="hp-xp-bar">
              <div
                className="hp-xp-fill"
                style={{ width: `${(profile.keeperXp / (profile.xpToNextLevel || 100)) * 100}%` }}
              />
            </div>
          </div>
          <div className="hp-keeper-stats">
            <div className="hp-keeper-stat">
              <span>🪶 Entities</span>
              <strong>{entities.length}</strong>
            </div>
            <div className="hp-keeper-stat">
              <span>🟢 Idle</span>
              <strong>{idleEntities}</strong>
            </div>
            <div className="hp-keeper-stat">
              <span>🟡 Busy</span>
              <strong>{busyEntities}</strong>
            </div>
            <div className="hp-keeper-stat">
              <span>🏅 Prestige</span>
              <strong>{profile.prestigeTokens || 0}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
