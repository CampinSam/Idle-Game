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
} from '../../hooks/useSyncSelectors';
import { useAppSelector, useAppDispatch } from '../../store';
import { fetchMissionDefs } from '../../store/gameSlice';
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

  const idleCount = entities.filter((e: any) => e.status === 'idle').length;
  const missionJobs = allJobs.filter((j: any) => j.type === 'MissionJob').length;

  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      <QuickCard
        icon="🪶"
        label="Entities"
        value={entities.length}
        sub={`${idleCount} idle`}
        onClick={() => navigate('/entities')}
      />
      <QuickCard
        icon="🏠"
        label="Outposts"
        value={locations.length}
        onClick={() => navigate('/locations')}
      />
      <QuickCard
        icon="🗺️"
        label="Missions"
        value={missionJobs}
        onClick={() => navigate('/missions')}
      />
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
  return (
    <Card className="mb-4 p-4 border-amber-500/20">
      <SectionHeader title="📋 DAILY QUESTS" />
      <div className="mt-3 text-[12px] text-text-secondary text-center py-2">
        Daily quests coming soon — check back each day for challenges!
      </div>
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
    : missionDefs.find((d: any) => missionJobs.some((j: any) => j.missionDefId === d.id))
      ?? missionDefs[0];

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
  const limit = Math.max(1, Number(section.props?.limit ?? 5));

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
          {missionJobs.slice(0, limit).map((j: any) => (
            <div key={j.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span>🗺️</span>
              <span className="flex-1 text-text-primary truncate">{j.name}</span>
            </div>
          ))}
          {missionJobs.length > limit && (
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

function GlobalBuffsSectionComp(_: ScreenComponentProps) {
  return <GlobalBuffsSection />;
}

function CraftingWorkshopsCardComp(_: ScreenComponentProps) {
  const navigate = useNavigate();
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
      <SectionHeader title="⚒️ THE FORGE" />
      <div className="mt-2 flex items-center gap-2">
        {count != null && (
          <StatPill icon="🏭" value={`${count} workshop${count === 1 ? '' : 's'}`} />
        )}
      </div>
      <button
        className="mt-3 w-full bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-[#1a1640] rounded-lg p-2.5 text-sm font-extrabold tracking-wide cursor-pointer transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(245,158,11,0.4)]"
        onClick={() => navigate('/crafting')}
      >
        GO TO WORKSHOPS
      </button>
    </Card>
  );
}

function SeasonProgressCardComp(_: ScreenComponentProps) {
  const activeSeason = useAppSelector((s: any) => s.sync.activeSeason);
  const now = useNow(60_000);

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

  return (
    <Card className="mb-4 p-4 border-amber-500/30">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title={`🌟 ${(activeSeason.name ?? 'SEASON').toUpperCase()}`} className="mb-0" />
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
  StoreOfferCard: makeStub('StoreOfferCard'),
  StoreOfferCarousel: makeStub('StoreOfferCarousel'),
  StoreItemGrid: makeStub('StoreItemGrid'),
  StoreItemRail: makeStub('StoreItemRail'),
  BattlePassProgress: makeStub('BattlePassProgress'),
  BattlePassTierList: makeStub('BattlePassTierList'),
  EventCarousel: makeStub('EventCarousel'),
  EventCardList: makeStub('EventCardList'),
  SeasonBossPanel: makeStub('SeasonBossPanel'),
  NewsCard: makeStub('NewsCard'),
  AnnouncementFeed: makeStub('AnnouncementFeed'),
  MissionCategoryRail: makeStub('MissionCategoryRail'),
  CraftingQueuePreview: makeStub('CraftingQueuePreview'),
  RecipeCategoryRail: makeStub('RecipeCategoryRail'),
  OutpostReadyList: makeStub('OutpostReadyList'),
  OutpostSummaryCards: makeStub('OutpostSummaryCards'),
  InventoryCategoryGrid: makeStub('InventoryCategoryGrid'),
  NFTCapacityInfoCard: makeStub('NFTCapacityInfoCard'),
  FeaturedBirdCard: makeStub('FeaturedBirdCard'),
  FeaturedShopRail: makeStub('FeaturedShopRail'),
  GemPackGrid: makeStub('GemPackGrid'),
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
