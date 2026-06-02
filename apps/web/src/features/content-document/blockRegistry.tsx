import { useRef, useState } from 'react';
import type { ContentBlock, RewardItem } from '@derp/shared';
import { MissionHeroPanel } from '../missions/components/panels/MissionHeroPanel';
import { MissionStatsPanel } from '../missions/components/panels/MissionStatsPanel';
import { MissionSynergyPanel } from '../missions/components/panels/MissionSynergyPanel';
import { MissionRequirementsBlock } from '../missions/components/panels/MissionRequirementsBlock';
import { RosterCard } from '../entities/components';
import BlockRenderer from '../../components/modal/blocks/BlockRenderer';
import RewardsListBlock from '../../components/modal/blocks/RewardsListBlock';
import { useSurfaceContext } from './SurfaceContext';
import type { ModalBlock } from '@derp/shared';

export interface BlockComponentProps {
  block: ContentBlock;
}

// ─── Shared style constants ───────────────────────────────────────────────────

const PANEL_CLASS = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
const PANEL_TITLE_CLASS = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';

// ─── mission_hero ─────────────────────────────────────────────────────────────

function MissionHeroBlock(_: BlockComponentProps) {
  const { data } = useSurfaceContext();
  const { def, currentCat, missionCategoryDefs = [], onBack, hasLeadIn, openLeadIn } = data;
  if (!def) return null;
  return (
    <div className="-mx-4 -mt-3">
      <MissionHeroPanel
        def={def}
        currentCat={currentCat}
        missionCategoryDefs={missionCategoryDefs}
        onBack={onBack}
      />
      {def.description && (
        <p className="m-0 px-4 pt-2.5 text-[13px] leading-relaxed text-text-secondary">
          {def.description}
        </p>
      )}
      {hasLeadIn && (
        <div className="px-4 pt-2">
          <button
            onClick={openLeadIn}
            className="w-full px-3 py-1.5 rounded-xl text-[rgba(167,139,250,0.9)] border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.08)] hover:bg-[rgba(139,92,246,0.15)] cursor-pointer text-[12px] font-semibold tracking-wide"
          >
            📖 Open Narrative
          </button>
        </div>
      )}
    </div>
  );
}

// ─── mission_stats ────────────────────────────────────────────────────────────

function MissionStatsBlock(_: BlockComponentProps) {
  const { data } = useSurfaceContext();
  return (
    <MissionStatsPanel
      missionPower={data.missionPower ?? 0}
      difficulty={data.difficulty ?? 0}
      successChance={data.successChance ?? 0}
      injuryChance={data.injuryChance ?? 0}
      injuryRate={data.injuryRate ?? 0}
      powerRatio={data.powerRatio ?? 0}
      hasSynergyBonus={!!(data.synergy?.missionPowerBonus > 0)}
      loading={data.statsLoading ?? false}
    />
  );
}

// ─── mission_requirements — standalone component from missions/panels ─────────

function MissionRequirementsWrapper(_: BlockComponentProps) {
  return <MissionRequirementsBlock />;
}

// ─── mission_stats_requirements — side-by-side compound block (planning) ──────

function MissionStatsRequirementsBlock(_: BlockComponentProps) {
  const { data } = useSurfaceContext();
  return (
    <div className="grid grid-cols-2 gap-3">
      <MissionRequirementsBlock />
      <MissionStatsPanel
        missionPower={data.missionPower ?? 0}
        difficulty={data.difficulty ?? 0}
        successChance={data.successChance ?? 0}
        injuryChance={data.injuryChance ?? 0}
        injuryRate={data.injuryRate ?? 0}
        powerRatio={data.powerRatio ?? 0}
        hasSynergyBonus={!!(data.synergy?.missionPowerBonus > 0)}
        loading={data.statsLoading ?? false}
      />
    </div>
  );
}

// ─── mission_synergy ──────────────────────────────────────────────────────────

function MissionSynergyBlock(_: BlockComponentProps) {
  const { data } = useSurfaceContext();
  const matchedRules = data.synergy?.matchedRules ?? [];
  if (matchedRules.length === 0) return null;
  return <MissionSynergyPanel matchedRules={matchedRules} />;
}

// ─── team_section — editable team picker (planning mode) ─────────────────────

