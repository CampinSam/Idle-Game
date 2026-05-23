import { useRef, useState } from 'react';
import type { ContentBlock, RewardItem } from '@derp/shared';
import { MissionHeroPanel } from '../missions/components/panels/MissionHeroPanel';
import { MissionStatsPanel } from '../missions/components/panels/MissionStatsPanel';
import { MissionSynergyPanel } from '../missions/components/panels/MissionSynergyPanel';
import { MissionRosterPanel } from '../missions/components/panels/MissionRosterPanel';
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
  const { def, currentCat, missionCategoryDefs = [], onBack } = data;
  if (!def) return null;
  return (
    <div className="-mx-4 -mt-3">
      <MissionHeroPanel
        def={def}
        currentCat={currentCat}
        missionCategoryDefs={missionCategoryDefs}
        onBack={onBack}
      />
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

// ─── entity_roster — read-only team (in_progress) or outcome entity results ───

function EntityRosterBlock(_: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  if (context.teamMode === 'editable') return null;

  if (context.missionMode === 'outcome') {
    const entityResults: any[] = data.results?.entityResults ?? [];
    if (entityResults.length === 0) return null;
    const rewardCount = (data.results?.rewards ?? []).filter((r: any) => r.type !== 'emitEvent').length;
    return (
      <div className={PANEL_CLASS}>
        <div className={PANEL_TITLE_CLASS}>Team Outcomes</div>
        <div className="flex flex-col gap-1.5">
          {entityResults.map((er: any, i: number) => (
            <div
              key={er.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] motion-safe:animate-[outcome-row-in_0.3s_ease-out_both]"
              style={{ animationDelay: `${rewardCount * 0.08 + 0.12 + i * 0.08}s` }}
            >
              <span className="text-[14px] leading-none flex-shrink-0">
                {er.injured ? '🩹' : er.leveledUp ? '⬆️' : '⚔️'}
              </span>
              <span className="flex-1 text-[13px] font-bold text-text-primary truncate">{er.name}</span>
              <span className="flex flex-col items-end gap-0.5">
                {er.leveledUp && (
                  <span className="text-[11px] font-extrabold text-[#fbbf24]">
                    Lv {er.oldLevel} → {er.newLevel} ⬆️
                  </span>
                )}
                {er.injured && (
                  <span className="text-[11px] font-extrabold text-[#ef4444]">Injured 🩹</span>
                )}
                {er.xpGained > 0 && (
                  <span className="text-[10px] text-text-secondary">+{er.xpGained} XP</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const entities = data.rosterEntities ?? [];
  return <MissionRosterPanel entities={entities} />;
}

// ─── mission_timer ────────────────────────────────────────────────────────────

function MissionTimerBlock(_: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  if (context.missionMode !== 'in_progress') return null;

  const remainingMs: number = data.remainingMs ?? 0;
  const progressPct: number = data.progressPct ?? 2;
  const isReady: boolean = data.isReady ?? false;

  return (
    <div className={PANEL_CLASS}>
      <div className={PANEL_TITLE_CLASS}>Mission Progress</div>
      <div className="flex flex-col gap-2">
        {isReady ? (
          <div className="text-[13px] font-extrabold text-[#10b981] text-center py-1">
            ✅ Ready to Collect!
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-secondary uppercase font-bold tracking-wide">
                Remaining
              </span>
              <span className="text-[14px] font-extrabold tabular-nums text-[#F59E0B]">
                ⏱ {Math.floor(remainingMs / 60000)}m {Math.floor((remainingMs % 60000) / 1000)}s
              </span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-black/40">
              <div
                className="h-full bg-gradient-to-r from-[#a78bfa] to-[#8b5cf6] transition-[width] duration-[1000ms] ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── outcome_banner — win/fail header only; rewards + entity results are separate blocks ──

function OutcomeBannerBlock(_: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  if (context.missionMode !== 'outcome') return null;

  const isSuccess: boolean = data.isSuccess ?? false;
  const results: any = data.results ?? null;

  return (
    <div
      className="rounded-xl px-4 py-3 text-center border motion-safe:animate-[outcome-banner-in_0.4s_cubic-bezier(0.34,1.56,0.64,1)_both]"
      style={
        isSuccess
          ? { background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.35)' }
          : { background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.3)' }
      }
    >
      <div className="text-[28px] leading-none mb-1">{isSuccess ? '🏆' : '💀'}</div>
      <div
        className="font-cinzel text-[17px] font-black tracking-wider uppercase"
        style={{ color: isSuccess ? '#10b981' : '#ef4444' }}
      >
        {isSuccess ? 'Mission Complete' : 'Mission Failed'}
      </div>
      {results?.qualityLabel && (
        <div className="text-[12px] text-text-secondary mt-0.5">{results.qualityLabel}</div>
      )}
    </div>
  );
}

// ─── reward_list — delegates to existing RewardsListBlock ─────────────────────
// Sources: data.rewards (set by MissionPanel per-mode; planning = preview, outcome = actual)

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
  const b = block as { type: 'image'; assetKey?: string; caption?: string };
  if (!b.assetKey) return null;
  const asModal: ModalBlock = {
    type: 'image',
    image: { assetKey: b.assetKey },
    caption: b.caption,
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
  entity_roster: EntityRosterBlock,
  mission_timer: MissionTimerBlock,
  outcome_banner: OutcomeBannerBlock,
  reward_list: RewardListBlock,
  narrative_text: NarrativeTextBlock,
  rich_text: RichTextBlock,
  image: ImageBlock,
  divider: DividerBlock,
  key_value_row: KeyValueRowBlock,
};
