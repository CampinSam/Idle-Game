import React, { useState, useEffect } from 'react';
import { useNow } from '../../hooks/useNow';
import { useNavigate, useParams } from 'react-router-dom';
import type { ScreenSectionDefinition } from '@derp/shared';
import {
  useSyncEntities,
  useSyncLocations,
  useSyncCurrencyBalances,
  useAllActiveJobs,
  useSyncStatus,
  useSyncItems,
  useSyncActiveCraftingJobs,
} from '../../hooks/useSyncSelectors';
import { useAppSelector, useAppDispatch } from '../../store';
import { fetchMissionDefs, fetchMissionCategoryDefs, fetchCraftingRecipes } from '../../store/gameSlice';
import { isNftEntity } from '../entities/types/derp_bird/isNftEntity';
import { Card, SectionHeader, EmptyState, StatPill } from '../../components/ui';
import { BannerCarousel } from '../home/BannerCarousel';
import { GlobalBuffsSection } from '../home/GlobalBuffsSection';
import { api } from '../../services/api';
import { EntityList, EntityDetail } from '../entities/components';
import EntityDetailContent from '../entities/EntityDetailContent';
import { normalizeFilter } from '../entities/entityListUtils';
import type { EntityFilter, EntitySortBy } from '../entities/types';
import InventoryContent from '../inventory/InventoryContent';
import MissionsContent from '../missions/MissionsContent';
import LocationsContent from '../locations/LocationsContent';
import LocationDetailContent from '../locations/LocationDetailContent';
import ForgeContent from '../forge/ForgeContent';
import StoreContent from '../store/StoreContent';
import AchievementsContent from '../achievements/AchievementsContent';
import ProfileContent from '../profile/ProfileContent';
import RewardsContent from '../rewards/RewardsContent';
import SettingsContent from '../settings/SettingsContent';

export interface ScreenComponentProps {
  section: ScreenSectionDefinition;
  onAction: (actionKey: string) => void;
}

export type ScreenComponentType = React.ComponentType<ScreenComponentProps>;

function BannerCarouselComp(_: ScreenComponentProps) {
  return <BannerCarousel />;
}

function SeasonBannerComp(_: ScreenComponentProps) {
  return <BannerCarousel />;
}

