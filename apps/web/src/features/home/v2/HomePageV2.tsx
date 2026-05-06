import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncLocations,
  useAllActiveJobs,
  useSyncQuests,
  useHomeBanners,
  useSyncCurrencyBalances,
} from '../../../hooks/useSyncSelectors';
import { useAppDispatch, useAppSelector } from '../../../store';
import { fetchCraftingRecipes } from '../../../store/gameSlice';
import { useCurrentTick, useTickRate, createCountdownTimer, useActiveBoosts } from '../../../tick';
import { useCollectJob } from '../../../hooks/useCollectJob';
import { useModal } from '../../../context/ModalContext';
import { useNotifications } from '../../../context/NotificationContext';
import { api } from '../../../services/api';
import {
  computeGeneratorProduction,
  computeConsumptionFromBuildings,
  aggregateByResource,
  computeInventoryAmount,
} from '../../../utils/locationProduction';
import GameIcon from '../../../components/GameIcon';
import ToastOverlay from '../../../components/ToastOverlay';
import ConnectionStatusBanner from '../../../components/ConnectionStatusBanner';
import NotificationCenter from '../../notifications/NotificationCenter';
import { HomePageSkeleton } from '../../../components/Skeleton';
import { formatCompact } from '../../../utils/formatNumber';
import { resolveIcon } from '../../../utils/iconResolver';
import { getEntityKind } from '../../entities/registry';
import { HomescreenToggle } from '../HomescreenToggle';
import { MissionReadyRow, MissionInProgressRow } from '../MissionRow';
import { HOME_V2_PROXY, formatProxyCountdown } from './HomePageV2.proxy';
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

