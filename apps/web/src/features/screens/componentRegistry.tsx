import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScreenSectionDefinition } from '@derp/shared';
import {
  useSyncEntities,
  useSyncLocations,
  useSyncCurrencyBalances,
  useAllActiveJobs,
} from '../../hooks/useSyncSelectors';
import { useAppSelector } from '../../store';
import { Card, SectionHeader, EmptyState, StatPill } from '../../components/ui';
import { BannerCarousel } from '../home/BannerCarousel';
import { GlobalBuffsSection } from '../home/GlobalBuffsSection';
import { api } from '../../services/api';

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

function MissionFeaturedCardComp({ section, onAction }: ScreenComponentProps) {
  const navigate = useNavigate();
  const allJobs = useAllActiveJobs();
  const missionJobs = allJobs.filter((j: any) => j.type === 'MissionJob');
  const readyCount = missionJobs.filter((j: any) => {
    if (j.startTick == null || j.durationTicks == null) return false;
    return false;
  }).length;

  return (
    <Card className="mb-4 p-4">
      <SectionHeader title="🗺️ MISSIONS" />
      <div className="mt-3 flex gap-2 flex-wrap">
        <StatPill icon="⏳" value={`${missionJobs.length} Active`} />
      </div>
      <button
        className="mt-3 w-full bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white rounded-lg p-2.5 text-sm font-extrabold tracking-wide cursor-pointer transition-all hover:-translate-y-px"
        onClick={() => navigate('/missions')}
      >
        VIEW MISSIONS
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
          {missionJobs.slice(0, 5).map((j: any) => (
            <div key={j.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span>🗺️</span>
              <span className="flex-1 text-text-primary truncate">{j.name}</span>
            </div>
          ))}
          {missionJobs.length > 5 && (
            <div className="text-[11px] text-text-secondary pt-1">
              +{missionJobs.length - 5} more
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

function GenericStubComp({ section }: ScreenComponentProps) {
  if (import.meta.env.PROD) return null;
  return (
    <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 mb-4 text-center text-xs text-text-secondary">
      [{section.component}]
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
};
