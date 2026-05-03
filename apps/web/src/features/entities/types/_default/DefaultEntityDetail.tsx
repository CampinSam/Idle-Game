import { useState } from 'react';
import { GameImage } from '../../../../components/GameImage';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../../../config/images';
import { getArchetypeDisplay, TRAIT_SLOT_DISPLAY } from '@derp/shared';
import { getEntityArchetype } from '../../registry';
import { getEntityPower, getXpForLevel, normalizeStats } from '../../utils';
import StatRadarChart from './StatRadarChart';
import DefaultEntityCard from './DefaultEntityCard';
import type { EntityDetailProps } from '../../types';
import './DefaultEntityDetail.css';

const TRAIT_SLOT_ORDER = ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'] as const;
const PROGRESSION_TABS = ['LEVEL', 'ASCENSION', 'MASTERY', 'RELICS', 'HISTORY'] as const;
type ProgressionTab = typeof PROGRESSION_TABS[number];

const MAX_LEVEL = 50;

function getNextUnlockLevel(level: number): number {
  const milestones = [5, 10, 15, 20, 25, 30, 40, 50];
  return milestones.find((m) => m > level) ?? MAX_LEVEL;
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
  const [activeTab, setActiveTab] = useState<ProgressionTab>('LEVEL');

  const archetype = getEntityArchetype(entity);
  const archetypeDisplay = getArchetypeDisplay(archetype || 'default');
  const power = getEntityPower(entity);
  const stats = normalizeStats(entity.stats);
  const traits = (entity.traits || {}) as Partial<Record<typeof TRAIT_SLOT_ORDER[number], string>>;

  const rawXpMax = getXpForLevel(entity.level);
  const xpMax = rawXpMax > 0 ? rawXpMax : 100;
  const xpCurrent = Number(entity.xp || 0);
  const xpPercent = xpMax > 0 ? Math.min((xpCurrent / xpMax) * 100, 100) : 0;
  const nextUnlock = getNextUnlockLevel(entity.level);

  return (
    <div className="entity-detail">

      {/* ── Top section: portrait card + power/radar ── */}
      <div className="entity-detail__top">

        {/* Portrait card */}
        <div className="entity-detail__portrait-card" style={{ background: archetypeDisplay.gradient }}>
          <div className="entity-detail__level-badge">
            <span className="entity-detail__level-badge-icon">⚡</span>
            <span className="entity-detail__level-badge-text">LEVEL {entity.level}</span>
          </div>

          <div className="entity-detail__portrait-wrap">
            <GameImage
              src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'full')}
              category="entities"
              alt={entity.name}
              fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
              className="entity-detail__portrait"
              glow
              glowColor={archetypeDisplay.color}
            />
          </div>

          <div className="entity-detail__equip-row">
            {[
              { icon: '⚔️', label: 'WEAPON' },
              { icon: '🛡️', label: 'ARMOR' },
              { icon: '💍', label: 'ACCESSORY' },
            ].map(({ icon, label }) => (
              <button key={label} className="entity-detail__equip-slot" type="button">
                <span className="entity-detail__equip-slot-icon">{icon}</span>
                <span className="entity-detail__equip-slot-plus">+</span>
                <span className="entity-detail__equip-slot-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Power score + radar */}
        <div className="entity-detail__power-block">
          <div className="entity-detail__power-header">
            <div>
              <div className="entity-detail__power-label">POWER SCORE</div>
              <div className="entity-detail__power-value">{power.toFixed(2)}</div>
              <div className="entity-detail__power-caption">Overall effectiveness in missions</div>
            </div>
            <div
              className="entity-detail__archetype-hex"
              style={{ background: archetypeDisplay.gradient, borderColor: archetypeDisplay.color }}
            >
              <span className="entity-detail__archetype-hex-emoji">{archetypeDisplay.emoji}</span>
            </div>
          </div>

          <div className="entity-detail__radar-wrap">
            <StatRadarChart stats={stats} size={190} />
          </div>
        </div>
      </div>

      {/* ── Middle section: progression tabs + body slots ── */}
      <div className="entity-detail__middle">

        {/* Progression tab panel */}
        <div className="entity-detail__prog-panel">
          <div className="entity-detail__prog-tabs" role="tablist">
            {PROGRESSION_TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`entity-detail__prog-tab${activeTab === tab ? ' entity-detail__prog-tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="entity-detail__prog-content">
            {activeTab === 'LEVEL' ? (
              <div className="entity-detail__level-tab">
                <div className="entity-detail__prog-row">
                  <span className="entity-detail__prog-row-label">Current Level</span>
                  <span className="entity-detail__prog-row-value">{entity.level} / {MAX_LEVEL}</span>
                </div>
                <div className="entity-detail__prog-row entity-detail__prog-row--xp">
                  <span className="entity-detail__prog-row-label">XP</span>
                  <div className="entity-detail__xp-bar-wrap">
                    <div className="entity-detail__xp-bar" style={{ width: `${xpPercent}%` }} />
                  </div>
                  <span className="entity-detail__xp-nums">{xpCurrent} / {xpMax}</span>
                </div>
                <div className="entity-detail__prog-row">
                  <span className="entity-detail__prog-row-label">Stat Growth</span>
                  <span className="entity-detail__prog-row-value">Normal</span>
                </div>
                <button className="entity-detail__unlock-chip" type="button">
                  <span>Next Unlock: Level {nextUnlock}</span>
                  <span className="entity-detail__unlock-chip-arrow">▶</span>
                </button>
              </div>
            ) : (
              <div className="entity-detail__prog-placeholder">
                <span className="entity-detail__prog-placeholder-icon">🔒</span>
                <span>Coming soon</span>
              </div>
            )}
          </div>
        </div>

        {/* Body slots & traits */}
        <div className="entity-detail__body-slots">
          <div className="entity-detail__panel-title">BODY SLOTS &amp; TRAITS</div>
          {TRAIT_SLOT_ORDER.map((slot) => {
            const value = traits[slot];
            const slotDisplay = TRAIT_SLOT_DISPLAY[slot];
            const archetypeColor = value
              ? (getArchetypeDisplay(value)?.color ?? '#A78BFA')
              : 'rgba(255,255,255,0.3)';
            return (
              <div key={slot} className="entity-detail__slot-row">
                <span className="entity-detail__slot-icon">{slotDisplay?.icon ?? '🔹'}</span>
                <span className="entity-detail__slot-name">{slot.charAt(0).toUpperCase() + slot.slice(1)}</span>
                <span className="entity-detail__slot-value" style={{ color: archetypeColor }}>
                  {value ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
