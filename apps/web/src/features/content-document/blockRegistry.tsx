import { useRef, useState } from 'react';
import type { ContentBlock } from '@derp/shared';
import { MissionHeroPanel } from '../missions/components/panels/MissionHeroPanel';
import { MissionStatsPanel } from '../missions/components/panels/MissionStatsPanel';
import { MissionSynergyPanel } from '../missions/components/panels/MissionSynergyPanel';
import { MissionRosterPanel } from '../missions/components/panels/MissionRosterPanel';
import { RosterCard } from '../entities/components';
import AssetImage from '../../components/modal/AssetImage';
import { useSurfaceContext } from './SurfaceContext';

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
  if (!def || !currentCat) return null;
  return (
    <MissionHeroPanel
      def={def}
      currentCat={currentCat}
      missionCategoryDefs={missionCategoryDefs}
      onBack={onBack}
    />
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

// ─── mission_requirements ─────────────────────────────────────────────────────

function MissionRequirementsBlock(_: BlockComponentProps) {
  const { data } = useSurfaceContext();
  const requirements: Array<{ label?: string; met: boolean }> = data.previewRequirements ?? [];
  const loading: boolean = data.previewLoading ?? false;

  return (
    <div className={PANEL_CLASS}>
      <div className={PANEL_TITLE_CLASS}>Requirements</div>
      {loading && requirements.length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-4/5" />
          <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-3/5" />
        </div>
      ) : requirements.length === 0 ? (
        <span className="text-[12px] text-text-secondary italic">No requirements</span>
      ) : (
        <div className="flex flex-col gap-1.5">
          {requirements.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="text-base leading-none flex-shrink-0">{r.met ? '✅' : '❌'}</span>
              <span
                className="flex-1 font-medium truncate"
                style={{ color: r.met ? '#10b981' : '#ef4444' }}
              >
                {r.label ?? 'Requirement'}
              </span>
            </div>
          ))}
        </div>
      )}
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

// ─── entity_roster — locked read-only team (in_progress / outcome) ────────────

function EntityRosterBlock(_: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  if (context.teamMode === 'editable') return null;
  const entities: Array<{ id: string; name: string; level: number }> = data.rosterEntities ?? [];
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
                className="h-full bg-gradient-to-r from-[#a78bfa] to-[#8b5cf6] transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── outcome_banner ───────────────────────────────────────────────────────────

function OutcomeBannerBlock(_: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  if (context.missionMode !== 'outcome') return null;

  const isSuccess: boolean = data.isSuccess ?? false;
  const results: any = data.results ?? null;
  const rewards: any[] = results?.rewards ?? data.rewards ?? [];
  const entityResults: any[] = results?.entityResults ?? data.entityResults ?? [];
  const filteredRewards = rewards.filter((r: any) => r.type !== 'emitEvent');

  return (
    <div className="flex flex-col gap-3">
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

      {filteredRewards.length > 0 && (
        <div className={PANEL_CLASS}>
          <div className={PANEL_TITLE_CLASS}>Rewards</div>
          <div className="flex flex-col gap-1.5">
            {filteredRewards.map((r: any, i: number) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] motion-safe:animate-[outcome-row-in_0.3s_ease-out_both]"
                style={{ animationDelay: `${0.3 + i * 0.08}s` }}
              >
                <span className="text-[14px] leading-none flex-shrink-0">
                  {r.type === 'currency'
                    ? '💰'
                    : r.type === 'item'
                    ? '📦'
                    : r.type === 'entity_xp'
                    ? '✨'
                    : r.type === 'keeper_xp'
                    ? '⭐'
                    : '🎁'}
                </span>
                <span className="flex-1 text-[13px] font-bold text-text-primary truncate">
                  {r.name ?? r.key ?? r.type}
                </span>
                {r.amount != null && (
                  <span className="text-[12px] font-extrabold text-[#10b981] tabular-nums flex-shrink-0">
                    +{r.amount}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {entityResults.length > 0 && (
        <div className={PANEL_CLASS}>
          <div className={PANEL_TITLE_CLASS}>Team Outcomes</div>
          <div className="flex flex-col gap-1.5">
            {entityResults.map((er: any, i: number) => (
              <div
                key={er.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] motion-safe:animate-[outcome-row-in_0.3s_ease-out_both]"
                style={{
                  animationDelay: `${0.3 + filteredRewards.length * 0.08 + 0.12 + i * 0.08}s`,
                }}
              >
                <span className="text-[14px] leading-none flex-shrink-0">
                  {er.injured ? '🩹' : er.leveledUp ? '⬆️' : '⚔️'}
                </span>
                <span className="flex-1 text-[13px] font-bold text-text-primary truncate">
                  {er.name}
                </span>
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
      )}
    </div>
  );
}

// ─── reward_list ──────────────────────────────────────────────────────────────

function RewardListBlock(_: BlockComponentProps) {
  const { context, data } = useSurfaceContext();
  const rewards: any[] = data.rewards ?? [];
  const isActual = context.rewardMode === 'actual';

  if (rewards.length === 0) return null;

  const title = isActual ? 'Rewards' : 'Estimated Rewards';

  return (
    <div className={PANEL_CLASS}>
      <div className={PANEL_TITLE_CLASS}>{title}</div>
      <div className="flex flex-col gap-1.5">
        {rewards
          .filter((r: any) => r.type !== 'emitEvent')
          .map((r: any, i: number) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            >
              <span className="text-[14px] leading-none flex-shrink-0">
                {r.type === 'currency'
                  ? '💰'
                  : r.type === 'item'
                  ? '📦'
                  : r.type === 'entity_xp'
                  ? '✨'
                  : '🎁'}
              </span>
              <span className="flex-1 text-[13px] font-bold text-text-primary truncate">
                {r.name ?? r.label ?? r.key ?? r.type}
              </span>
              {r.amount != null && (
                <span className="text-[12px] font-extrabold text-[#10b981] tabular-nums flex-shrink-0">
                  {isActual ? '+' : '~'}{r.amount}
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  );
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

// ─── Generic passthrough blocks ───────────────────────────────────────────────

function RichTextBlock({ block }: BlockComponentProps) {
  const b = block as { type: 'rich_text'; content?: string };
  if (!b.content) return null;
  return <p className="m-0 text-[13px] leading-relaxed text-text-secondary">{b.content}</p>;
}

function ImageBlock({ block }: BlockComponentProps) {
  const b = block as { type: 'image'; assetKey?: string; caption?: string };
  if (!b.assetKey) return null;
  return (
    <div className="flex flex-col gap-1">
      <AssetImage asset={{ assetKey: b.assetKey }} style={{ width: '100%', borderRadius: 12 }} />
      {b.caption && (
        <div className="text-[11px] text-text-secondary text-center">{b.caption}</div>
      )}
    </div>
  );
}

function DividerBlock(_: BlockComponentProps) {
  return <hr className="border-0 border-t border-white/10 my-1" />;
}

function KeyValueRowBlock({ block }: BlockComponentProps) {
  const b = block as { type: 'key_value_row'; label: string; value: string };
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] font-bold tracking-wide text-text-secondary uppercase">
        {b.label}
      </span>
      <span className="text-[13px] font-bold text-text-primary">{b.value}</span>
    </div>
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export type BlockRegistry = {
  [K in ContentBlock['type']]: React.ComponentType<BlockComponentProps>;
};

export const BLOCK_REGISTRY: BlockRegistry = {
  mission_hero: MissionHeroBlock,
  mission_stats: MissionStatsBlock,
  mission_requirements: MissionRequirementsBlock,
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
