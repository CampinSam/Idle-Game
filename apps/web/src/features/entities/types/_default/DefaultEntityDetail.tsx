import { GameImage } from '../../../../components/GameImage';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../../../config/images';
import { getArchetypeDisplay, STAT_DISPLAY, TRAIT_SLOT_DISPLAY } from '@derp/shared';
import { getEntityArchetype } from '../../registry';
import { getEntityPower, getXpForLevel, normalizeStats } from '../../utils';
import DefaultEntityCard from './DefaultEntityCard';
import type { EntityDetailProps } from '../../types';
import './DefaultEntityDetail.css';

const STAT_LABELS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;
const TRAIT_SLOT_ORDER = ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'] as const;

function getStatBarWidth(value: number): number {
  return Math.min((value / 40) * 100, 100);
}

export default function DefaultEntityDetail(props: EntityDetailProps) {
  const { entity, variant = 'full', useCase = 'mission', onRemove } = props;

  if (variant === 'lightweight') {
    return (
      <DefaultEntityCard
        entity={entity}
        useCase={useCase}
        onRemove={onRemove}
      />
    );
  }

  return <FullEntityDetail entity={entity} />;
}

function FullEntityDetail({ entity }: { entity: EntityDetailProps['entity'] }) {
  const archetype = getEntityArchetype(entity);
  const archetypeDisplay = getArchetypeDisplay(archetype || 'Warrior');
  const power = getEntityPower(entity);
  const stats = normalizeStats(entity.stats);
  const traits = (entity.traits || {}) as Partial<Record<typeof TRAIT_SLOT_ORDER[number], string>>;
  const traitEntries = TRAIT_SLOT_ORDER
    .map((slot) => ({ slot, value: traits[slot] }))
    .filter((t): t is { slot: typeof TRAIT_SLOT_ORDER[number]; value: string } => Boolean(t.value));

  const rawXpMax = getXpForLevel(entity.level);
  const xpMax = rawXpMax > 0 ? rawXpMax : 0;
  const xpCurrent = Number(entity.xp || 0);
  const xpPercent = xpMax > 0 ? Math.min((xpCurrent / xpMax) * 100, 100) : 0;

  return (
    <div className="entity-detail">
      <div className="entity-detail__hero" style={{ background: archetypeDisplay.gradient }}>
        <GameImage
          src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
          category="entities"
          alt={entity.name}
          fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
          className="entity-detail__portrait"
          glow
          glowColor={archetypeDisplay.color}
        />
        <div className="entity-detail__platform">
          <div className="entity-detail__platform-ring" />
        </div>

        <div className="entity-detail__sidebar">
          <div className="entity-detail__power-badge">
            <span className="entity-detail__power-icon">💜</span>
            <span className="entity-detail__power-label">Power Score</span>
            <span className="entity-detail__power-value">{power.toLocaleString()}</span>
          </div>

          <div className="entity-detail__traits-panel">
            <div className="entity-detail__traits-panel-title">TRAITS</div>
            {traitEntries.length === 0 ? (
              <div className="entity-detail__traits-empty">No traits</div>
            ) : (
              <div className="entity-detail__traits-list">
                {traitEntries.map(({ slot, value }) => (
                  <div key={slot} className="entity-detail__trait-row">
                    <span className="entity-detail__trait-row-icon">
                      {TRAIT_SLOT_DISPLAY[slot]?.icon ?? '🔹'}
                    </span>
                    <span className="entity-detail__trait-row-slot">{slot}</span>
                    <span className="entity-detail__trait-row-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="entity-detail__stats-section">
        <div className="entity-detail__level-row">
          <div className="entity-detail__level-badge">⚡</div>
          <span className="entity-detail__level-text">Level {entity.level}</span>
          <div className="entity-detail__xp-info">
            <span className="entity-detail__xp-nums">
              {xpCurrent.toLocaleString()} / {xpMax.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="entity-detail__xp-bar-wrap">
          <div className="entity-detail__xp-bar" style={{ width: `${xpPercent}%` }} />
        </div>

        <div className="entity-detail__stat-bars">
          {STAT_LABELS.map((stat) => {
            const val = stats[stat] || 0;
            const statColor = STAT_DISPLAY[stat]?.color ?? '#8B5CF6';
            return (
              <div key={stat} className="entity-detail__stat-row">
                <span className="entity-detail__stat-label" style={{ color: statColor }}>{stat}</span>
                <div className="entity-detail__stat-bar-wrap">
                  <div
                    className="entity-detail__stat-bar"
                    style={{ width: `${getStatBarWidth(val)}%`, background: statColor }}
                  />
                </div>
                <span className="entity-detail__stat-value">{val}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
