import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../config/images';
import { GameImage } from '../../components/GameImage';
import { getArchetypeDisplay, STAT_DISPLAY, TRAIT_SLOT_DISPLAY } from '@derp/shared';
import './EntityDetailPage.css';

const STAT_LABELS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;

const TABS = ['STATS', 'EQUIPMENT', 'TRAITS'];

function getPowerScore(entity: any): number {
  const stats = entity.stats || {};
  return (
    stats.ATK * 0.40 +
    stats.DEF * 0.30 +
    stats.SPD * 0.20 +
    stats.FOC * 0.10 +
    stats.LCK * 0.05 +
    stats.VIT * 0.05
  );
}

function getXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level - 1));
}

function getStatBarWidth(value: number): number {
  return Math.min((value / 40) * 100, 100);
}

export default function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

  const entity = useAppSelector((s) => s.sync.entities[id ?? '']);

  if (!entity) {
    return (
      <div className="bd-page">
        <div className="bd-loading">Entity not found.</div>
        <button className="bd-back-link" onClick={() => navigate('/entities')}>Back to Entities</button>
      </div>
    );
  }

  const archetype: string = entity.traits?.body || entity.traits?.head || '';
  const archetypeDisplay = getArchetypeDisplay(archetype);
  const power = getPowerScore(entity);
  const stats = entity.stats || {};
  const traits = entity.traits || {};
  const xpMax = getXpForLevel(entity.level);
  const xpCurrent = Number(entity.xp || 0);
  const xpPercent = Math.min((xpCurrent / xpMax) * 100, 100);

  return (
    <div className="bd-page">
      <div className="bd-header">
        <button className="bd-back-btn" onClick={() => navigate('/entities')}>←</button>
        <h1 className="bd-name">{entity.name}</h1>
        <div className="bd-header-icons">
          <button className="bd-icon-btn" style={{ background: '#F59E0B' }}>⚡</button>
          <button className="bd-icon-btn" style={{ background: '#10B981' }}>🧪</button>
          <button className="bd-icon-btn" style={{ background: '#6B7280' }}>⚙️</button>
        </div>
      </div>

      <div className="bd-hero" style={{ background: archetypeDisplay.gradient }}>
        <GameImage
          src={getEntityImagePath(entity.id, archetype)}
          category="entities"
          alt={entity.name}
          fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
          className="bd-hero-portrait"
          glow
          glowColor={archetypeDisplay.color}
        />
        <div className="bd-hero-platform">
          <div className="bd-platform-ring"></div>
        </div>

        <div className="bd-hero-sidebar">
          <div className="bd-power-badge">
            <span className="bd-power-icon">💜</span>
            <span className="bd-power-label">Power Score</span>
            <span className="bd-power-value">{power.toLocaleString()}</span>
          </div>

          <div className="bd-equip-panel">
            <div className="bd-equip-title">EQUIPMENT</div>
            <div className="bd-equip-slot">
              <span className="bd-equip-slot-icon">⚔️</span>
              <div className="bd-equip-slot-info">
                <div className="bd-equip-slot-name">+ EQUIP RELIC</div>
              </div>
            </div>
            <div className="bd-equip-slot">
              <span className="bd-equip-slot-icon">🧪</span>
              <div className="bd-equip-slot-info">
                <div className="bd-equip-slot-name">+ EQUIP POTION</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bd-tabs">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`bd-tab ${i === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className="bd-stats-section">
          <div className="bd-level-row">
            <div className="bd-level-badge">⚡</div>
            <span className="bd-level-text">LEVEL {entity.level}</span>
            <div className="bd-xp-info">
              <span className="bd-xp-nums">{xpCurrent.toLocaleString()} / {xpMax.toLocaleString()}</span>
            </div>
          </div>
          <div className="bd-xp-bar-wrap">
            <div className="bd-xp-bar" style={{ width: `${xpPercent}%` }} />
          </div>

          <div className="bd-action-btns">
            <button className="bd-boost-btn">BOOST</button>
            <button className="bd-ascend-btn">ASCEND</button>
          </div>

          <div className="bd-stat-bars">
            {STAT_LABELS.map((stat) => {
              const val = stats[stat] || 0;
              const statColor = STAT_DISPLAY[stat]?.color ?? '#8B5CF6';
              return (
                <div key={stat} className="bd-stat-row">
                  <span className="bd-stat-label" style={{ color: statColor }}>{stat}</span>
                  <div className="bd-stat-bar-wrap">
                    <div
                      className="bd-stat-bar"
                      style={{ width: `${getStatBarWidth(val)}%`, background: statColor }}
                    />
                  </div>
                  <span className="bd-stat-value">{val}</span>
                </div>
              );
            })}
          </div>

          <div className="bd-status-row">
            <span className="bd-status-label">Status</span>
            <span className={`bd-status-val bd-status-${entity.status}`}>{entity.status.toUpperCase()}</span>
          </div>

          <div className="bd-class-row">
            <span className="bd-class-label">Class</span>
            <span className="bd-class-val" style={{ backgroundColor: archetypeDisplay.color }}>
              {archetype.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>
        </div>
      )}

      {activeTab === 1 && (
        <div className="bd-equip-section">
          <div className="bd-equip-card">
            <div className="bd-equip-card-icon">⚔️</div>
            <div className="bd-equip-card-info">
              <div className="bd-equip-card-name">Relic Slot</div>
              <div className="bd-equip-card-desc">No relic equipped</div>
            </div>
            <button className="bd-equip-card-btn">RELIC ›</button>
          </div>
          <div className="bd-equip-card">
            <div className="bd-equip-card-icon">🧪</div>
            <div className="bd-equip-card-info">
              <div className="bd-equip-card-name">Potion Slot</div>
              <div className="bd-equip-card-desc">No potion equipped</div>
            </div>
            <button className="bd-equip-card-btn">POTION ›</button>
          </div>
        </div>
      )}

      {activeTab === 2 && (
        <div className="bd-traits-section">
          <h3 className="bd-traits-title">TRAITS</h3>
          <div className="bd-traits-grid">
            {Object.entries(traits).map(([slot, value]: [string, any]) => (
              <div key={slot} className="bd-trait-card">
                <div className="bd-trait-icon">{TRAIT_SLOT_DISPLAY[slot]?.icon ?? '🔹'}</div>
                <div className="bd-trait-name">{String(value)}</div>
                <div className="bd-trait-slot">{slot}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