// ---------------------------------------------------------------
// Header — avatar + keeper level + XP bar + currency 2x3 + bell
// ---------------------------------------------------------------
function HpV2Header({
  profile,
  currencyDefs,
  currencyBalances,
  unreadCount,
  onBell,
}: {
  profile: any;
  currencyDefs: any[];
  currencyBalances: Record<string, number>;
  unreadCount: number;
  onBell: () => void;
}) {
  const xpPct = Math.max(0, Math.min(100,
    (profile.keeperXp / Math.max(1, profile.xpToNextLevel || 100)) * 100,
  ));

  const FALLBACK = ['soft_arcanium', 'hard_essence', 'premium_gems'];
  const visible = (currencyDefs ?? [])
    .filter((d: any) => d?.enabled !== false)
    .slice()
    .sort((a: any, b: any) =>
      (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0)
      || String(a?.id ?? '').localeCompare(String(b?.id ?? '')),
    )
    .slice(0, 6);
  const ids = visible.length > 0 ? visible.map((d: any) => d.id) : FALLBACK;
  // Pad to 6 so the 2x3 grid keeps its silhouette even when fewer defs exist.
  while (ids.length < 6) ids.push(`__pad_${ids.length}`);

  return (
    <header className="hpv2-header">
      <div className="hpv2-header__left">
        <div className="hpv2-avatar">
          <img
            className="hpv2-avatar__img"
            src="/media/images/icon-entities.png"
            alt=""
          />
          <span className="hpv2-avatar__lvl">{profile.keeperLevel}</span>
        </div>
        <div className="hpv2-header__keeper">
          <div className="hpv2-header__name-row">
            <span className="hpv2-header__name">{profile.username}</span>
            <HomescreenToggle current="v2" />
          </div>
          <div className="hpv2-header__lvl-label">KEEPER LEVEL {profile.keeperLevel}</div>
          <div className="hpv2-xp">
            <div className="hpv2-xp__bar">
              <div className="hpv2-xp__fill" style={{ width: `${xpPct}%` }} />
            </div>
            <div className="hpv2-xp__text">
              {formatCompact(profile.keeperXp)} / {formatCompact(profile.xpToNextLevel || 0)} XP
            </div>
          </div>
        </div>
      </div>

      <div className="hpv2-header__right">
        <div className="hpv2-currency-grid">
          {ids.map((id, idx) => {
            const isPad = id.startsWith('__pad_');
            const showPlus = idx < 3 && !isPad;
            return (
              <div
                key={id}
                className={`hpv2-chip ${isPad ? 'hpv2-chip--pad' : ''}`}
              >
                {!isPad && (
                  <>
                    <span className="hpv2-chip__icon">
                      <GameIcon src={resolveIcon('CURRENCY', id, currencyDefs, [])} size={14} />
                    </span>
                    <span className="hpv2-chip__val">{formatCompact(currencyBalances[id] ?? 0)}</span>
                    {showPlus && <span className="hpv2-chip__plus" aria-hidden>+</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <button className="hpv2-bell" onClick={onBell} aria-label="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="hpv2-bell__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------
// Season banner + Battle Pass card pair
// ---------------------------------------------------------------
function HpV2SeasonStrip() {
  const season = HOME_V2_PROXY.season;
  const bp = HOME_V2_PROXY.battlePass;
  const countdown = formatProxyCountdown(season.endsAtMs);
  const bpPct = Math.min(100, (bp.xp / bp.xpToNext) * 100);
  return (
    <section className="hpv2-strip">
      <div className="hpv2-season">
        <div className="hpv2-season__sigil" aria-hidden>{season.sigil}</div>
        <div className="hpv2-season__info">
          <div className="hpv2-season__eyebrow">SEASON</div>
          <div className="hpv2-season__name">{season.name}</div>
          <div className="hpv2-season__countdown">ENDS IN <strong>{countdown}</strong></div>
        </div>
      </div>
      <div className="hpv2-bp">
        <div className="hpv2-bp__head">
          <div>
            <div className="hpv2-bp__eyebrow">BATTLE PASS</div>
            <div className="hpv2-bp__tier">TIER {bp.tier}</div>
          </div>
          <span className="hpv2-bp__chevron" aria-hidden>›</span>
        </div>
        <div className="hpv2-bp__bar">
          <div className="hpv2-bp__fill" style={{ width: `${bpPct}%` }} />
        </div>
        <div className="hpv2-bp__reward">{bp.rewardLabel}</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Quick-link tile row — 4 illustrated tiles
// ---------------------------------------------------------------
interface QuickTile {
  to: string;
  icon: string;
  label: string;
  /** Numeric primary value (e.g. completed/3, owned/50, in-flight count). */
  cur: number;
  /** Optional denominator. Omit (or pass 0) to render just `cur` instead of `cur/cap`. */
  cap?: number;
  alert?: boolean;
}
function HpV2QuickLinks({ tiles }: { tiles: QuickTile[] }) {
  const navigate = useNavigate();
  return (
    <section className="hpv2-quicklinks">
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          className="hpv2-quicktile"
          onClick={() => navigate(t.to)}
        >
          {t.alert && <span className="hpv2-quicktile__dot" aria-hidden />}
          <span className="hpv2-quicktile__icon" aria-hidden>{t.icon}</span>
          <div className="hpv2-quicktile__body">
            <div className="hpv2-quicktile__label">{t.label}</div>
            <div className="hpv2-quicktile__count">
              {t.cap && t.cap > 0 ? `${t.cur}/${t.cap}` : t.cur}
            </div>
          </div>
          <span className="hpv2-quicktile__chevron" aria-hidden>›</span>
        </button>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------
// Region map card — illustrated scene with overlays
// ---------------------------------------------------------------
function HpV2RegionMap({
  productionRate,
  storageUsed,
  storageCap,
  onCollect,
  boostLabel,
}: {
  productionRate: number;
  storageUsed: number;
  storageCap: number;
  onCollect: () => void;
  boostLabel: string;
}) {
  const region = HOME_V2_PROXY.region;
  const fillPct = storageCap > 0
    ? Math.min(100, Math.round((storageUsed / storageCap) * 100))
    : 0;
  return (
    <section className="hpv2-region">
      <div className="hpv2-region__scene">
        <img
          className="hpv2-region__scene-img"
          src={region.sceneImagePath}
          alt={region.name}
          onError={(e) => {
            const t = e.currentTarget;
            if (!t.dataset.fellBack) {
              t.dataset.fellBack = '1';
              t.src = '/media/images/regions/fallback.png';
            }
          }}
        />
        <div className="hpv2-region__scene-shade" aria-hidden />

        <div className="hpv2-region__title-block">
          <div className="hpv2-region__title-row">
            <span className="hpv2-region__title">{region.name}</span>
            <span className="hpv2-region__info" aria-hidden>ⓘ</span>
          </div>
          <span className="hpv2-region__safety">{region.safetyLabel}</span>
        </div>

        <div className="hpv2-region__pillstack">
          <span className="hpv2-pill hpv2-pill--boost">⚡ {boostLabel}</span>
          <span className="hpv2-pill hpv2-pill--threat">⚠ {region.threatLabel}</span>
        </div>

        {region.buildingPlates.map((p) => (
          <div
            key={p.name}
            className="hpv2-region__plate"
            style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
          >
            <div className="hpv2-region__plate-name">{p.name}</div>
            <div className="hpv2-region__plate-lvl">Lv. {p.level}</div>
          </div>
        ))}

        <button className="hpv2-region__gear" aria-label="Region settings">⚙</button>

        <div className="hpv2-region__panel">
          <div className="hpv2-region__panel-row">
            <div className="hpv2-region__panel-label">PRODUCTION</div>
            <div className="hpv2-region__panel-val">{Math.round(productionRate).toLocaleString()}/h</div>
          </div>
          <div className="hpv2-region__panel-row">
            <div className="hpv2-region__panel-label">STORAGE</div>
            <div className="hpv2-region__panel-val">
              {formatCompact(storageUsed)}/{formatCompact(storageCap)}
            </div>
          </div>
          <div className="hpv2-region__storage-bar">
            <div className="hpv2-region__storage-fill" style={{ width: `${fillPct}%` }} />
          </div>
          <button className="hpv2-region__collect" onClick={onCollect}>COLLECT ALL</button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Active missions card (left of footer row)
// ---------------------------------------------------------------
function HpV2ActiveMissions({
  completed,
  inProgress,
  entityById,
  claimingId,
  claimError,
  getRemaining,
  onClaim,
  onOpenModal,
}: {
  completed: any[];
  inProgress: any[];
  entityById: Record<string, any>;
  claimingId: string | null;
  claimError: string;
  getRemaining: (j: any) => number;
  onClaim: (id: string) => void;
  onOpenModal: (id: string) => void;
}) {
  const navigate = useNavigate();
  const total = completed.length + inProgress.length;

  const renderTeam = (job: any) => {
    const ids: string[] = Array.isArray(job.team) ? job.team : [];
    const visible = ids.slice(0, 4);
    if (visible.length === 0) return null;
    return (
      <div className="hpv2-mission__team" aria-hidden>
        {visible.map((id) => {
          const e = entityById[id];
          const initial = (e?.name || '?').charAt(0).toUpperCase();
          return (
            <div key={id} className="hpv2-mission__avatar" title={e?.name || id}>
              {initial}
            </div>
          );
        })}
        {ids.length > visible.length && (
          <div className="hpv2-mission__avatar hpv2-mission__avatar--more">
            +{ids.length - visible.length}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="hpv2-card hpv2-missions">
      <div className="hpv2-card__head">
        <span className="hpv2-card__eyebrow">ACTIVE MISSIONS</span>
      </div>
      {claimError && <div className="hpv2-missions__err">{claimError}</div>}
      <div className="hpv2-missions__list">
        {completed.map((j: any) => (
          <div key={j.id} className="hpv2-mission">
            <MissionReadyRow
              name={j.name || j.defId}
              showClaim
              claiming={claimingId === j.id}
              onClick={() => onOpenModal(j.id)}
              onClaim={() => onClaim(j.id)}
            />
            {renderTeam(j)}
          </div>
        ))}
        {inProgress.map((j: any) => (
          <div key={j.id} className="hpv2-mission">
            <MissionInProgressRow
              name={j.name || j.defId}
              subtitle="In progress"
              timeLabel={formatRemaining(getRemaining(j)) ?? '...'}
              onClick={() => onOpenModal(j.id)}
            />
            {renderTeam(j)}
          </div>
        ))}
        {total === 0 && <div className="hpv2-missions__empty">No active missions</div>}
      </div>
      <button className="hpv2-cta hpv2-cta--teal" onClick={() => navigate('/missions')}>
        VIEW ALL MISSIONS
      </button>
    </section>
  );
}

// ---------------------------------------------------------------
// Seasonal boss card (center of footer row)
// ---------------------------------------------------------------
function HpV2BossCard({ onClick }: { onClick: () => void }) {
  const boss = HOME_V2_PROXY.boss;
  return (
    <section className="hpv2-card hpv2-boss">
      <div className="hpv2-card__head">
        <span className="hpv2-card__eyebrow">SEASONAL BOSS</span>
      </div>
      <div className="hpv2-boss__sigil" aria-hidden>{boss.sigil}</div>
      <div className="hpv2-boss__name">{boss.name}</div>
      <div className="hpv2-boss__sub">{boss.subtitle}</div>
      <div className="hpv2-boss__hp-label">
        <span>GLOBAL HP</span>
        <span>{boss.hpPercent}%</span>
      </div>
      <div className="hpv2-boss__hp">
        <div className="hpv2-boss__hp-fill" style={{ width: `${boss.hpPercent}%` }} />
      </div>
      <button className="hpv2-cta hpv2-cta--pink" onClick={onClick}>
        VIEW BOSS
      </button>
    </section>
  );
}

// ---------------------------------------------------------------
// Events card (right of footer row)
// ---------------------------------------------------------------
function HpV2EventsCard({
  banners,
  onCalendar,
}: {
  banners: any[];
  onCalendar: () => void;
}) {
  const navigate = useNavigate();
  const items = banners.length > 0
    ? banners.slice(0, 2).map((b: any) => {
        const cta = b?.config?.cta || {};
        return {
          id: b.id,
          icon: b?.config?.icon || '✨',
          title: b.title,
          subtitle: b.subtitle || '',
          remaining: '',
          target: cta.path || b?.config?.path || null,
        };
      })
    : HOME_V2_PROXY.fallbackEvents.map((e) => ({ ...e, target: null as string | null }));

  return (
    <section className="hpv2-card hpv2-events">
      <div className="hpv2-card__head">
        <span className="hpv2-card__eyebrow">EVENTS</span>
      </div>
      <div className="hpv2-events__list">
        {items.map((e) => (
          <div
            key={e.id}
            className="hpv2-events__row"
            onClick={() => e.target && navigate(e.target)}
            onKeyDown={(ev) => {
              if (e.target && (ev.key === 'Enter' || ev.key === ' ')) {
                ev.preventDefault();
                navigate(e.target);
              }
            }}
            role={e.target ? 'button' : undefined}
            tabIndex={e.target ? 0 : undefined}
          >
            <div className="hpv2-events__icon" aria-hidden>{e.icon}</div>
            <div className="hpv2-events__body">
              <div className="hpv2-events__title">{e.title}</div>
              {e.subtitle && <div className="hpv2-events__sub">{e.subtitle}</div>}
            </div>
            {e.remaining && <div className="hpv2-events__time">{e.remaining}</div>}
          </div>
        ))}
      </div>
      <button className="hpv2-cta hpv2-cta--teal" onClick={onCalendar}>
        CALENDAR
      </button>
    </section>
  );
}

// ---------------------------------------------------------------
// Page-local bottom nav
// ---------------------------------------------------------------
const NAV_TABS: Array<{ to: string; label: string; icon: React.ReactNode; badge?: number }> = [
  { to: '/home/v2', label: 'HOME',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { to: '/missions', label: 'MISSIONS',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> },
  { to: '/entities', label: 'CHARACTERS',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8c0-3.3-2.7-6-6-6S6 4.7 6 8c0 2.5 1.5 4.6 3.7 5.5L8 22h8l-1.7-8.5C16.5 12.6 18 10.5 18 8z"/></svg> },
  { to: '/inventory', label: 'INVENTORY',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> },
  { to: '/locations', label: 'OUTPOSTS',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="12" rx="1"/><path d="M12 2l8 8H4z"/></svg> },
  { to: '/store', label: 'STORE',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> },
];

function HpV2BottomNav({ missionsBadge, storeBadge }: { missionsBadge?: number; storeBadge?: number }) {
  return (
    <nav className="hpv2-bnav">
      {NAV_TABS.map((t) => {
        const badge = t.label === 'MISSIONS' ? missionsBadge : t.label === 'STORE' ? storeBadge : undefined;
        return (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/home/v2'}
            className={({ isActive }) => `hpv2-bnav__tab ${isActive ? 'hpv2-bnav__tab--active' : ''}`}
          >
            <span className="hpv2-bnav__icon">{t.icon}</span>
            <span className="hpv2-bnav__label">{t.label}</span>
            {!!badge && <span className="hpv2-bnav__badge">{badge > 99 ? '99+' : badge}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------
// Page composition
// ---------------------------------------------------------------
export default function HomePageV2() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const locations = useSyncLocations();
  const allActiveJobs = useAllActiveJobs();
  const quests = useSyncQuests();
  const banners = useHomeBanners();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const boostInfo = useActiveBoosts();
  const currencyBalances = useSyncCurrencyBalances();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const syncItemsTable = useAppSelector((s) => s.sync.items);
  const craftingRecipes = useAppSelector((s) => s.game.craftingRecipes);
  const { collectJob } = useCollectJob();
  const { pushModal } = useModal();
  const { unreadCount } = useNotifications();

  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState('');
  // Re-tick the proxy season countdown once a minute (display only).
  const [, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!craftingRecipes || craftingRecipes.length === 0) {
      dispatch(fetchCraftingRecipes());
    }
  }, [dispatch, craftingRecipes]);

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
    try { await collectJob(id); }
    catch (err: any) { setClaimError(err?.message || 'Failed to claim'); }
    finally { setClaimingId(null); }
  };

  // -------- Aggregates --------
  const { productionRate, storageUsed, storageCap } = useMemo(() => {
    let prod = 0;
    let used = 0;
    let cap = 0;
    for (const loc of locations as any[]) {
      const gens = computeGeneratorProduction(loc);
      const cons = computeConsumptionFromBuildings(loc);
      const types: Record<string, string> = (loc as any).storage?.resourceTypes || {};
      for (const s of aggregateByResource(loc, gens, cons, types)) {
        prod += Math.max(0, s.netRatePerHour);
        used += s.currentAmount;
        cap += s.capacity;
      }
    }
    return { productionRate: prod, storageUsed: used, storageCap: cap };
  }, [locations]);

  const dailyQuests = quests.filter((q: any) => q.questDef?.cadence === 'daily');
  const dailyQuestsTotal = dailyQuests.length;
  const dailyQuestsDone = dailyQuests.filter(
    (q: any) => q.status === 'completed' || q.status === 'claimed',
  ).length;
  const dailyQuestsReady = dailyQuests.some((q: any) => q.status === 'completed');

  const outpostCount = locations.length;
  const outpostsAlert = outpostCount < MAX_OUTPOST_SLOTS;
  const birdCount = entities.filter((e: any) => getEntityKind(e) === 'derp_bird').length;

  const idleEntityCount = entities.filter((b: any) => b.status === 'idle').length;
  const craftingActive = allActiveJobs.filter((j: any) => j.type === 'CraftingJob').length;
  const craftingReady = allActiveJobs.some(
    (j: any) => j.type === 'CraftingJob' && getJobRemaining(j) <= 0,
  );
  const craftingDot = useMemo(() => {
    if (craftingReady) return true;
    const keeperLvl = profile?.keeperLevel ?? 1;
    const visible = (craftingRecipes || []).filter((r: any) => (r.requiredKeeperLevel || 1) <= keeperLvl);
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
    try { previouslySeen = JSON.parse(localStorage.getItem('forge.recipes.seen.global') || '[]'); }
    catch { previouslySeen = []; }
    const seen = new Set(previouslySeen);
    return visibleIds.some((id) => !seen.has(id));
  }, [craftingReady, profile, craftingRecipes, currencyBalances, syncItemsTable, idleEntityCount]);

  const missionJobs = allActiveJobs.filter((j: any) => j.type === 'MissionJob');
  const completedMissions = missionJobs.filter((j: any) => getJobRemaining(j) <= 0);
  const inProgressMissions = missionJobs.filter((j: any) => getJobRemaining(j) > 0);

  const entityById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const e of entities as any[]) map[e.id] = e;
    return map;
  }, [entities]);

  const boostLabel = boostInfo.boostActive
    ? `${boostInfo.boostPercent}% BOOST`
    : HOME_V2_PROXY.region.boostLabel;

  const comingSoon = (label: string) => () => alert(`${label} — coming soon`);

  if (!profile) {
    return (
      <div className="hpv2 hpv2--loading">
        <HomePageSkeleton />
      </div>
    );
  }

  const tiles: QuickTile[] = [
    { to: '/rewards',   icon: '📜', label: 'QUESTS',   cur: dailyQuestsDone, cap: dailyQuestsTotal, alert: dailyQuestsReady },
    { to: '/locations', icon: '🏠', label: 'OUTPOSTS', cur: outpostCount,    cap: MAX_OUTPOST_SLOTS, alert: outpostsAlert },
    { to: '/entities',  icon: '🪶', label: 'BIRDS',    cur: birdCount,       cap: HOME_V2_PROXY.birdRosterCap },
    { to: '/crafting',  icon: '⚒️', label: 'CRAFTING', cur: craftingActive,  cap: HOME_V2_PROXY.craftingSlotCap, alert: craftingDot },
  ];

  return (
    <div className="hpv2">
      <ConnectionStatusBanner />
      <div className="hpv2__scroll">
        <HpV2Header
          profile={profile}
          currencyDefs={currencyDefs}
          currencyBalances={currencyBalances}
          unreadCount={unreadCount}
          onBell={() => setShowNotifCenter(true)}
        />
        <HpV2SeasonStrip />
        <HpV2QuickLinks tiles={tiles} />
        <HpV2RegionMap
          productionRate={productionRate}
          storageUsed={storageUsed}
          storageCap={storageCap}
          onCollect={() => navigate('/locations')}
          boostLabel={boostLabel}
        />
        <div className="hpv2-footrow">
          <HpV2ActiveMissions
            completed={completedMissions}
            inProgress={inProgressMissions}
            entityById={entityById}
            claimingId={claimingId}
            claimError={claimError}
            getRemaining={getJobRemaining}
            onClaim={handleClaim}
            onOpenModal={openModalSpec}
          />
          <HpV2BossCard onClick={comingSoon('Seasonal Boss')} />
          <HpV2EventsCard banners={banners} onCalendar={comingSoon('Event Calendar')} />
        </div>
      </div>

      <HpV2BottomNav missionsBadge={completedMissions.length} storeBadge={HOME_V2_PROXY.storeBadgeCount} />

      <ToastOverlay />
      {showNotifCenter && (
        <NotificationCenter onClose={() => setShowNotifCenter(false)} boostInfo={boostInfo} />
      )}
    </div>
  );
}
