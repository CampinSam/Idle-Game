import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncLocations,
  useAllActiveJobs,
  useSyncQuests,
  useHomeBanners,
} from '../../hooks/useSyncSelectors';
import { useCurrentTick, useTickRate, createCountdownTimer, useActiveBoosts } from '../../tick';
import { useCollectJob } from '../../hooks/useCollectJob';
import { useModal } from '../../context/ModalContext';
import { api } from '../../services/api';
import {
  computeGeneratorProduction,
  computeConsumptionFromBuildings,
  aggregateByResource,
} from '../../utils/locationProduction';
import { GameImage } from '../../components/GameImage';
import { HomePageSkeleton } from '../../components/Skeleton';
import { getEntityKind } from '../entities/registry';
import { HOME_V2_PROXY, formatProxyCountdown } from './HomePageV2.proxy';
import { HomescreenToggle } from './HomescreenToggle';
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
  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const locations = useSyncLocations();
  const allActiveJobs = useAllActiveJobs();
  const quests = useSyncQuests();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const banners = useHomeBanners();
  const boostInfo = useActiveBoosts();
  const { collectJob } = useCollectJob();
  const { pushModal } = useModal();

  // Re-tick the season countdown once a minute (proxy display only).
  const [, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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
  const productionByResource = useMemo(() => {
    return (locations as any[]).reduce<Record<string, number>>((acc, loc) => {
      const gens = computeGeneratorProduction(loc);
      const cons = computeConsumptionFromBuildings(loc);
      const types: Record<string, string> = (loc as any).storage?.resourceTypes || {};
      for (const s of aggregateByResource(loc, gens, cons, types)) {
        acc[s.outputRefId] = (acc[s.outputRefId] ?? 0) + s.netRatePerHour;
      }
      return acc;
    }, {});
  }, [locations]);

  const storageFillPct = useMemo(() => {
    let used = 0;
    let cap = 0;
    for (const loc of locations as any[]) {
      const gens = computeGeneratorProduction(loc);
      const cons = computeConsumptionFromBuildings(loc);
      const types: Record<string, string> = (loc as any).storage?.resourceTypes || {};
      for (const s of aggregateByResource(loc, gens, cons, types)) {
        used += s.currentAmount;
        cap += s.capacity;
      }
    }
    if (cap <= 0) return 0;
    return Math.min(100, Math.round((used / cap) * 100));
  }, [locations]);

  const arcaniumRate = productionByResource['soft_arcanium'] ?? 0;

  // -------- Quick-link counts (server data) -----------------------
  const dailyQuestsActionable = quests.filter(
    (q: any) => q.questDef?.cadence === 'daily' && (q.status === 'active' || q.status === 'completed'),
  ).length;
  const dailyQuestsReady = quests.some(
    (q: any) => q.questDef?.cadence === 'daily' && q.status === 'completed',
  );

  const outpostCount = locations.length;
  const outpostsAlert = outpostCount < MAX_OUTPOST_SLOTS;

  const birdCount = entities.filter((e: any) => getEntityKind(e) === 'derp_bird').length;

  const craftingReady = allActiveJobs.some(
    (j: any) => j.type === 'CraftingJob' && getJobRemaining(j) <= 0,
  );
  const craftingActive = allActiveJobs.filter((j: any) => j.type === 'CraftingJob').length;

  // -------- Active mission jobs -----------------------------------
  const missionJobs = allActiveJobs.filter((j: any) => j.type === 'MissionJob');
  const completedMissions = missionJobs.filter((j: any) => getJobRemaining(j) <= 0);
  const inProgressMissions = missionJobs.filter((j: any) => getJobRemaining(j) > 0);

  if (!profile) return <HomePageSkeleton />;

  const seasonCountdown = formatProxyCountdown(HOME_V2_PROXY.season.endsAtMs);
  const bp = HOME_V2_PROXY.battlePass;
  const boss = HOME_V2_PROXY.boss;

  return (
    <div className="hp2 page-transition-wrapper">
      <header className="hp2__header">
        <h1 className="hp2__title">Derp Universe</h1>
        <HomescreenToggle current="v2" />
      </header>

      {/* ---- Season banner -------------------------------------- */}
      <section className="hp2__card hp2-season">
        <div className="hp2__card-eyebrow">Current Season · PROXY</div>
        <div className="hp2-season__row">
          <div>
            <div className="hp2-season__name">{HOME_V2_PROXY.season.name}</div>
            <div className="hp2-season__countdown">
              Ends in <strong>{seasonCountdown}</strong>
            </div>
          </div>
          <div className="hp2-season__sigil" aria-hidden>🌌</div>
        </div>
      </section>

      {/* ---- Battle pass strip ---------------------------------- */}
      <section className="hp2__card">
        <div className="hp2__card-eyebrow">Battle Pass · PROXY</div>
        <div className="hp2-bp">
          <div className="hp2-bp__tier">{bp.tier}</div>
          <div className="hp2-bp__main">
            <div className="hp2-bp__label">
              <span>Tier {bp.tier} / {bp.tierMax}</span>
              <span>{bp.xp} / {bp.xpToNext} XP</span>
            </div>
            <div className="hp2-bp__bar">
              <div
                className="hp2-bp__fill"
                style={{ width: `${Math.min(100, (bp.xp / bp.xpToNext) * 100)}%` }}
              />
            </div>
            <div className="hp2-bp__next">Next: {bp.nextRewardLabel}</div>
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
            <span className="hp2-quick__count">{dailyQuestsActionable}</span>
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
            <span className="hp2-quick__count">{birdCount}</span>
            <span className="hp2-quick__label">Birds</span>
          </button>
          <button className="hp2-quick__tile" onClick={() => navigate('/crafting')}>
            {(craftingReady || craftingActive > 0) && <span className="hp2-quick__dot" aria-hidden />}
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
        <div className="hp2-region__stats">
          <div className="hp2-region__stat">
            <span aria-hidden>💎</span>
            <span><strong>{Math.round(arcaniumRate).toLocaleString()}</strong>/h</span>
          </div>
          <div className="hp2-region__stat">
            <span aria-hidden>📦</span>
            <span>Storage <strong>{storageFillPct}%</strong></span>
          </div>
          <button
            className="hp2-region__collect"
            onClick={() => navigate('/locations')}
          >
            Collect All
          </button>
        </div>
      </section>

      {/* ---- Active missions ----------------------------------- */}
      <section className="hp2__card">
        <div className="hp2__card-eyebrow">Active Missions</div>
        {claimError && (
          <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 6 }}>{claimError}</div>
        )}
        {completedMissions.map((j: any) => (
          <div
            key={j.id}
            className="hp2-missions__row"
            onClick={() => openModalSpec(j.id)}
          >
            <div className="hp2-missions__icon" aria-hidden>✅</div>
            <div className="hp2-missions__info">
              <span className="hp2-missions__name">{j.name}</span>
              <span className="hp2-missions__sub">Ready to claim</span>
            </div>
            <button
              className="hp2-missions__claim"
              onClick={(e) => { e.stopPropagation(); handleClaim(j.id); }}
              disabled={claimingId === j.id}
            >
              {claimingId === j.id ? '...' : 'Claim'}
            </button>
          </div>
        ))}
        {inProgressMissions.map((j: any) => {
          const t = formatRemaining(getJobRemaining(j));
          return (
            <div
              key={j.id}
              className="hp2-missions__row"
              onClick={() => openModalSpec(j.id)}
            >
              <div className="hp2-missions__icon" aria-hidden>🗺️</div>
              <div className="hp2-missions__info">
                <span className="hp2-missions__name">{j.name}</span>
                <span className="hp2-missions__sub">In progress</span>
              </div>
              <span className="hp2-missions__timer">{t ?? '...'}</span>
            </div>
          );
        })}
        {missionJobs.length === 0 && (
          <>
            <div className="hp2-missions__empty">No active missions</div>
            <button className="hp2-missions__cta" onClick={() => navigate('/missions')}>
              Start a Mission
            </button>
          </>
        )}
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
      </section>
    </div>
  );
}
