import { useState } from 'react';
import { GameImage } from '../../../../components/GameImage';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../../../config/images';
import { getArchetypeDisplay, STAT_DISPLAY, TRAIT_SLOT_DISPLAY } from '@derp/shared';
import { getEntityArchetype } from '../../registry';
import { getEntityPower, getEntityMP, getXpForLevel, normalizeStats } from '../../utils';
import DefaultEntityCard from './DefaultEntityCard';
import type { EntityDetailProps } from '../../types';
import './DefaultEntityDetail.css';

const STAT_LABELS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;
const TABS = ['STATS', 'EQUIPMENT', 'TRAITS'];

function getStatBarWidth(value: number): number {
  return Math.min((value / 40) * 100, 100);
}

export default function DefaultEntityDetail(props: EntityDetailProps) {
  const { entity, variant = 'full', useCase = 'mission', onRemove, onApplyPotion } = props;

  // Lightweight variant delegates to the small EntityCard.
  if (variant === 'lightweight') {
    return (
      <DefaultEntityCard
        entity={entity}
        useCase={useCase}
        onRemove={onRemove}
      />
    );
  }

  return <FullEntityDetail entity={entity} onApplyPotion={onApplyPotion} />;
}

function FullEntityDetail({ entity, onApplyPotion }: { entity: any; onApplyPotion?: () => void }) {
  const [activeTab, setActiveTab] = useState(0);

  const archetype = getEntityArchetype(entity);
  const archetypeDisplay = getArchetypeDisplay(archetype || 'Warrior');
  const power = getEntityPower(entity);
  const mp = Math.round(getEntityMP(entity));
  const stats = normalizeStats(entity.stats);
  const traits = entity.traits || {};
  const xpMax = getXpForLevel(entity.level);
  const xpCurrent = Number(entity.xp || 0);
  const xpPercent = Math.min((xpCurrent / xpMax) * 100, 100);

  return (
    <div className="entity-detail">
      <div className="entity-detail__hero" style={{ background: archetypeDisplay.gradient }}>
        <GameImage
          // Hero portrait renders at 160x160 (see DefaultEntityDetail.css), so
          // the same 256px `thumb` variant served on list cards is more than
          // enough resolution. Avoids downloading the multi-MB original NFT
          // image just to display it scaled down.
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

          <div className="entity-detail__equip-panel">
            <div className="entity-detail__equip-title">EQUIPMENT</div>
            <div className="entity-detail__equip-slot">
              <span className="entity-detail__equip-slot-icon">⚔️</span>
              <div className="entity-detail__equip-slot-info">
                <div className="entity-detail__equip-slot-name">+ EQUIP RELIC</div>
              </div>
            </div>
            <button
              type="button"
              className="entity-detail__equip-slot entity-detail__equip-slot--button"
              onClick={onApplyPotion}
              disabled={!onApplyPotion}
              aria-label="Apply potion"
              title="Apply Potion"
            >
              <span className="entity-detail__equip-slot-icon">🧪</span>
              <div className="entity-detail__equip-slot-info">
                <div className="entity-detail__equip-slot-name">+ EQUIP POTION</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="entity-detail__tabs">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`entity-detail__tab ${i === activeTab ? 'entity-detail__tab--active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className="entity-detail__stats-section">
          <div className="entity-detail__level-row">
            <div className="entity-detail__level-badge">⚡</div>
            <span className="entity-detail__level-text">LEVEL {entity.level}</span>
            <div className="entity-detail__xp-info">
              <span className="entity-detail__xp-nums">
                {xpCurrent.toLocaleString()} / {xpMax.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="entity-detail__xp-bar-wrap">
            <div className="entity-detail__xp-bar" style={{ width: `${xpPercent}%` }} />
          </div>

          <div className="entity-detail__action-btns">
            <button
              className="entity-detail__boost-btn"
              onClick={onApplyPotion}
              disabled={!onApplyPotion}
            >
              BOOST
            </button>
            <button className="entity-detail__ascend-btn">ASCEND</button>
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

          <div className="entity-detail__mp-row">
            <span className="entity-detail__mp-row-label">Mission Power</span>
            <span className="entity-detail__mp-row-val">⚡ {mp.toLocaleString()}</span>
          </div>

          <div className="entity-detail__status-row">
            <span className="entity-detail__row-label">Status</span>
            <span className={`entity-detail__status-val entity-detail__status-val--${entity.status}`}>
              {(entity.status || 'idle').toUpperCase()}
            </span>
          </div>

          <div className="entity-detail__class-row">
            <span className="entity-detail__row-label">Class</span>
            <span className="entity-detail__class-val" style={{ backgroundColor: archetypeDisplay.color }}>
              {(archetype || 'UNKNOWN').toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {activeTab === 1 && (
        <div className="entity-detail__equip-section">
          <div className="entity-detail__equip-card">
            <div className="entity-detail__equip-card-icon">⚔️</div>
            <div className="entity-detail__equip-card-info">
              <div className="entity-detail__equip-card-name">Relic Slot</div>
              <div className="entity-detail__equip-card-desc">No relic equipped</div>
            </div>
            <button className="entity-detail__equip-card-btn">RELIC ›</button>
          </div>
          <div className="entity-detail__equip-card">
            <div className="entity-detail__equip-card-icon">🧪</div>
            <div className="entity-detail__equip-card-info">
              <div className="entity-detail__equip-card-name">Potion Slot</div>
              <div className="entity-detail__equip-card-desc">No potion equipped</div>
            </div>
            <button className="entity-detail__equip-card-btn">POTION ›</button>
          </div>
        </div>
      )}

      {activeTab === 2 && (
        <div className="entity-detail__traits-section">
          <h3 className="entity-detail__traits-title">TRAITS</h3>
          <div className="entity-detail__traits-grid">
            {Object.entries(traits).map(([slot, value]: [string, any]) => (
              <div key={slot} className="entity-detail__trait-card">
                <div className="entity-detail__trait-icon">{TRAIT_SLOT_DISPLAY[slot]?.icon ?? '🔹'}</div>
                <div className="entity-detail__trait-name">{String(value)}</div>
                <div className="entity-detail__trait-slot">{slot}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