function ResourceSummaryBarComp({ section }: ScreenComponentProps) {
  const balances = useSyncCurrencyBalances();
  const currencyDefs: any[] = useAppSelector((s) => s.game.currencyDefs) ?? [];
  const maxShow = Number((section.props?.maxItems as any) ?? 4);

  const entries = Object.entries(balances).slice(0, maxShow);
  if (entries.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto mb-4 pb-1 [-webkit-overflow-scrolling:touch]">
      {entries.map(([id, amount]) => {
        const def = currencyDefs.find((c: any) => c.id === id);
        return (
          <div
            key={id}
            className="flex items-center gap-1.5 bg-bg-card rounded-lg px-3 py-2 border border-white/10 flex-shrink-0"
          >
            {def?.icon && <span className="text-sm">{def.icon}</span>}
            <div>
              <div className="text-[11px] text-text-secondary leading-none mb-0.5">
                {def?.name ?? id}
              </div>
              <div className="text-[13px] font-bold text-text-primary leading-none">
                {typeof amount === 'number' ? amount.toLocaleString() : String(amount)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuickStatusCardsComp({ section }: ScreenComponentProps) {
  const navigate = useNavigate();
  const entities = useSyncEntities();
  const locations = useSyncLocations();
  const allJobs = useAllActiveJobs();
  const props = section.props ?? {};

  const showEntities = props.showEntities !== false;
  const showOutposts = props.showOutposts !== false;
  const showMissions = props.showMissions !== false;

  const idleCount = entities.filter((e: any) => e.status === 'idle').length;
  const missionJobs = allJobs.filter((j: any) => j.type === 'MissionJob').length;

  const visibleCount = [showEntities, showOutposts, showMissions].filter(Boolean).length;
  const cols = visibleCount === 1 ? 'grid-cols-1' : visibleCount === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className={`grid ${cols} gap-2 mb-4`}>
      {showEntities && (
        <QuickCard
          icon="🪶"
          label="Entities"
          value={entities.length}
          sub={`${idleCount} idle`}
          onClick={() => navigate('/entities')}
        />
      )}
      {showOutposts && (
        <QuickCard
          icon="🏠"
          label="Outposts"
          value={locations.length}
          onClick={() => navigate('/locations')}
        />
      )}
      {showMissions && (
        <QuickCard
          icon="🗺️"
          label="Missions"
          value={missionJobs}
          onClick={() => navigate('/missions')}
        />
      )}
    </div>
  );
}

function QuickCard({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: string;
  label: string;
  value: number;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 bg-bg-card rounded-xl border border-white/10 px-2 py-3 text-center transition-all hover:border-white/20 hover:-translate-y-0.5 cursor-pointer"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-lg font-black text-text-primary leading-none">{value}</span>
      <span className="text-[10px] text-text-secondary uppercase tracking-wider">{label}</span>
      {sub && <span className="text-[10px] text-[#6ee7b7]">{sub}</span>}
    </button>
  );
}

function DailyQuestPanelComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '📋 DAILY QUESTS');
  const quests = Array.isArray(props.quests)
    ? (props.quests as Array<{ title: string; description?: string; completed?: boolean }>)
    : [];

  return (
    <Card className="mb-4 p-4 border-amber-500/20">
      <SectionHeader title={title} />
      {quests.length > 0 ? (
        <div className="mt-3 space-y-2">
          {quests.map((q, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span className="text-sm flex-shrink-0 mt-0.5">{q.completed ? '✅' : '⬜'}</span>
              <div className="min-w-0">
                <div className={`text-[13px] font-semibold leading-tight ${q.completed ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                  {q.title}
                </div>
                {q.description && (
                  <div className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{q.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-[12px] text-text-secondary text-center py-2">
          Daily quests coming soon — check back each day for challenges!
        </div>
      )}
    </Card>
  );
}

function MissionFeaturedCardComp({ section }: ScreenComponentProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const allJobs = useAllActiveJobs();
  const missionDefs: any[] = useAppSelector((s) => s.game.missionDefs) ?? [];
  const missionJobs = allJobs.filter((j: any) => j.type === 'MissionJob');

  useEffect(() => {
    if (missionDefs.length === 0) {
      dispatch(fetchMissionDefs());
    }
  }, [dispatch, missionDefs.length]);

  const pinnedId = section.props?.missionDefId as string | undefined;

  const featuredDef = pinnedId
    ? missionDefs.find((d: any) => d.id === pinnedId)
    : missionJobs.length > 0
      ? missionDefs.find((d: any) => d.id === missionJobs[0].missionDefId)
      : null;

  if (!featuredDef && missionJobs.length === 0) {
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title="🗺️ MISSIONS" />
        <div className="mt-3 text-[12px] text-text-secondary text-center py-2">No active missions</div>
        <button
          className="mt-3 w-full bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white rounded-lg p-2.5 text-sm font-extrabold tracking-wide cursor-pointer transition-all hover:-translate-y-px"
          onClick={() => navigate('/missions')}
        >
          VIEW MISSIONS
        </button>
      </Card>
    );
  }

  return (
    <Card className="mb-4 p-4 border-purple-500/20">
      <SectionHeader title="🗺️ FEATURED MISSION" />
      {featuredDef && (
        <div className="mt-3 space-y-1">
          <div className="text-[14px] font-bold text-text-primary leading-tight">{featuredDef.name}</div>
          {featuredDef.description && (
            <div className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">{featuredDef.description}</div>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            {featuredDef.tier != null && (
              <StatPill icon="⭐" value={`Tier ${featuredDef.tier}`} />
            )}
            <StatPill icon="⏳" value={`${missionJobs.length} Active`} />
          </div>
        </div>
      )}
      {!featuredDef && (
        <div className="mt-3 flex gap-2 flex-wrap">
          <StatPill icon="⏳" value={`${missionJobs.length} Active`} />
        </div>
      )}
      <button
        className="mt-3 w-full bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white rounded-lg p-2.5 text-sm font-extrabold tracking-wide cursor-pointer transition-all hover:-translate-y-px"
        onClick={() => navigate('/missions')}
      >
        GO TO MISSIONS
      </button>
    </Card>
  );
}

function EmptyStateCardComp({ section, onAction }: ScreenComponentProps) {
  const props = section.props ?? {};
  const actionKey = props.actionKey as string | undefined;
  const actionLabel = String(props.actionLabel ?? 'OK');
  const message = String(props.message ?? 'Nothing here yet');

  return (
    <div className="mb-4">
      <EmptyState
        message={message}
        action={
          actionKey ? (
            <button
              className="bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white border-0 rounded-lg px-5 py-2.5 text-[13px] font-bold tracking-wide cursor-pointer"
              onClick={() => onAction(actionKey)}
            >
              {actionLabel}
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

function HelpTipCardComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  return (
    <Card className="mb-4 p-4 flex gap-3 items-start border-blue-500/20">
      <span className="text-2xl flex-shrink-0">{String(props.icon ?? 'ℹ️')}</span>
      <div className="min-w-0">
        {props.title != null && (
          <div className="text-[13px] font-bold text-text-primary mb-0.5">
            {String(props.title)}
          </div>
        )}
        <div className="text-[12px] text-text-secondary leading-relaxed">
          {String(props.message ?? '')}
        </div>
      </div>
    </Card>
  );
}

function CTAButtonGroupComp({ section, onAction }: ScreenComponentProps) {
  const props = section.props ?? {};
  const buttons = Array.isArray(props.buttons)
    ? (props.buttons as Array<{ actionKey: string; label: string; style?: string }>)
    : [];

  if (buttons.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {buttons.map((btn, i) => (
        <button
          key={i}
          className={`rounded-xl px-5 py-3 font-extrabold tracking-wide text-sm cursor-pointer transition-all hover:-translate-y-px ${
            btn.style === 'secondary'
              ? 'bg-white/10 text-white border border-white/20 hover:bg-white/15'
              : 'bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white hover:shadow-[0_4px_12px_rgba(139,92,246,0.4)]'
          }`}
          onClick={() => onAction(btn.actionKey)}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

function SkeletonCardComp({ section }: ScreenComponentProps) {
  const rows = Number((section.props?.rows as any) ?? 3);
  const widths = ['70%', '85%', '55%', '75%', '65%'];
  return (
    <Card className="mb-4 p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-white/10 rounded animate-pulse"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </Card>
  );
}

function DailyCheckInCardComp({ section, onAction }: ScreenComponentProps) {
  const props = section.props ?? {};
  const actionKey = props.actionKey as string | undefined;
  return (
    <Card className="mb-4 p-4 flex items-center gap-3 border-amber-500/25 cursor-pointer hover:-translate-y-0.5 transition-all"
      onClick={actionKey ? () => onAction(actionKey) : undefined}
    >
      <span className="text-3xl flex-shrink-0">🎁</span>
      <div>
        <div className="text-[13px] font-bold text-text-primary">Daily Check-In</div>
        <div className="text-[11px] text-text-secondary mt-0.5">
          {String(props.subtitle ?? 'Come back each day for rewards!')}
        </div>
      </div>
      {actionKey && (
        <button
          className="ml-auto bg-gradient-to-br from-amber-500 to-amber-600 text-[#1a1640] rounded-lg px-3.5 py-1.5 text-xs font-extrabold tracking-wide"
          onClick={(e) => { e.stopPropagation(); onAction(actionKey); }}
        >
          {String(props.actionLabel ?? 'CLAIM')}
        </button>
      )}
    </Card>
  );
}

function ActiveMissionListComp({ section, onAction }: ScreenComponentProps) {
  const navigate = useNavigate();
  const allJobs = useAllActiveJobs();
  const missionJobs = allJobs.filter((j: any) => j.type === 'MissionJob');
  const rawLimit = section.props?.limit;
  const limit = rawLimit != null && rawLimit !== '' ? Math.max(1, Number(rawLimit)) : undefined;

  if (missionJobs.length === 0) {
    return (
      <EmptyStateCardComp
        section={{ ...section, props: { message: 'No active missions', actionKey: 'start_mission', actionLabel: 'START MISSION' } }}
        onAction={(key) => {
          if (key === 'start_mission') navigate('/missions');
        }}
      />
    );
  }

  return (
    <Card className="mb-4">
      <div className="px-4 py-3">
        <SectionHeader title="🗺️ ACTIVE MISSIONS" />
        <div className="mt-2 space-y-1 text-[13px] text-text-secondary">
          {(limit != null ? missionJobs.slice(0, limit) : missionJobs).map((j: any) => (
            <div key={j.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span>🗺️</span>
              <span className="flex-1 text-text-primary truncate">{j.name}</span>
            </div>
          ))}
          {limit != null && missionJobs.length > limit && (
            <div className="text-[11px] text-text-secondary pt-1">
              +{missionJobs.length - limit} more
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function PatchNotesCardComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  return (
    <Card className="mb-4 p-4 border-indigo-500/20">
      <SectionHeader title="📜 PATCH NOTES" />
      {props.version != null && (
        <div className="mt-1 text-[11px] text-text-secondary">v{String(props.version)}</div>
      )}
      {props.notes != null && (
        <div className="mt-2 text-[12px] text-text-secondary leading-relaxed whitespace-pre-wrap">
          {String(props.notes)}
        </div>
      )}
    </Card>
  );
}

function WalletPromptCardComp({ section, onAction }: ScreenComponentProps) {
  const actionKey = (section.props?.actionKey as string) ?? 'connect_wallet';
  return (
    <Card className="mb-4 p-4 border-purple-500/30 flex gap-3 items-center">
      <span className="text-3xl flex-shrink-0">👛</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-text-primary">Connect Wallet</div>
        <div className="text-[11px] text-text-secondary mt-0.5">
          {String(section.props?.message ?? 'Link your wallet to unlock NFT features.')}
        </div>
      </div>
      <button
        className="flex-shrink-0 bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white rounded-lg px-3 py-1.5 text-xs font-extrabold"
        onClick={() => onAction(actionKey)}
      >
        CONNECT
      </button>
    </Card>
  );
}

function GlobalBuffsSectionComp({ section }: ScreenComponentProps) {
  const rawMax = section.props?.maxItems;
  const maxItems = rawMax != null && rawMax !== '' ? Math.max(1, Number(rawMax)) : undefined;
  return <GlobalBuffsSection maxItems={maxItems} />;
}

function CraftingWorkshopsCardComp({ section }: ScreenComponentProps) {
  const navigate = useNavigate();
  const props = section.props ?? {};
  const title = String(props.title ?? '⚒️ THE FORGE');
  const path = String(props.path ?? '/crafting');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getCraftingWorkshops()
      .then((list) => { if (!cancelled) setCount(list.length); })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, []);

  if (count === 0) return null;

  return (
    <Card className="mb-4 p-4 border-orange-500/20">
      <SectionHeader title={title} />
      <div className="mt-2 flex items-center gap-2">
        {count != null && (
          <StatPill icon="🏭" value={`${count} workshop${count === 1 ? '' : 's'}`} />
        )}
      </div>
      <button
        className="mt-3 w-full bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-[#1a1640] rounded-lg p-2.5 text-sm font-extrabold tracking-wide cursor-pointer transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(245,158,11,0.4)]"
        onClick={() => navigate(path)}
      >
        GO TO WORKSHOPS
      </button>
    </Card>
  );
}

function SeasonProgressCardComp({ section }: ScreenComponentProps) {
  const activeSeason = useAppSelector((s: any) => s.sync.activeSeason);
  const now = useNow(60_000);
  const titleOverride = section.props?.title as string | undefined;

  if (!activeSeason) return null;
  const start = activeSeason.startsAt ? new Date(activeSeason.startsAt).getTime() : now;
  const end = activeSeason.endsAt ? new Date(activeSeason.endsAt).getTime() : now + 1;
  const total = end - start;
  const elapsed = now - start;
  const progress = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 0;
  const daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));

  const badgeClass =
    daysRemaining < 2
      ? 'bg-red-500/20 text-red-400'
      : daysRemaining < 7
      ? 'bg-amber-500/20 text-amber-400'
      : 'bg-green-500/20 text-green-400';

  const cardTitle = titleOverride ?? `🌟 ${(activeSeason.name ?? 'SEASON').toUpperCase()}`;

  return (
    <Card className="mb-4 p-4 border-amber-500/30">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title={cardTitle} className="mb-0" />
        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 ml-2 ${badgeClass}`}>
          {daysRemaining}d left
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-text-secondary">
        <span>Start</span>
        <span>{progress.toFixed(0)}% complete</span>
        <span>End</span>
      </div>
      <div className="flex gap-2 mt-3">
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5 border border-white/10">
          <span className="text-xs">🎁</span>
          <span className="text-[10px] text-text-secondary">Tier 1</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5 border border-white/10">
          <span className="text-xs">👑</span>
          <span className="text-[10px] text-text-secondary">Tier 2</span>
        </div>
      </div>
    </Card>
  );
}

function TimeUnit({
  value,
  label,
  urgent,
  warning,
}: {
  value: string;
  label: string;
  urgent: boolean;
  warning: boolean;
}) {
  const textClass = urgent ? 'text-red-400' : warning ? 'text-amber-400' : 'text-text-primary';
  return (
    <div className="flex flex-col items-center min-w-[2.5rem]">
      <span className={`text-2xl font-black tabular-nums leading-none ${textClass}`}>{value}</span>
      <span className="text-[9px] text-text-secondary tracking-widest mt-1 uppercase">{label}</span>
    </div>
  );
}

function EventCountdownCardComp({ section, onAction }: ScreenComponentProps) {
  const props = section.props ?? {};
  const endsAt = props.endsAt as string | undefined;
  const title = String(props.title ?? '⏰ EVENT');
  const actionKey = props.actionKey as string | undefined;
  const actionLabel = String(props.actionLabel ?? 'JOIN');

  const now = useNow(1000);

  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return null;

  const timeLeft = {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };

  const msLeft = diff;
  const isUrgent = msLeft < 3600000;
  const isWarning = msLeft < 86400000;

  const borderClass = isUrgent
    ? 'border-red-500/40'
    : isWarning
    ? 'border-amber-500/40'
    : 'border-derp-purple/30';
  const bgClass = isUrgent ? 'bg-red-500/5' : isWarning ? 'bg-amber-500/5' : '';

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <Card className={`mb-4 p-4 ${borderClass} ${bgClass}`}>
      <SectionHeader title={title} />
      {timeLeft && (
        <div className="mt-3 flex justify-center gap-4">
          {timeLeft.d > 0 && (
            <TimeUnit value={pad(timeLeft.d)} label="Days" urgent={isUrgent} warning={isWarning} />
          )}
          <TimeUnit value={pad(timeLeft.h)} label="Hrs" urgent={isUrgent} warning={isWarning} />
          <TimeUnit value={pad(timeLeft.m)} label="Min" urgent={isUrgent} warning={isWarning} />
          <TimeUnit value={pad(timeLeft.s)} label="Sec" urgent={isUrgent} warning={isWarning} />
        </div>
      )}
      {actionKey && (
        <button
          className="mt-4 w-full bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white rounded-lg p-2.5 text-sm font-extrabold tracking-wide cursor-pointer transition-all hover:-translate-y-px"
          onClick={() => onAction(actionKey)}
        >
          {actionLabel}
        </button>
      )}
    </Card>
  );
}

interface TelemetryEntryConfig {
  key: string;
  label: string;
  icon?: string;
  color?: string;
}

interface TelemetryCount {
  subEventKey: string;
  count: string;
  lastIncrementedAt: string | null;
}

interface TelemetryData {
  id: string;
  name: string;
  counts: TelemetryCount[];
}

function parseTelemetryCount(count: string): number {
  try {
    const n = Number(count);
    return isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

const _telemetryApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

export function TelemetryCardComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const defId = props.telemetryDefId as string | undefined;
  const displayType = (props.displayType as string) ?? 'number';
  const title = props.title as string | undefined;
  const pollSeconds = Math.max(5, Number(props.pollIntervalSeconds ?? 30));
  const metricKey = props.metricKey as string | undefined;
  const target = props.target != null ? Number(props.target) : undefined;
  const entries = Array.isArray(props.entries) ? (props.entries as TelemetryEntryConfig[]) : [];

  const [data, setData] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!defId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`${_telemetryApiBase}/telemetry/${defId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: TelemetryData = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load');
          setLoading(false);
        }
      }
    };

    poll();
    const id = setInterval(poll, pollSeconds * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [defId, pollSeconds]);

  if (!defId) return null;

  const cardTitle = title ?? data?.name ?? '📊 METRICS';

  if (loading) {
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title="📊 LOADING..." />
        <div className="mt-3 space-y-2">
          <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
          <div className="h-8 bg-white/10 rounded animate-pulse" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="mb-4 p-4 border-red-500/20">
        <SectionHeader title="📊 METRICS" />
        <div className="mt-2 text-[11px] text-red-400/70 text-center py-1">Unable to load — retrying</div>
      </Card>
    );
  }

  const getEntry = (key: string): TelemetryEntryConfig =>
    entries.find((e) => e.key === key) ?? { key, label: key };

  const getCount = (key: string): number => {
    const c = data.counts.find((c) => c.subEventKey === key);
    return c ? parseTelemetryCount(c.count) : 0;
  };

  if (displayType === 'number') {
    const targetKey = metricKey ?? data.counts[0]?.subEventKey;
    const count = targetKey ? getCount(targetKey) : 0;
    const entry = targetKey ? getEntry(targetKey) : null;
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={cardTitle} />
        <div className="mt-3 text-center py-2">
          {entry?.icon && <div className="text-3xl mb-2">{entry.icon}</div>}
          <div className="text-4xl font-black text-text-primary tabular-nums">
            {count.toLocaleString()}
          </div>
          {entry && (
            <div className="mt-1.5 text-[11px] text-text-secondary uppercase tracking-wider">
              {entry.label}
            </div>
          )}
        </div>
      </Card>
    );
  }

  if (displayType === 'progress_bar') {
    const targetKey = metricKey ?? data.counts[0]?.subEventKey;
    const count = targetKey ? getCount(targetKey) : 0;
    const entry = targetKey ? getEntry(targetKey) : null;
    const color = entry?.color ?? '#8b5cf6';
    const pct = target && target > 0 ? Math.min(100, (count / target) * 100) : 0;

    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={cardTitle} />
        {entry && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-text-secondary">
            {entry.icon && <span>{entry.icon}</span>}
            <span>{entry.label}</span>
          </div>
        )}
        <div className="mt-3 h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-text-secondary">
          <span>
            {count.toLocaleString()}
            {target ? ` / ${target.toLocaleString()}` : ''}
          </span>
          {target != null && (
            <span className="font-bold" style={{ color }}>
              {pct.toFixed(1)}%
            </span>
          )}
        </div>
      </Card>
    );
  }

  if (displayType === 'comparison') {
    const leftCfg =
      entries[0] ?? { key: data.counts[0]?.subEventKey ?? 'a', label: data.counts[0]?.subEventKey ?? 'A' };
    const rightCfg =
      entries[1] ?? { key: data.counts[1]?.subEventKey ?? 'b', label: data.counts[1]?.subEventKey ?? 'B' };
    const leftCount = getCount(leftCfg.key);
    const rightCount = getCount(rightCfg.key);
    const total = leftCount + rightCount;
    const leftPct = total > 0 ? (leftCount / total) * 100 : 50;
    const rightPct = total > 0 ? (rightCount / total) * 100 : 50;
    const leftColor = leftCfg.color ?? '#8b5cf6';
    const rightColor = rightCfg.color ?? '#f59e0b';
    const tied = total === 0 || leftCount === rightCount;

    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={cardTitle} />
        <div className="mt-3 flex justify-between items-center text-[11px] mb-2">
          <div className="flex items-center gap-1">
            {leftCfg.icon && <span>{leftCfg.icon}</span>}
            <span className="font-bold" style={{ color: leftColor }}>
              {leftCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold" style={{ color: rightColor }}>
              {rightCfg.label}
            </span>
            {rightCfg.icon && <span>{rightCfg.icon}</span>}
          </div>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden">
          {tied ? (
            <>
              <div className="flex-1" style={{ backgroundColor: leftColor + '50' }} />
              <div className="w-px bg-white/50 flex-shrink-0" />
              <div className="flex-1" style={{ backgroundColor: rightColor + '50' }} />
            </>
          ) : (
            <>
              <div
                className="transition-all duration-700"
                style={{ width: `${leftPct}%`, backgroundColor: leftColor }}
              />
              <div
                className="transition-all duration-700"
                style={{ width: `${rightPct}%`, backgroundColor: rightColor }}
              />
            </>
          )}
        </div>
        <div className="mt-2 flex justify-between items-center text-[13px] font-black tabular-nums">
          <span style={{ color: leftColor }}>{leftCount.toLocaleString()}</span>
          {tied && (
            <span className="text-[10px] text-text-secondary font-normal uppercase tracking-widest">
              TIED
            </span>
          )}
          <span style={{ color: rightColor }}>{rightCount.toLocaleString()}</span>
        </div>
      </Card>
    );
  }

  const ranked = [...data.counts]
    .map((c) => ({ ...c, parsed: parseTelemetryCount(c.count), entry: getEntry(c.subEventKey) }))
    .sort((a, b) => b.parsed - a.parsed);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <Card className="mb-4 p-4">
      <SectionHeader title={cardTitle} />
      <div className="mt-3 space-y-1">
        {ranked.length === 0 && (
          <div className="text-[11px] text-text-secondary text-center py-2">No data yet</div>
        )}
        {ranked.map(({ subEventKey, parsed, entry }, i) => (
          <div
            key={subEventKey}
            className={`flex items-center gap-2.5 px-2 py-2 rounded-lg ${
              i === 0 ? 'bg-white/5 border border-white/10' : ''
            }`}
          >
            <span className="text-base flex-shrink-0 w-6 text-center leading-none">
              {medals[i] ?? `#${i + 1}`}
            </span>
            {entry.icon && <span className="text-sm flex-shrink-0">{entry.icon}</span>}
            <span
              className="flex-1 text-[12px] font-bold text-text-primary truncate"
              style={entry.color ? { color: entry.color } : undefined}
            >
              {entry.label}
            </span>
            <span className="text-[13px] font-black tabular-nums text-text-primary">
              {parsed.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GenericStubComp({ section }: ScreenComponentProps) {
  if (import.meta.env.PROD) return null;
  return (
    <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 mb-4 text-center text-xs text-text-secondary">
      [{section.component}]
    </div>
  );
}

const ENTITY_STORAGE_KEY_FILTER = 'entities_activeFilter';
const ENTITY_STORAGE_KEY_SORT = 'entities_sortBy';
const ENTITY_STORAGE_KEY_SEARCH = 'entities_searchQuery';

function safeLocalGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeLocalSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function readEntityFilter(): EntityFilter {
  return (safeLocalGet(ENTITY_STORAGE_KEY_FILTER) ?? 'ALL') as EntityFilter;
}

function readEntitySort(): EntitySortBy {
  const v = safeLocalGet(ENTITY_STORAGE_KEY_SORT);
  if (v === 'name' || v === 'level' || v === 'power' || v === 'collection') return v;
  return 'name';
}

function EntityRosterComp(_: ScreenComponentProps) {
  const entities = useSyncEntities();
  const syncStatus = useSyncStatus();
  const [activeFilter, setActiveFilter] = useState<EntityFilter>(readEntityFilter);
  const [sortBy, setSortBy] = useState<EntitySortBy>(readEntitySort);
  const [searchQuery, setSearchQuery] = useState<string>(
    () => safeLocalGet(ENTITY_STORAGE_KEY_SEARCH) ?? '',
  );

  const validFilter = normalizeFilter(activeFilter, entities);

  if (syncStatus === 'disconnected') {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="entity-list__controls">
          <div className="skeleton" style={{ flex: 1, height: 34, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 90, height: 34, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 108, height: 34, borderRadius: 8 }} />
        </div>
        <div className="entity-list__grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  function handleFilterChange(filter: EntityFilter) {
    safeLocalSet(ENTITY_STORAGE_KEY_FILTER, filter);
    setActiveFilter(filter);
  }

  function handleSortChange(sort: EntitySortBy) {
    safeLocalSet(ENTITY_STORAGE_KEY_SORT, sort);
    setSortBy(sort);
  }

  function handleSearchChange(q: string) {
    safeLocalSet(ENTITY_STORAGE_KEY_SEARCH, q);
    setSearchQuery(q);
  }

  return (
    <EntityList
      entities={entities}
      mode="display"
      useCase="browse"
      showControls
      activeFilter={validFilter}
      onFilterChange={handleFilterChange}
      sortBy={sortBy}
      onSortChange={handleSortChange}
      search={searchQuery}
      onSearchChange={handleSearchChange}
      emptyMessage="No entities found."
    />
  );
}

function EntityDetailViewComp({ section }: ScreenComponentProps) {
  const { id: routeId } = useParams<{ id: string }>();

  // At runtime on /entities/:id the route param is present — delegate to the
  // full page component which handles navigation, rename menu, swipe, etc.
  if (routeId) {
    return <EntityDetailContent />;
  }

  // ── Admin preview context (no :id in URL) ────────────────────────────────
  // Use the optional entityId prop, otherwise fall back to the first entity in
  // the sync store so the preview panel always shows something meaningful.
  return <EntityDetailPreview section={section} onAction={() => {}} />;
}

function EntityDetailPreview({ section }: ScreenComponentProps) {
  const entities = useSyncEntities();
  const entityId = section.props?.entityId as string | undefined;

  const entity = entityId
    ? entities.find((e: any) => e.id === entityId)
    : entities[0];

  if (!entity) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="text-3xl opacity-40">🪶</span>
        <div className="text-[13px] font-bold text-text-secondary">No entity to preview</div>
        <div className="text-[11px] text-text-secondary/60 max-w-[220px] leading-relaxed">
          {entityId
            ? `Entity "${entityId}" not found in sync store.`
            : 'No entities loaded. Set an entityId prop or ensure the sync store is populated.'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {!entityId && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-400/80">
          <span>⚠️</span>
          <span>Preview — showing first entity. Set <code className="font-mono bg-black/20 px-1 rounded">entityId</code> prop to pin a specific entity.</span>
        </div>
      )}
      <EntityDetail entity={entity} variant="full" />
    </div>
  );
}

function makeStub(key: string): ScreenComponentType {
  return function StubComp({ section }: ScreenComponentProps) {
    if (import.meta.env.PROD) return null;
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 mb-4 text-center text-xs text-text-secondary">
        [{key}]
      </div>
    );
  };
}

function InventoryItemBrowserComp(_: ScreenComponentProps) {
  return <InventoryContent />;
}

function MissionBrowserComp(_: ScreenComponentProps) {
  return <MissionsContent />;
}

function LocationBrowserComp(_: ScreenComponentProps) {
  return <LocationsContent />;
}

function LocationDetailBrowserComp(_: ScreenComponentProps) {
  return <LocationDetailContent />;
}

function ForgeBrowserComp(_: ScreenComponentProps) {
  return <ForgeContent />;
}

function StoreBrowserComp(_: ScreenComponentProps) {
  return <StoreContent />;
}

function AchievementsBrowserComp(_: ScreenComponentProps) {
  return <AchievementsContent />;
}

function ProfileBrowserComp(_: ScreenComponentProps) {
  return <ProfileContent />;
}

function RewardsBrowserComp(_: ScreenComponentProps) {
  return <RewardsContent />;
}

function SettingsBrowserComp(_: ScreenComponentProps) {
  return <SettingsContent />;
}

// ─── Shop hooks ───────────────────────────────────────────────────────────────

interface _ShopItem {
  id: string;
  name: string;
  description?: string;
  tab: string;
  cost: Array<{ id: string; amount: number }>;
  contents: Array<{ id: string; amount: number }>;
  badge?: string;
  badgeColor?: string;
  imageUrl?: string;
  displayOrder?: number;
  limitedUntil?: string | null;
}

interface _GemPack {
  id: string;
  name?: string;
  gemAmount?: number;
  unitAmount?: number;
  currency?: string;
  displayName?: string;
  accentColor?: string;
  borderColor?: string;
  badgeLabel?: string;
}

const _shopApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

function _shopAuthHeaders(): Record<string, string> {
  try {
    const token =
      localStorage.getItem('jwtToken') ??
      localStorage.getItem('authToken') ??
      localStorage.getItem('token');
    if (token) return { Authorization: `Bearer ${token}` };
  } catch { /* ignore */ }
  return {};
}

function useShopItems(tab?: string) {
  const [items, setItems] = useState<_ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch(`${_shopApiBase}/shop/items`, { headers: _shopAuthHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: _ShopItem[]) => {
        if (!cancelled) setItems(tab ? data.filter(i => i.tab === tab) : data);
      })
      .catch(() => { /* swallow — show empty state */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab]);
  return { items, loading };
}

function useGemPacks() {
  const [packs, setPacks] = useState<_GemPack[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch(`${_shopApiBase}/shop/gem-packs`, { headers: _shopAuthHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: _GemPack[]) => { if (!cancelled) setPacks(data); })
      .catch(() => { /* swallow */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { packs, loading };
}

// ─── Countdown helper ─────────────────────────────────────────────────────────

function _fmtCountdown(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

// ─── Group A: Sync-store components ──────────────────────────────────────────

function FeaturedBirdCardComp({ section, onAction }: ScreenComponentProps) {
  const props = section.props ?? {};
  const entityId = props.entityId as string | undefined;
  const title = String(props.title ?? '🦜 FEATURED BIRD');
  const actionKey = props.actionKey as string | undefined;
  const navigate = useNavigate();
  const entities = useSyncEntities();

  const entity = entityId ? (entities as any[]).find((e: any) => e.id === entityId) : (entities as any[])[0];

  if (!entity) {
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={title} />
        <div className="mt-2 text-center py-3 text-text-secondary text-[11px]">No entity to feature</div>
      </Card>
    );
  }

  const e = entity as any;
  const name: string = e.name ?? e.defId ?? 'Unknown';
  const level: number = e.level ?? 1;
  const status: string = e.status ?? 'idle';
  const statusColor =
    status === 'idle' ? '#34d399' :
    status === 'working' || status === 'mission' ? '#60a5fa' :
    status === 'injured' ? '#f87171' : '#94a3b8';

  return (
    <Card
      className="mb-4 p-4 border-fuchsia-500/20 cursor-pointer active:scale-[0.99] transition-transform"
      onClick={() => { if (actionKey) { onAction(actionKey); } else { navigate(`/entities/${e.id}`); } }}
    >
      <SectionHeader title={title} className="mb-3" />
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-900 to-fuchsia-900 border border-fuchsia-500/30 flex items-center justify-center text-2xl flex-shrink-0 select-none">
          🦜
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-black text-text-primary truncate">{name}</div>
          <div className="text-[11px] text-text-secondary mt-0.5">Lv {level} · {e.defId ?? ''}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
            <span className="text-[10px] font-bold capitalize" style={{ color: statusColor }}>{status}</span>
          </div>
        </div>
        <span className="text-text-secondary/40 text-lg flex-shrink-0">›</span>
      </div>
    </Card>
  );
}

function MissionCategoryRailComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const maxItems = props.maxItems != null ? Number(props.maxItems) : undefined;
  const path = String(props.path ?? '/missions');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const missionCategoryDefs: any[] = useAppSelector((s: any) => s.game.missionCategoryDefs) ?? [];

  useEffect(() => { dispatch(fetchMissionCategoryDefs() as any); }, [dispatch]);

  const categories = maxItems != null ? missionCategoryDefs.slice(0, maxItems) : missionCategoryDefs;
  if (categories.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <button
          className="flex-shrink-0 px-3.5 py-1.5 rounded-full bg-derp-blue/20 border border-derp-blue/40 text-[11px] font-bold text-blue-300 whitespace-nowrap"
          onClick={() => navigate(path)}
        >
          All
        </button>
        {categories.map((cat: any) => (
          <button
            key={cat.id}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-text-secondary whitespace-nowrap hover:bg-white/10 transition-colors"
            onClick={() => navigate(`${path}?category=${cat.id}`)}
          >
            {cat.icon && <span className="text-xs">{cat.icon}</span>}
            {cat.name ?? cat.id}
          </button>
        ))}
      </div>
    </div>
  );
}

function CraftingQueuePreviewComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '⚒️ CRAFTING QUEUE');
  const limit = Number(props.limit ?? 5);
  const navigate = useNavigate();
  const now = useNow(1000);
  const activeCraftingJobs = useSyncActiveCraftingJobs();
  const craftingRecipes: any[] = useAppSelector((s: any) => s.game.craftingRecipes) ?? [];

  const jobs = (activeCraftingJobs as any[]).slice(0, limit);

  if (jobs.length === 0) {
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={title} />
        <div className="mt-2 text-center py-3">
          <div className="text-text-secondary text-[11px]">No active crafting jobs</div>
          <button
            className="mt-2 text-[11px] font-bold text-green-400 hover:underline"
            onClick={() => navigate('/crafting')}
          >
            Start crafting →
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4 p-4">
      <SectionHeader title={title} />
      <div className="mt-2 space-y-2">
        {jobs.map((job: any) => {
          const recipe = craftingRecipes.find((r: any) => r.id === (job.recipeId ?? job.defId));
          const recipeName: string = recipe?.name ?? job.recipeId ?? job.defId ?? 'Crafting…';
          const endsAt: number | null = job.endsAt ? new Date(job.endsAt).getTime() : null;
          const msLeft = endsAt ? Math.max(0, endsAt - now) : null;
          const isReady = job.status === 'ready_notified' || (msLeft !== null && msLeft <= 0);
          const timeLabel = isReady ? 'Ready!' : msLeft !== null ? _fmtCountdown(msLeft) : job.status ?? 'active';

          return (
            <div key={job.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
              <span className="text-base flex-shrink-0">⚒️</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-text-primary truncate">{recipeName}</div>
              </div>
              <span className={`text-[10px] font-bold flex-shrink-0 ${isReady ? 'text-green-400' : 'text-amber-400'}`}>
                {timeLabel}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RecipeCategoryRailComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const maxItems = props.maxItems != null ? Number(props.maxItems) : undefined;
  const path = String(props.path ?? '/crafting');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const craftingRecipes: any[] = useAppSelector((s: any) => s.game.craftingRecipes) ?? [];

  useEffect(() => { dispatch(fetchCraftingRecipes() as any); }, [dispatch]);

  const allCategories = Array.from(
    new Set(craftingRecipes.map((r: any) => r.category).filter(Boolean))
  ) as string[];
  const categories = maxItems != null ? allCategories.slice(0, maxItems) : allCategories;

  if (categories.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <button
          className="flex-shrink-0 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 whitespace-nowrap"
          onClick={() => navigate(path)}
        >
          All Recipes
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-text-secondary whitespace-nowrap hover:bg-white/10 transition-colors capitalize"
            onClick={() => navigate(`${path}?category=${cat}`)}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
}

function OutpostReadyListComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '📦 READY TO COLLECT');
  const limit = Number(props.limit ?? 5);
  const navigate = useNavigate();
  const locations = useSyncLocations() as any[];

  const readyLocations = locations
    .filter((loc: any) =>
      loc.productionReady === true ||
      (loc.productionBalance != null && Number(loc.productionBalance) > 0) ||
      loc.status === 'production_ready'
    )
    .slice(0, limit);

  if (readyLocations.length === 0) {
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={title} />
        <EmptyState message="No outposts ready to collect." className="py-3" />
      </Card>
    );
  }

  return (
    <Card className="mb-4 p-4">
      <SectionHeader title={title} />
      <div className="mt-2 space-y-2">
        {readyLocations.map((loc: any) => (
          <div
            key={loc.id}
            className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5 border border-white/10 cursor-pointer hover:bg-white/8 transition-colors"
            onClick={() => navigate('/outposts')}
          >
            <span className="text-base flex-shrink-0">🏭</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-text-primary truncate">
                {loc.name ?? loc.defId ?? loc.id}
              </div>
            </div>
            <span className="text-[10px] font-bold text-green-400 flex-shrink-0">COLLECT →</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OutpostSummaryCardsComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '🏠 MY OUTPOSTS');
  const limit = Number(props.limit ?? 6);
  const columns = Number(props.columns ?? 2);
  const navigate = useNavigate();
  const locations = useSyncLocations() as any[];

  const displayed = locations.slice(0, limit);

  if (displayed.length === 0) {
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={title} />
        <EmptyState message="No outposts yet" className="py-3" />
      </Card>
    );
  }

  const colClass = columns === 1 ? 'space-y-2' : 'grid grid-cols-2 gap-2';

  return (
    <Card className="mb-4 p-4">
      <SectionHeader title={title} />
      <div className={`mt-2 ${colClass}`}>
        {displayed.map((loc: any) => {
          const status: string = loc.status ?? 'active';
          const statusColor =
            status === 'active' ? '#34d399' :
            status === 'inactive' ? '#94a3b8' : '#60a5fa';
          return (
            <div
              key={loc.id}
              className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2 border border-white/10 cursor-pointer hover:bg-white/8 transition-colors"
              onClick={() => navigate('/outposts')}
            >
              <span className="text-sm flex-shrink-0">🏠</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-text-primary truncate">
                  {loc.name ?? loc.defId ?? loc.id}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                  <span className="text-[9px] capitalize" style={{ color: statusColor }}>{status}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const _INV_CATEGORIES: Array<{ label: string; icon: string; key: string }> = [
  { label: 'Weapons', icon: '⚔️', key: 'weapon' },
  { label: 'Armor', icon: '🛡️', key: 'armor' },
  { label: 'Consumables', icon: '🧪', key: 'consumable' },
  { label: 'Materials', icon: '🌿', key: 'material' },
  { label: 'Gems', icon: '💎', key: 'gem' },
  { label: 'All', icon: '📦', key: '' },
];

function InventoryCategoryGridComp(_: ScreenComponentProps) {
  const navigate = useNavigate();
  const items = useSyncItems() as any[];

  const countForKey = (key: string): number => {
    if (!key) return items.length;
    return items.filter((item: any) => {
      const t = (item.type ?? item.category ?? '').toLowerCase();
      return t === key || t.startsWith(key);
    }).reduce((s: number, item: any) => s + (Number(item.quantity) || 1), 0);
  };

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {_INV_CATEGORIES.map(({ label, icon, key }) => {
        const count = countForKey(key);
        return (
          <button
            key={label}
            className="flex flex-col items-center gap-1.5 bg-bg-card rounded-xl px-3 py-3 border border-white/10 hover:bg-white/8 transition-colors"
            onClick={() => navigate(key ? `/inventory?category=${key}` : '/inventory')}
          >
            <span className="text-xl">{icon}</span>
            <div className="text-[9px] font-bold text-text-secondary uppercase tracking-wide text-center truncate w-full">
              {label}
            </div>
            <div className="text-[10px] font-black text-text-primary">{count}</div>
          </button>
        );
      })}
    </div>
  );
}

function NFTCapacityInfoCardComp(_: ScreenComponentProps) {
  const navigate = useNavigate();
  const entities = useSyncEntities() as any[];

  const nftEntities = entities.filter((e: any) => isNftEntity(e));
  const nftCount = nftEntities.length;
  const total = entities.length;
  const cap = total || 1;
  const pct = Math.min(100, (nftCount / cap) * 100);
  const barColor = pct >= 90 ? '#f87171' : '#fbbf24';

  return (
    <Card className="mb-4 p-4 border-amber-500/20">
      <SectionHeader title="💎 NFT CAPACITY" className="mb-3" />
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="text-text-secondary">NFT Entities</span>
        <span className="font-bold text-text-primary">{nftCount} / {total}</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="mt-2 text-[10px] text-text-secondary">
        {nftCount === 0
          ? 'No NFT entities yet — link your wallet to import them.'
          : `${nftCount} NFT ${nftCount === 1 ? 'entity' : 'entities'} imported.`}
      </div>
      <button
        className="mt-3 w-full rounded-lg py-1.5 text-[11px] font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
        onClick={() => navigate('/wallet')}
      >
        {nftCount > 0 ? 'VIEW WALLET' : 'CONNECT WALLET'}
      </button>
    </Card>
  );
}

// ─── Group B: Shop API components ────────────────────────────────────────────

function _ShopLoadingCard({ title }: { title: string }) {
  return (
    <Card className="mb-4 p-4">
      <SectionHeader title={title} />
      <div className="mt-3 space-y-2">
        <div className="h-14 bg-white/5 rounded-lg animate-pulse" />
        <div className="h-14 bg-white/5 rounded-lg animate-pulse" />
      </div>
    </Card>
  );
}

function StoreOfferCardComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '🔥 FEATURED OFFER');
  const offerId = props.offerId as string | undefined;
  const navigate = useNavigate();
  const { items, loading } = useShopItems('featured');

  if (loading) return <_ShopLoadingCard title={title} />;

  const item = offerId ? items.find(i => i.id === offerId) : (items.find(i => i.badge) ?? items[0]);
  if (!item) {
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={title} />
        <EmptyState message="No featured offers right now" className="py-3" />
      </Card>
    );
  }

  const accent = item.badgeColor ?? '#fbbf24';
  return (
    <Card
      className="mb-4 overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
      style={{ borderTop: `2px solid ${accent}` } as React.CSSProperties}
      onClick={() => navigate('/store')}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <SectionHeader title={title} className="mb-0" />
          {item.badge && (
            <span
              className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
              style={{ background: accent, color: '#000' }}
            >
              {item.badge}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl border border-white/10"
            style={{ background: `${accent}22` }}
          >
            🎁
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-black text-text-primary truncate">{item.name}</div>
            {item.description && (
              <div className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">{item.description}</div>
            )}
            {item.limitedUntil && (
              <div className="text-[10px] text-amber-400 font-bold mt-1">⏱ Limited time</div>
            )}
          </div>
        </div>
        <button
          className="mt-3 w-full rounded-lg py-2 text-[12px] font-bold transition-colors"
          style={{ background: `${accent}22`, border: `1px solid ${accent}55`, color: accent }}
          onClick={(e) => { e.stopPropagation(); navigate('/store'); }}
        >
          VIEW IN STORE
        </button>
      </div>
    </Card>
  );
}

function _MiniShopCard({ item, onClick }: { item: _ShopItem; onClick: () => void }) {
  const accent = item.badgeColor ?? '#fbbf24';
  return (
    <div
      className="flex-shrink-0 w-36 bg-bg-card rounded-xl border border-white/10 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      style={{ borderTop: `2px solid ${accent}` }}
      onClick={onClick}
    >
      <div className="p-3">
        {item.badge && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full mb-1.5 inline-block" style={{ background: accent, color: '#000' }}>
            {item.badge}
          </span>
        )}
        <div className="text-[12px] font-black text-text-primary line-clamp-2">{item.name}</div>
        {item.description && (
          <div className="text-[10px] text-text-secondary mt-0.5 line-clamp-1">{item.description}</div>
        )}
      </div>
    </div>
  );
}

function StoreOfferCarouselComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = props.title as string | undefined;
  const tab = props.tab as string | undefined;
  const limit = Number(props.limit ?? 6);
  const navigate = useNavigate();
  const { items, loading } = useShopItems(tab);

  if (loading) return title ? <_ShopLoadingCard title={title} /> : <div className="h-24 bg-white/5 rounded-xl animate-pulse mb-4" />;

  const displayed = items.slice(0, limit);
  if (displayed.length === 0) return null;

  return (
    <div className="mb-4">
      {title && <SectionHeader title={title} className="mb-2" />}
      <div className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {displayed.map(item => (
          <_MiniShopCard key={item.id} item={item} onClick={() => navigate('/store')} />
        ))}
      </div>
    </div>
  );
}

function StoreItemGridComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = props.title as string | undefined;
  const tab = props.tab as string | undefined;
  const limit = Number(props.limit ?? 6);
  const columns = Number(props.columns ?? 2);
  const navigate = useNavigate();
  const { items, loading } = useShopItems(tab);

  if (loading) return title ? <_ShopLoadingCard title={title} /> : null;

  const displayed = items.slice(0, limit);
  if (displayed.length === 0) return null;

  const colClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="mb-4">
      {title && <SectionHeader title={title} className="mb-2" />}
      <div className={`grid ${colClass} gap-3`}>
        {displayed.map(item => {
          const accent = item.badgeColor ?? '#fbbf24';
          return (
            <div
              key={item.id}
              className="bg-bg-card rounded-xl border border-white/10 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform p-3"
              style={{ borderTop: `2px solid ${accent}` }}
              onClick={() => navigate('/store')}
            >
              {item.badge && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full mb-1.5 inline-block" style={{ background: accent, color: '#000' }}>
                  {item.badge}
                </span>
              )}
              <div className="text-[12px] font-black text-text-primary line-clamp-2">{item.name}</div>
              {item.description && (
                <div className="text-[10px] text-text-secondary mt-0.5 line-clamp-1">{item.description}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StoreItemRailComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = props.title as string | undefined;
  const tab = props.tab as string | undefined;
  const limit = Number(props.limit ?? 5);
  const navigate = useNavigate();
  const { items, loading } = useShopItems(tab);

  if (loading || items.length === 0) return null;

  const displayed = items.slice(0, limit);

  return (
    <div className="mb-4">
      {title && <SectionHeader title={title} className="mb-2" />}
      <div className="flex gap-2.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {displayed.map(item => {
          const accent = item.badgeColor ?? '#fbbf24';
          return (
            <div
              key={item.id}
              className="flex-shrink-0 bg-bg-card rounded-xl border border-white/10 p-2.5 cursor-pointer active:scale-[0.98] transition-transform"
              style={{ borderTop: `2px solid ${accent}`, minWidth: 100 }}
              onClick={() => navigate('/store')}
            >
              <div className="text-[11px] font-black text-text-primary line-clamp-2">{item.name}</div>
              {item.badge && (
                <div className="text-[9px] font-bold mt-0.5" style={{ color: accent }}>{item.badge}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeaturedShopRailComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '⭐ FEATURED');
  const limit = Number(props.limit ?? 3);
  const navigate = useNavigate();
  const { items, loading } = useShopItems();

  if (loading) return <_ShopLoadingCard title={title} />;

  const featured = items.filter(i => i.badge || i.limitedUntil).slice(0, limit);
  if (featured.length === 0) return null;

  return (
    <div className="mb-4">
      <SectionHeader title={title} className="mb-2" />
      <div className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {featured.map(item => {
          const accent = item.badgeColor ?? '#f59e0b';
          return (
            <div
              key={item.id}
              className="flex-shrink-0 w-40 rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
              style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}08)`, border: `1px solid ${accent}44` }}
              onClick={() => navigate('/store')}
            >
              <div className="p-3">
                {item.badge && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full mb-2 inline-block" style={{ background: accent, color: '#000' }}>
                    {item.badge}
                  </span>
                )}
                <div className="text-[13px] font-black text-text-primary line-clamp-2">{item.name}</div>
                {item.limitedUntil && (
                  <div className="text-[9px] text-amber-400 font-bold mt-1.5">⏱ Limited</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GemPackGridComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '💎 GEM PACKS');
  const limit = Number(props.limit ?? 6);
  const navigate = useNavigate();
  const { packs, loading } = useGemPacks();

  if (loading) return <_ShopLoadingCard title={title} />;

  const displayed = packs.slice(0, limit);
  if (displayed.length === 0) {
    return (
      <Card className="mb-4 p-4">
        <SectionHeader title={title} />
        <EmptyState message="No gem packs available" className="py-3" />
      </Card>
    );
  }

  return (
    <Card className="mb-4 p-4">
      <SectionHeader title={title} className="mb-3" />
      <div className="grid grid-cols-2 gap-3">
        {displayed.map(pack => {
          const accent = pack.accentColor ?? '#fbbf24';
          const gemLabel = pack.gemAmount != null ? `${pack.gemAmount.toLocaleString()} 💎` : pack.name ?? 'Gem Pack';
          const priceLabel = pack.unitAmount != null
            ? `${pack.currency === 'USD' ? '$' : ''}${pack.unitAmount}`
            : null;
          return (
            <div
              key={pack.id}
              className="rounded-xl p-3 cursor-pointer active:scale-[0.98] transition-transform text-center"
              style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}08)`, border: `1px solid ${pack.borderColor ?? accent}66` }}
              onClick={() => navigate('/store')}
            >
              {pack.badgeLabel && (
                <div className="text-[9px] font-black px-1.5 py-0.5 rounded-full mb-1.5 inline-block" style={{ background: accent, color: '#000' }}>
                  {pack.badgeLabel}
                </div>
              )}
              <div className="text-[18px] font-black mb-1" style={{ color: accent }}>{gemLabel}</div>
              {priceLabel && <div className="text-[11px] text-text-secondary">{priceLabel}</div>}
              <div className="mt-2 rounded-lg py-1.5 text-[10px] font-black" style={{ background: `${accent}33`, color: accent }}>
                BUY
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Group C: Static / configurable props components ─────────────────────────

function NewsCardComp({ section }: ScreenComponentProps) {
  const navigate = useNavigate();
  const props = section.props ?? {};
  const headline = props.headline as string | undefined;
  const body = props.body as string | undefined;
  const timestamp = props.timestamp as string | undefined;
  const emoji = String(props.emoji ?? '📰');
  const href = props.href as string | undefined;

  if (!headline) {
    return (
      <Card className="mb-4 p-4 border-fuchsia-500/20">
        <div className="flex items-center gap-3 py-2 text-text-secondary/60">
          <span className="text-2xl">📰</span>
          <div className="text-[12px]">No headline configured — add a <code className="text-fuchsia-400">headline</code> prop.</div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4 p-4 border-fuchsia-500/20">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0 select-none">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-black text-text-primary mb-1 leading-snug">{headline}</div>
          {body && <div className="text-[12px] text-text-secondary leading-relaxed">{body}</div>}
          <div className="flex items-center justify-between mt-3">
            {timestamp ? <span className="text-[10px] text-text-secondary/60">{timestamp}</span> : <span />}
            {href && (
              <button
                className="text-[11px] font-bold text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                onClick={() => navigate(href)}
              >
                READ MORE →
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

interface _AnnouncementEntry {
  headline: string;
  body?: string;
  emoji?: string;
}

function AnnouncementFeedComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '📢 ANNOUNCEMENTS');
  const limit = props.limit != null ? Number(props.limit) : undefined;
  const rawEntries = Array.isArray(props.entries) ? (props.entries as _AnnouncementEntry[]) : [];
  const entries = limit != null ? rawEntries.slice(0, limit) : rawEntries;

  return (
    <Card className="mb-4 p-4">
      <SectionHeader title={title} />
      {entries.length === 0 ? (
        <EmptyState message="No announcements" className="py-3" />
      ) : (
        <div className="mt-2 space-y-3">
          {entries.map((entry, i) => (
            <div key={i} className={i < entries.length - 1 ? 'pb-3 border-b border-white/10' : ''}>
              <div className="flex items-start gap-2">
                {entry.emoji && <span className="text-base flex-shrink-0">{entry.emoji}</span>}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-black text-text-primary">{entry.headline}</div>
                  {entry.body && <div className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{entry.body}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BattlePassProgressComp({ section }: ScreenComponentProps) {
  const navigate = useNavigate();
  const props = section.props ?? {};
  const tierLabel = props.tierLabel as string | undefined;
  const currentXP = Number(props.currentXP ?? 0);
  const maxXP = Number(props.maxXP ?? 1000);
  const nextRewardEmoji = props.nextRewardEmoji as string | undefined;
  const href = String(props.href ?? '/store');

  if (!tierLabel) {
    return (
      <Card className="mb-4 p-4 border-blue-500/20">
        <div className="flex items-center gap-3 py-2 text-text-secondary/60">
          <span className="text-2xl">🎖️</span>
          <div className="text-[12px]">Battle Pass coming soon</div>
        </div>
      </Card>
    );
  }

  const pct = maxXP > 0 ? Math.min(100, (currentXP / maxXP) * 100) : 0;

  return (
    <Card className="mb-4 p-4 border-blue-500/20">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title="🎖️ BATTLE PASS" className="mb-0" />
        <span className="text-[10px] font-bold text-blue-400 bg-blue-500/15 border border-blue-500/30 rounded-full px-2 py-0.5 flex-shrink-0 ml-2">
          {tierLabel}
        </span>
      </div>
      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-text-secondary">
        <span>{currentXP.toLocaleString()} XP</span>
        <span>{maxXP.toLocaleString()} XP</span>
      </div>
      {nextRewardEmoji && (
        <div className="mt-3 flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
          <span className="text-sm">{nextRewardEmoji}</span>
          <div className="text-[11px] text-text-secondary">
            Next reward
          </div>
        </div>
      )}
      <button
        className="mt-3 w-full rounded-lg py-1.5 text-[11px] font-bold text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
        onClick={() => navigate(href)}
      >
        VIEW BATTLE PASS
      </button>
    </Card>
  );
}

interface _BpTier {
  tier: number;
  label: string;
  reward: string;
  unlocked: boolean;
}

function BattlePassTierListComp({ section }: ScreenComponentProps) {
  const props = section.props ?? {};
  const title = String(props.title ?? '🎖️ BATTLE PASS TIERS');
  const limit = props.limit != null ? Number(props.limit) : undefined;
  const rawTiers = Array.isArray(props.tiers) ? (props.tiers as _BpTier[]) : [];
  const tiers = limit != null ? rawTiers.slice(0, limit) : rawTiers;

  return (
    <Card className="mb-4 p-4">
      <SectionHeader title={title} />
      {tiers.length === 0 ? (
        <EmptyState message="No tiers configured" className="py-3" />
      ) : (
        <div className="mt-2 space-y-1.5">
          {tiers.map((t) => (
            <div
              key={t.tier}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${t.unlocked ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0 ${t.unlocked ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-text-secondary'}`}
              >
                {t.unlocked ? '✓' : '🔒'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-text-primary">{t.label}</div>
                <div className="text-[10px] text-text-secondary truncate">{t.reward}</div>
              </div>
              <span className="text-[9px] font-bold text-text-secondary/50 flex-shrink-0">T{t.tier}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

interface _EventCarouselItem {
  title: string;
  emoji: string;
  endsAt?: string;
  href?: string;
}

interface _EventCardItem {
  title: string;
  emoji: string;
  description?: string;
  endsAt?: string;
  href?: string;
}

function EventCarouselComp({ section }: ScreenComponentProps) {
  const navigate = useNavigate();
  const props = section.props ?? {};
  const title = props.title as string | undefined;
  const limit = props.limit != null ? Number(props.limit) : 4;
  const rawEvents = Array.isArray(props.events) ? (props.events as _EventCarouselItem[]) : [];
  const events = rawEvents.slice(0, limit);
  const now = useNow(60000);

  if (events.length === 0) {
    return (
      <div className="mb-4">
        {title && <SectionHeader title={title} className="mb-2" />}
        <Card className="p-4">
          <EmptyState message="No active events" className="py-2" />
        </Card>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {title && <SectionHeader title={title} className="mb-2" />}
      <div className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {events.map((ev, i) => {
          const msLeft = ev.endsAt ? new Date(ev.endsAt).getTime() - now : null;
          const expired = msLeft !== null && msLeft <= 0;
          return (
            <div
              key={i}
              className={`flex-shrink-0 w-40 rounded-xl border cursor-pointer active:scale-[0.98] transition-transform ${expired ? 'border-white/10 opacity-60' : 'border-purple-500/30'}`}
              style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(30,27,75,0.8))' }}
              onClick={() => ev.href && navigate(ev.href)}
            >
              <div className="p-3 text-center">
                <div className="text-3xl mb-1 select-none">{ev.emoji}</div>
                <div className="text-[12px] font-black text-text-primary line-clamp-2">{ev.title}</div>
                {msLeft !== null && !expired && (
                  <div className="text-[9px] text-amber-400 font-bold mt-1">⏱ {_fmtCountdown(msLeft)}</div>
                )}
                {expired && <div className="text-[9px] text-text-secondary mt-1">Ended</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCardListComp({ section }: ScreenComponentProps) {
  const navigate = useNavigate();
  const props = section.props ?? {};
  const title = String(props.title ?? '🎪 EVENTS');
  const limit = props.limit != null ? Number(props.limit) : undefined;
  const rawEvents = Array.isArray(props.events) ? (props.events as _EventCardItem[]) : [];
  const events = limit != null ? rawEvents.slice(0, limit) : rawEvents;
  const now = useNow(60000);

  return (
    <div className="mb-4">
      <SectionHeader title={title} className="mb-2" />
      {events.length === 0 ? (
        <Card className="p-4">
          <EmptyState message="No events running." className="py-2" />
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((ev, i) => {
            const msLeft = ev.endsAt ? new Date(ev.endsAt).getTime() - now : null;
            const expired = msLeft !== null && msLeft <= 0;
            return (
              <Card
                key={i}
                className={`p-4 border-purple-500/20 cursor-pointer active:scale-[0.99] transition-transform ${expired ? 'opacity-60' : ''}`}
                onClick={() => ev.href && navigate(ev.href)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0 select-none">{ev.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-black text-text-primary">{ev.title}</div>
                    {ev.description && (
                      <div className="text-[12px] text-text-secondary mt-1 leading-relaxed">{ev.description}</div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      {msLeft !== null && !expired
                        ? <span className="text-[10px] text-amber-400 font-bold">⏱ {_fmtCountdown(msLeft)}</span>
                        : expired
                        ? <span className="text-[10px] text-text-secondary">Ended</span>
                        : <span />
                      }
                      {ev.href && !expired && (
                        <span className="text-[11px] font-bold text-purple-400">JOIN →</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeasonBossPanelComp({ section }: ScreenComponentProps) {
  const navigate = useNavigate();
  const props = section.props ?? {};
  const bossName = props.bossName as string | undefined;
  const bossEmoji = String(props.bossEmoji ?? '👹');
  const hpCurrent = Number(props.hpCurrent ?? 0);
  const hpMax = Number(props.hpMax ?? 1);
  const href = String(props.href ?? '/');

  if (!bossName) {
    return (
      <Card className="mb-4 p-4 border-red-500/30">
        <div className="flex items-center gap-3 py-2 text-text-secondary/60">
          <span className="text-2xl">👹</span>
          <div className="text-[12px]">Season Boss coming soon</div>
        </div>
      </Card>
    );
  }

  const pct = hpMax > 0 ? Math.min(100, (hpCurrent / hpMax) * 100) : 0;
  const hpColor = pct > 60 ? '#ef4444' : pct > 30 ? '#f97316' : '#fbbf24';

  return (
    <Card className="mb-4 p-4 border-red-500/30">
      <SectionHeader title="👹 SEASON BOSS" className="mb-3" />
      <div className="text-center mb-4">
        <div className="text-5xl mb-2 select-none">{bossEmoji}</div>
        <div className="text-[16px] font-black text-text-primary">{bossName}</div>
      </div>
      <div className="mb-1.5">
        <div className="flex justify-between text-[10px] text-text-secondary mb-1">
          <span>HP</span>
          <span className="font-bold">{hpCurrent.toLocaleString()} / {hpMax.toLocaleString()}</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: hpColor }}
          />
        </div>
      </div>
      <button
        className="mt-4 w-full bg-gradient-to-br from-red-600 to-red-700 text-white rounded-lg p-2.5 text-sm font-extrabold tracking-wide cursor-pointer transition-all hover:-translate-y-px"
        onClick={() => navigate(href)}
      >
        ENGAGE
      </button>
    </Card>
  );
}

export const COMPONENT_REGISTRY: Record<string, ScreenComponentType> = {
  BannerCarousel: BannerCarouselComp,
  SeasonBanner: SeasonBannerComp,
  ResourceSummaryBar: ResourceSummaryBarComp,
  GlobalBuffsSection: GlobalBuffsSectionComp,
  CraftingWorkshopsCard: CraftingWorkshopsCardComp,
  QuickStatusCards: QuickStatusCardsComp,
  DailyQuestPanel: DailyQuestPanelComp,
  MissionFeaturedCard: MissionFeaturedCardComp,
  ActiveMissionList: ActiveMissionListComp,
  EmptyStateCard: EmptyStateCardComp,
  HelpTipCard: HelpTipCardComp,
  CTAButtonGroup: CTAButtonGroupComp,
  SkeletonCard: SkeletonCardComp,
  DailyCheckInCard: DailyCheckInCardComp,
  PatchNotesCard: PatchNotesCardComp,
  WalletPromptCard: WalletPromptCardComp,
  SeasonProgressCard: SeasonProgressCardComp,
  EventCountdownCard: EventCountdownCardComp,
  TelemetryCard: TelemetryCardComp,
  StoreOfferCard: StoreOfferCardComp,
  StoreOfferCarousel: StoreOfferCarouselComp,
  StoreItemGrid: StoreItemGridComp,
  StoreItemRail: StoreItemRailComp,
  BattlePassProgress: BattlePassProgressComp,
  BattlePassTierList: BattlePassTierListComp,
  EventCarousel: EventCarouselComp,
  EventCardList: EventCardListComp,
  SeasonBossPanel: SeasonBossPanelComp,
  NewsCard: NewsCardComp,
  AnnouncementFeed: AnnouncementFeedComp,
  MissionCategoryRail: MissionCategoryRailComp,
  CraftingQueuePreview: CraftingQueuePreviewComp,
  RecipeCategoryRail: RecipeCategoryRailComp,
  OutpostReadyList: OutpostReadyListComp,
  OutpostSummaryCards: OutpostSummaryCardsComp,
  InventoryCategoryGrid: InventoryCategoryGridComp,
  NFTCapacityInfoCard: NFTCapacityInfoCardComp,
  FeaturedBirdCard: FeaturedBirdCardComp,
  FeaturedShopRail: FeaturedShopRailComp,
  GemPackGrid: GemPackGridComp,
  EntityRoster: EntityRosterComp,
  EntityDetailView: EntityDetailViewComp,
  InventoryItemBrowser: InventoryItemBrowserComp,
  MissionBrowser: MissionBrowserComp,
  LocationBrowser: LocationBrowserComp,
  LocationDetailBrowser: LocationDetailBrowserComp,
  ForgeBrowser: ForgeBrowserComp,
  StoreBrowser: StoreBrowserComp,
  AchievementsBrowser: AchievementsBrowserComp,
  ProfileBrowser: ProfileBrowserComp,
  RewardsBrowser: RewardsBrowserComp,
  SettingsBrowser: SettingsBrowserComp,
};
