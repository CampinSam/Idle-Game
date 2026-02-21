import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../config/images';
import { GameImage } from '../../components/GameImage';
import './EntityDetailPage.css';

const CLASS_COLORS: Record<string, string> = {
  buff: '#10B981', astro: '#3B82F6', viking: '#F59E0B', cyborg: '#8B5CF6',
  ninja: '#6366F1', stoner: '#F97316', magician: '#A855F7', shadow: '#6B7280',
  crystal: '#06B6D4', fire: '#EF4444', default: '#8B5CF6',
};

const CLASS_GRADIENTS: Record<string, string> = {
  buff: 'linear-gradient(180deg, #065F46 0%, #10B981 50%, #34D399 100%)',
  astro: 'linear-gradient(180deg, #1E3A5F 0%, #3B82F6 50%, #93C5FD 100%)',
  viking: 'linear-gradient(180deg, #78350F 0%, #F59E0B 50%, #FCD34D 100%)',
  cyborg: 'linear-gradient(180deg, #4C1D95 0%, #8B5CF6 50%, #C4B5FD 100%)',
  ninja: 'linear-gradient(180deg, #312E81 0%, #6366F1 50%, #A5B4FC 100%)',
  stoner: 'linear-gradient(180deg, #7C2D12 0%, #F97316 50%, #FDBA74 100%)',
  magician: 'linear-gradient(180deg, #581C87 0%, #A855F7 50%, #D8B4FE 100%)',
  shadow: 'linear-gradient(180deg, #1F2937 0%, #6B7280 50%, #9CA3AF 100%)',
  crystal: 'linear-gradient(180deg, #164E63 0%, #06B6D4 50%, #67E8F9 100%)',
  fire: 'linear-gradient(180deg, #7F1D1D 0%, #EF4444 50%, #FCA5A5 100%)',
  default: 'linear-gradient(180deg, #2D1B69 0%, #7C3AED 50%, #A78BFA 100%)',
};

const ENTITY_EMOJIS: Record<string, string> = {
  buff: '💪', astro: '🚀', viking: '⚔️', cyborg: '🤖', ninja: '🥷',
  stoner: '🎸', magician: '🧙', shadow: '🌑', crystal: '💎', fire: '🔥', default: '🐦',
};

const TRAIT_ICONS: Record<string, string> = {
  head: '👑', ears: '👂', beak: '🦷', eyes: '👁️', body: '🦺', back: '🎒', tail: '🪶',
};

const STAT_LABELS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;

const STAT_COLORS: Record<string, string> = {
  ATK: '#EF4444', DEF: '#3B82F6', SPD: '#10B981',
  FOC: '#F59E0B', LCK: '#A855F7', VIT: '#EC4899',
};

const TABS = ['STATS', 'EQUIPMENT', 'TRAITS'];

function getEntityClass(entity: any): string {
  const traits = entity.traits || {};
  const dominant = traits.body || traits.head || '';
  const lower = dominant.toLowerCase();
  for (const cls of Object.keys(CLASS_COLORS)) {
    if (cls !== 'default' && lower.includes(cls)) return cls;
  }
  if (lower.includes('sleek') || lower.includes('shadow')) return 'shadow';
  if (lower.includes('plump') || lower.includes('crystal')) return 'crystal';
  if (lower.includes('muscular') || lower.includes('fire') || lower.includes('flame')) return 'fire';
  return 'default';
}

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
  const [entity, setEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  const loadEntity = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getEntity(id);
      setEntity(data);
    } catch (err) {
      console.error('Failed to load entity:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadEntity();
  }, [loadEntity]);

  if (loading) {
    return <div className="bd-page"><div className="bd-loading">Loading...</div></div>;
  }

  if (!entity) {
    return (
      <div className="bd-page">
        <div className="bd-loading">Entity not found.</div>
        <button className="bd-back-link" onClick={() => navigate('/entities')}>Back to Entities</button>
      </div>
    );
  }

  const entityClass = getEntityClass(entity);
  const gradient = CLASS_GRADIENTS[entityClass] || CLASS_GRADIENTS.default;
  const emoji = ENTITY_EMOJIS[entityClass] || ENTITY_EMOJIS.default;
  const classColor = CLASS_COLORS[entityClass] || CLASS_COLORS.default;
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

      <div className="bd-hero" style={{ background: gradient }}>
        <GameImage
          src={getEntityImagePath(entity.id, entityClass)}
          category="entities"
          alt={entity.name}
          fallbackSrc={ENTITY_ARCHETYPE_IMAGES[entityClass] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
          className="bd-hero-portrait"
          glow
          glowColor={classColor}
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
              return (
                <div key={stat} className="bd-stat-row">
                  <span className="bd-stat-label" style={{ color: STAT_COLORS[stat] }}>{stat}</span>
                  <div className="bd-stat-bar-wrap">
                    <div
                      className="bd-stat-bar"
                      style={{ width: `${getStatBarWidth(val)}%`, background: STAT_COLORS[stat] }}
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
            <span className="bd-class-val" style={{ backgroundColor: classColor }}>{entityClass.toUpperCase()}</span>
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
                <div className="bd-trait-icon">{TRAIT_ICONS[slot] || '🔹'}</div>
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