function TeamSectionBlock(_: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  if (context.teamMode === 'locked') return null;

  const entities: any[] = data.entities ?? [];
  const selectedEntities: string[] = data.selectedEntities ?? [];
  const teamMax: number = data.teamMax ?? 4;
  const onToggle: ((id: string) => void) | undefined = data.onToggle;

  const panelRef = useRef<HTMLDivElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <RosterCard
      title="Your Team"
      entities={entities}
      selectedIds={selectedEntities}
      maxSlots={teamMax}
      useCase="mission"
      onRemove={(entityId) => onToggle?.(entityId)}
      onAdd={(entityId) => onToggle?.(entityId)}
      busyDisabledTooltip="Busy"
      panelRef={panelRef}
      isPickerOpen={isPickerOpen}
      onPickerOpenChange={setIsPickerOpen}
      inlinePicker
    />
  );
}

// ─── reward_list — delegates to existing RewardsListBlock ─────────────────────
// Sources: data.rewards (set by MissionBuilder for planning; preview = preview rewards)

function toRewardItems(raw: any[]): RewardItem[] {
  return raw
    .filter((r) => r.type !== 'emitEvent')
    .map((r) => ({
      name: r.name ?? r.label ?? r.key ?? r.type,
      qty: r.amount,
      assetKey: r.assetKey,
      rarity: r.rarity,
      note: r.note,
    }));
}

function RewardListBlock(_: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  const rawRewards: any[] = data.rewards ?? [];
  const items = toRewardItems(rawRewards);
  if (items.length === 0) return null;

  const title = context.rewardMode === 'actual' ? 'Rewards' : 'Estimated Rewards';
  return <RewardsListBlock items={items} title={title} />;
}

// ─── narrative_text ───────────────────────────────────────────────────────────

function NarrativeTextBlock({ block }: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  const narrativeBlock = block as { type: 'narrative_text'; text?: string };
  const texts: string[] =
    data.narrativeTexts ?? (narrativeBlock.text ? [narrativeBlock.text] : []);

  if (texts.length === 0) return null;

  const showAsReport = context.missionMode === 'outcome';

  if (showAsReport) {
    return (
      <div className={PANEL_CLASS}>
        <div className={PANEL_TITLE_CLASS}>Report</div>
        {texts.map((t, i) => (
          <p key={i} className="m-0 text-[12px] leading-relaxed text-text-secondary italic">
            {t}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-1">
      {texts.map((t, i) => (
        <p key={i} className="m-0 text-[13px] leading-relaxed text-text-secondary italic">
          {t}
        </p>
      ))}
    </div>
  );
}

// ─── Generic passthrough — delegate to existing BlockRenderer ─────────────────

function RichTextBlock({ block }: BlockComponentProps) {
  const b = block as { type: 'rich_text'; content?: string };
  if (!b.content) return null;
  const asModal: ModalBlock = {
    type: 'richText',
    doc: [{ t: 'p', c: [{ t: 'text', v: b.content }] }],
  };
  return <BlockRenderer block={asModal} />;
}

function ImageBlock({ block }: BlockComponentProps) {
  const b = block as { type: 'image'; assetKey?: string; caption?: string; display?: import('@derp/shared').ImageDisplay };
  if (!b.assetKey) return null;
  const asModal: ModalBlock = {
    type: 'image',
    image: { assetKey: b.assetKey },
    caption: b.caption,
    display: b.display,
  };
  return <BlockRenderer block={asModal} />;
}

function DividerBlock(_: BlockComponentProps) {
  const asModal: ModalBlock = { type: 'divider' };
  return <BlockRenderer block={asModal} />;
}

function KeyValueRowBlock({ block }: BlockComponentProps) {
  const b = block as { type: 'key_value_row'; label: string; value: string };
  const asModal: ModalBlock = {
    type: 'metaRows',
    rows: [{ label: b.label, value: b.value }],
  };
  return <BlockRenderer block={asModal} />;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export type BlockRegistry = {
  [K in ContentBlock['type']]: React.ComponentType<BlockComponentProps>;
};

export const BLOCK_REGISTRY: BlockRegistry = {
  mission_hero: MissionHeroBlock,
  mission_stats: MissionStatsBlock,
  mission_requirements: MissionRequirementsWrapper,
  mission_stats_requirements: MissionStatsRequirementsBlock,
  mission_synergy: MissionSynergyBlock,
  team_section: TeamSectionBlock,
  reward_list: RewardListBlock,
  narrative_text: NarrativeTextBlock,
  rich_text: RichTextBlock,
  image: ImageBlock,
  divider: DividerBlock,
  key_value_row: KeyValueRowBlock,
};
