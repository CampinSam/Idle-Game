import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncLocations,
  useAllActiveJobs,
  useSyncQuests,
  useHomeBanners,
  useSyncCurrencyBalances,
} from '../../hooks/useSyncSelectors';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchCraftingRecipes } from '../../store/gameSlice';
import { useCurrentTick, useTickRate, createCountdownTimer, useActiveBoosts } from '../../tick';
import { useCollectJob } from '../../hooks/useCollectJob';
import { useModal } from '../../context/ModalContext';
import { api } from '../../services/api';
import {
  computeGeneratorProduction,
  computeConsumptionFromBuildings,
  aggregateByResource,
  computeInventoryAmount,
} from '../../utils/locationProduction';
import { GameImage } from '../../components/GameImage';
import { HomePageSkeleton } from '../../components/Skeleton';
import { getEntityKind } from '../entities/registry';
import { HOME_V2_PROXY, formatProxyCountdown } from './HomePageV2.proxy';
import { HomescreenToggle } from './HomescreenToggle';
import { MissionReadyRow, MissionInProgressRow } from './MissionRow';
import './HomePageV2.css';

const MAX_OUTPOST_SLOTS = 5;

function formatRemaining(ms: number): string | null {
  if (ms <= 0) return null;
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function HomePageV2() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const locations = useSyncLocations();
  const allActiveJobs = useAllActiveJobs();
  const quests = useSyncQuests();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const banners = useHomeBanners();
  const boostInfo = useActiveBoosts();
  const currencyBalances = useSyncCurrencyBalances();
  const syncItemsTable = useAppSelector((s) => s.sync.items);
  const craftingRecipes = useAppSelector((s) => s.game.craftingRecipes);
  const { collectJob } = useCollectJob();
  const { pushModal } = useModal();

  // Re-tick the season countdown once a minute (proxy display only).
  const [, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Match HomePage: ensure recipes are loaded so the crafting trigger
  // reflects affordability instead of always missing.
  useEffect(() => {
    if (!craftingRecipes || craftingRecipes.length === 0) {
      dispatch(fetchCraftingRecipes());
    }
  }, [dispatch, craftingRecipes]);

  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState('');

  const getJobRemaining = useCallback((j: any): number => {
    if (j.startTick == null || j.durationTicks == null) return Infinity;
    const t = createCountdownTimer({ startTick: j.startTick, durationTicks: j.durationTicks });
    const ticksLeft = t.getValue(currentTick);
    return tickRate > 0 ? (ticksLeft / tickRate) * 1000 : Infinity;
  }, [currentTick, tickRate]);

  const openModalSpec = useCallback(async (jobId: string) => {
    try {
      const spec = await api.getModalSpec({ jobId });
      if (spec?.version === 1) pushModal(spec);
    } catch (err) {
      console.error('[HomePageV2] modal spec failed:', err);
    }
  }, [pushModal]);

  const handleClaim = async (id: string) => {
    setClaimError('');
    setClaimingId(id);
    try {
      await collectJob(id);
    } catch (err: any) {
      setClaimError(err?.message || 'Failed to claim');
    } finally {
      setClaimingId(null);
    }
  };

  // -------- Aggregates (server data) ------------------------------
  const { productionByResource, storageUsed, storageCap } = useMemo(() => {
    const prod: Record<string, number> = {};
    let used = 0;
    let cap = 0;
    for (const loc of locations as any[]) {
      const gens = computeGeneratorProduction(loc);
      const cons = computeConsumptionFromBuildings(loc);
      const types: Record<string, string> = (loc as any).storage?.resourceTypes || {};
      for (const s of aggregateByResource(loc, gens, cons, types)) {
        prod[s.outputRefId] = (prod[s.outputRefId] ?? 0) + s.netRatePerHour;
        used += s.currentAmount;
        cap += s.capacity;
      }
    }
    return { productionByResource: prod, storageUsed: used, storageCap: cap };
  }, [locations]);

  const arcaniumRate = productionByResource['soft_arcanium'] ?? 0;
  const storageFillPct = storageCap > 0
    ? Math.min(100, Math.round((storageUsed / storageCap) * 100))
    : 0;

  // -------- Quick-link counts (server data) -----------------------
  const dailyQuests = quests.filter((q: any) => q.questDef?.cadence === 'daily');
  const dailyQuestsTotal = dailyQuests.length;
  const dailyQuestsDone = dailyQuests.filter(
    (q: any) => q.status === 'completed' || q.status === 'claimed',
  ).length;
  const dailyQuestsReady = dailyQuests.some((q: any) => q.status === 'completed');

  const outpostCount = locations.length;
  const outpostsAlert = outpostCount < MAX_OUTPOST_SLOTS;

  const birdCount = entities.filter((e: any) => getEntityKind(e) === 'derp_bird').length;

  // Crafting trigger — mirrors the spirit of HomePage's logic without
  // pulling in a workshop API call. The dot lights up when there's a
  // craft ready to claim, OR an idle entity + at least one affordable
  // visible recipe, OR a newly-unlocked recipe the player hasn't seen.
  // Workshop-tier capping is a refinement HomePage applies on its own;
  // here we keep it sync-selector-only so a stray notification at most
  // nudges the player toward the forge — never blocks them.
  const idleEntityCount = entities.filter((b: any) => b.status === 'idle').length;
  const craftingActive = allActiveJobs.filter((j: any) => j.type === 'CraftingJob').length;
  const craftingReady = allActiveJobs.some(
    (j: any) => j.type === 'CraftingJob' && getJobRemaining(j) <= 0,
  );
  const craftingDot = useMemo(() => {
    if (craftingReady) return true;
    const keeperLvl = profile?.keeperLevel ?? 1;
    const passesVisibility = (r: any) => (r.requiredKeeperLevel || 1) <= keeperLvl;
    const visible = (craftingRecipes || []).filter(passesVisibility);
    const affordable = visible.some((r: any) => {
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
    });
    if (idleEntityCount > 0 && affordable) return true;
    const visibleIds = visible.map((r: any) => String(r.id));
    if (visibleIds.length === 0) return false;
    let previouslySeen: string[] = [];
    try { previouslySeen = JSON.parse(localStorage.getItem('forge.recipes.seen.global') || '[]'); } catch { previouslySeen = []; }
    const seen = new Set(previouslySeen);
    return visibleIds.some((id) => !seen.has(id));
  }, [
    craftingReady, profile, craftingRecipes, currencyBalances,
    syncItemsTable, idleEntityCount,
  ]);

  // -------- Active mission jobs -----------------------------------
  const missionJobs = allActiveJobs.filter((j: any) => j.type === 'MissionJob');
  const completedMissions = missionJobs.filter((j: any) => getJobRemaining(j) <= 0);
  const inProgressMissions = missionJobs.filter((j: any) => getJobRemaining(j) > 0);

  if (!profile) return <HomePageSkeleton />;

  const seasonCountdown = formatProxyCountdown(HOME_V2_PROXY.season.endsAtMs);
  const bp = HOME_V2_PROXY.battlePass;
  const boss = HOME_V2_PROXY.boss;

  const comingSoon = (label: string) => () => alert(`${label} — coming soon`);

  return (
    <div className="hp2">
      <header className="hp2__header">
        <h1 className="hp2__title">Derp Universe</h1>
        <HomescreenToggle current="v2" />
      </header>

      {/* ---- Season + Battle Pass combined strip --------------- */}
      <section className="hp2__card hp2-strip">
        <div className="hp2__card-eyebrow">Season &amp; Battle Pass · PROXY</div>
        <div className="hp2-strip__row">
          <div className="hp2-strip__season">
            <div className="hp2-season__sigil" aria-hidden>🌌</div>
            <div className="hp2-strip__season-info">
              <div className="hp2-season__name">{HOME_V2_PROXY.season.name}</div>
              <div className="hp2-season__countdown">
                Ends in <strong>{seasonCountdown}</strong>
              </div>
            </div>
          </div>
          <div className="hp2-strip__divider" aria-hidden />
          <div className="hp2-strip__bp hp2-bp">
            <div className="hp2-bp__tier">{bp.tier}</div>
            <div className="hp2-bp__main">
              <div className="hp2-bp__label">
                <span>T{bp.tier}/{bp.tierMax}</span>
                <span>{bp.xp}/{bp.xpToNext} XP</span>
              </div>
              <div className="hp2-bp__bar">
                <div
                  className="hp2-bp__fill"
                  style={{ width: `${Math.min(100, (bp.xp / bp.xpToNext) * 100)}%` }}
                />
              </div>
              <div className="hp2-bp__next">{bp.nextRewardLabel}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Quick-link tiles ---------------------------------- */}
      <section className="hp2__card">
        <div className="hp2__card-eyebrow">Quick Access</div>
        <div className="hp2-quick">
          <button className="hp2-quick__tile" onClick={() => navigate('/rewards')}>
            {dailyQuestsReady && <span className="hp2-quick__dot" aria-hidden />}
            <span className="hp2-quick__icon" aria-hidden>📜</span>
            <span className="hp2-quick__count">{dailyQuestsDone}/{dailyQuestsTotal}</span>
            <span className="hp2-quick__label">Quests</span>
          </button>
          <button className="hp2-quick__tile" onClick={() => navigate('/locations')}>
            {outpostsAlert && <span className="hp2-quick__dot" aria-hidden />}
            <span className="hp2-quick__icon" aria-hidden>🏠</span>
            <span className="hp2-quick__count">{outpostCount}/{MAX_OUTPOST_SLOTS}</span>
            <span className="hp2-quick__label">Outposts</span>
          </button>
          <button className="hp2-quick__tile" onClick={() => navigate('/entities')}>
            <span className="hp2-quick__icon" aria-hidden>🪶</span>
            <span className="hp2-quick__count">{birdCount}/{HOME_V2_PROXY.birdRosterCap}</span>
            <span className="hp2-quick__label">Birds</span>
          </button>
          <button className="hp2-quick__tile" onClick={() => navigate('/crafting')}>
            {craftingDot && <span className="hp2-quick__dot" aria-hidden />}
            <span className="hp2-quick__icon" aria-hidden>⚒️</span>
            <span className="hp2-quick__count">{craftingActive}</span>
            <span className="hp2-quick__label">Crafting</span>
          </button>
        </div>
      </section>

      {/* ---- Region map card ----------------------------------- */}
      <section className="hp2__card">
        <div className="hp2__card-eyebrow">Region · Outpost Production</div>
        <div className="hp2-region__scene">
          <div className="hp2-region__badges">
            <span className="hp2-badge hp2-badge--boost">
              ⚡ {boostInfo.boostActive ? `${boostInfo.boostPercent}% BOOST` : HOME_V2_PROXY.region.boostLabel}
            </span>
            <span className="hp2-badge hp2-badge--threat">⚠ {HOME_V2_PROXY.region.threatLabel}</span>
          </div>
          <GameImage
            src="/media/images/regions/derpshire-valley.png"
            category="regions"
            alt="Region"
            fallbackSrc="/media/images/regions/fallback.png"
          />
        </div>
        <div className="hp2-region__rate-row">
          <div className="hp2-region__stat">
            <span aria-hidden>💎</span>
            <span><strong>{Math.round(arcaniumRate).toLocaleString()}</strong>/h</span>
          </div>
          <button
            className="hp2-region__collect"
            onClick={() => navigate('/locations')}
          >
            Collect All
          </button>
        </div>
        <div className="hp2-region__storage">
          <div className="hp2-region__storage-label">
            <span>Storage</span>
            <span>{storageFillPct}%</span>
          </div>
          <div className="hp2-region__storage-bar">
            <div
              className="hp2-region__storage-fill"
              style={{ width: `${storageFillPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* ---- Active missions ----------------------------------- */}
      <section className="hp2__card">
        <div className="hp2__card-eyebrow">Active Missions</div>
        {claimError && (
          <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 6 }}>{claimError}</div>
        )}
        {completedMissions.map((j: any) => (
          <MissionReadyRow
            key={j.id}
            name={j.name}
            showClaim
            claiming={claimingId === j.id}
            onClick={() => openModalSpec(j.id)}
            onClaim={() => handleClaim(j.id)}
          />
        ))}
        {inProgressMissions.map((j: any) => (
          <MissionInProgressRow
            key={j.id}
            name={j.name}
            subtitle="In progress"
            timeLabel={formatRemaining(getJobRemaining(j)) ?? '...'}
            onClick={() => openModalSpec(j.id)}
          />
        ))}
        {missionJobs.length === 0 && (
          <div className="hp2-missions__empty">No active missions</div>
        )}
        <button className="hp2-missions__cta" onClick={() => navigate('/missions')}>
          View All Missions
        </button>
      </section>

      {/* ---- Seasonal boss ------------------------------------- */}
      <section className="hp2__card hp2-boss">
        <div className="hp2__card-eyebrow">Seasonal Boss · PROXY</div>
        <div className="hp2-boss__head">
          <div>
            <div className="hp2-boss__name">{boss.name}</div>
            <div className="hp2-boss__sub">{boss.subtitle}</div>
          </div>
          <div className="hp2-boss__sigil" aria-hidden>👁️</div>
        </div>
        <div className="hp2-boss__hp-label">
          <span>Global HP</span>
          <span>{boss.hpPercent}%</span>
        </div>
        <div className="hp2-boss__hp">
          <div className="hp2-boss__hp-fill" style={{ width: `${boss.hpPercent}%` }} />
        </div>
        <div className="hp2-boss__reward">{boss.rewardLabel}</div>
        <button className="hp2-boss__cta" onClick={comingSoon('Seasonal Boss')}>
          View Boss
        </button>
      </section>

      {/* ---- Events list --------------------------------------- */}
      <section className="hp2__card">
        <div className="hp2__card-eyebrow">Events</div>
        {banners.length === 0 ? (
          <div className="hp2-events__empty">No events right now</div>
        ) : (
          <div className="hp2-events__list">
            {banners.slice(0, 4).map((b: any) => {
              const cta = b?.config?.cta || {};
              const target = cta.path || b?.config?.path;
              return (
                <div
                  key={b.id}
                  className="hp2-events__row"
                  onClick={() => target && navigate(target)}
                  role={target ? 'button' : undefined}
                >
                  <div className="hp2-events__icon" aria-hidden>{b?.config?.icon || '✨'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hp2-events__title">{b.title}</div>
                    {b.subtitle && <div className="hp2-events__sub">{b.subtitle}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button className="hp2-events__calendar" onClick={comingSoon('Event Calendar')}>
          Calendar
        </button>
      </section>
    </div>
  );
}
