import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncEntities } from '../../hooks/useSyncSelectors';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../config/images';
import { GameImage } from '../../components/GameImage';
import './EntitiesPage.css';

const CLASS_COLORS: Record<string, string> = {
  buff: '#10B981',
  astro: '#3B82F6',
  viking: '#F59E0B',
  cyborg: '#8B5CF6',
  ninja: '#6366F1',
  stoner: '#F97316',
  magician: '#A855F7',
  shadow: '#6B7280',
  crystal: '#06B6D4',
  fire: '#EF4444',
  default: '#8B5CF6',
};

const CLASS_GRADIENTS: Record<string, string> = {
  buff: 'linear-gradient(135deg, #065F46, #10B981, #34D399)',
  astro: 'linear-gradient(135deg, #1E3A5F, #3B82F6, #93C5FD)',
  viking: 'linear-gradient(135deg, #78350F, #F59E0B, #FCD34D)',
  cyborg: 'linear-gradient(135deg, #4C1D95, #8B5CF6, #C4B5FD)',
  ninja: 'linear-gradient(135deg, #312E81, #6366F1, #A5B4FC)',
  stoner: 'linear-gradient(135deg, #7C2D12, #F97316, #FDBA74)',
  magician: 'linear-gradient(135deg, #581C87, #A855F7, #D8B4FE)',
  shadow: 'linear-gradient(135deg, #1F2937, #6B7280, #9CA3AF)',
  crystal: 'linear-gradient(135deg, #164E63, #06B6D4, #67E8F9)',
  fire: 'linear-gradient(135deg, #7F1D1D, #EF4444, #FCA5A5)',
  default: 'linear-gradient(135deg, #2D1B69, #7C3AED, #A78BFA)',
};

const ENTITY_EMOJIS: Record<string, string> = {
  buff: '💪',
  astro: '🚀',
  viking: '⚔️',
  cyborg: '🤖',
  ninja: '🥷',
  stoner: '🎸',
  magician: '🧙',
  shadow: '🌑',
  crystal: '💎',
  fire: '🔥',
  default: '🐦',
};

const FILTER_TABS = ['ALL', 'DERPS', 'VAMPS', 'PREDS'];

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

function getStarRating(entity: any): number {
  const power = getPowerScore(entity);
  if (power >= 800) return 5;
  if (power >= 500) return 4;
  if (power >= 300) return 3.5;
  if (power >= 200) return 3;
  return 2.5;
}

function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  return (
    <div className="entity-stars">
      {Array.from({ length: fullStars }).map((_, i) => (
        <span key={i} className="star full">★</span>
      ))}
      {hasHalf && <span className="star half">★</span>}
      {Array.from({ length: 5 - fullStars - (hasHalf ? 1 : 0) }).map((_, i) => (
        <span key={`e${i}`} className="star empty">★</span>
      ))}
    </div>
  );
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'idle': return '🟢';
    case 'mission': return '🔵';
    case 'working': return '🟡';
    case 'injured': return '🔴';
    default: return '⚪';
  }
}

export default function EntitiesPage() {
  const navigate = useNavigate();
  const entities = useSyncEntities();
  const [activeFilter, setActiveFilter] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntities = entities.filter((entity: any) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!entity.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="entities-page">
      <div className="entities-filter-tabs">
        {FILTER_TABS.map((tab, i) => (
          <button
            key={tab}
            className={`entities-filter-tab ${i === activeFilter ? 'active' : ''}`}
            onClick={() => setActiveFilter(i)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="entities-search-bar">
        <span className="entities-search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search Derp Entities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="entities-search-input"
        />
        <button className="entities-sort-btn">ALL ▼</button>
      </div>

      <div className="entities-card-grid">
        {filteredEntities.map((entity: any) => {
          const entityClass = getEntityClass(entity);
          const power = getPowerScore(entity);
          const stars = getStarRating(entity);
          const gradient = CLASS_GRADIENTS[entityClass] || CLASS_GRADIENTS.default;
          const emoji = ENTITY_EMOJIS[entityClass] || ENTITY_EMOJIS.default;
          const classColor = CLASS_COLORS[entityClass] || CLASS_COLORS.default;

          return (
            <div key={entity.id} className="entity-card-v2" onClick={() => navigate(`/entities/${entity.id}`)}>
              <div className="entity-card-art" style={{ background: gradient }}>
                <div className="entity-card-status">{getStatusIcon(entity.status)}</div>
                <div className="entity-card-level">
                  <span className="entity-lv-num">{entity.level}</span>
                  <span className="entity-lv-icon">🏆</span>
                </div>
                <GameImage
                  src={getEntityImagePath(entity.id, entityClass)}
                  category="entities"
                  alt={entity.name}
                  fallbackSrc={ENTITY_ARCHETYPE_IMAGES[entityClass] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
                  className="entity-card-portrait"
                />
              </div>
              <div className="entity-card-info">
                <div className="entity-card-name-row">
                  <span className="entity-card-name">{entity.name}</span>
                  <span className="entity-card-check">✅</span>
                </div>
                <div className="entity-card-class-row">
                  <span className="entity-class-badge" style={{ backgroundColor: classColor }}>
                    {entityClass.toUpperCase()}
                  </span>
                </div>
                <div className="entity-card-bottom">
                  <StarRating rating={stars} />
                  <span className="entity-power-score">{power.toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })}

        {filteredEntities.length === 0 && (
          <div className="entities-empty">No entities found.</div>
        )}
      </div>
    </div>
  );
}
