import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncEntities, useSyncStatus } from '../../hooks/useSyncSelectors';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../config/images';
import { GameImage } from '../../components/GameImage';
import { getArchetypeDisplay, getStatusDisplay } from '@derp/shared';
import './EntitiesPage.css';

function EntitiesPageSkeleton() {
  return (
    <div className="entities-page">
      <div className="entities-filter-tabs" style={{ marginBottom: 12 }}>
        {['ALL', 'DERPS', 'VAMPS', 'PREDS'].map((t) => (
          <div key={t} className="skeleton" style={{ width: 56, height: 32, borderRadius: 20, display: 'inline-block' }} />
        ))}
      </div>
      <div className="entities-search-bar" style={{ marginBottom: 16 }}>
        <div className="skeleton" style={{ width: '100%', height: 40, borderRadius: 10 }} />
      </div>
      <div className="entities-card-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="entity-card-v2" style={{ animation: 'none', opacity: 1 }}>
            <div className="skeleton" style={{ width: '100%', height: 140, borderRadius: 8, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: '70%', height: 14, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: '50%', height: 11, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const FILTER_TABS = ['ALL', 'DERPS', 'VAMPS', 'PREDS'];

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

export default function EntitiesPage() {
  const navigate = useNavigate();
  const entities = useSyncEntities();
  const syncStatus = useSyncStatus();
  const [activeFilter, setActiveFilter] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  if (syncStatus === 'disconnected') return <EntitiesPageSkeleton />;

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
          const archetype: string = entity.traits?.body || entity.traits?.head || '';
          const archetypeDisplay = getArchetypeDisplay(archetype);
          const statusDisplay = getStatusDisplay(entity.status);
          const power = getPowerScore(entity);
          const stars = getStarRating(entity);

          return (
            <div key={entity.id} className="entity-card-v2" onClick={() => navigate(`/entities/${entity.id}`)}>
              <div className="entity-card-art" style={{ background: archetypeDisplay.gradient }}>
                <div className="entity-card-status">{statusDisplay.icon}</div>
                <div className="entity-card-level">
                  <span className="entity-lv-num">{entity.level}</span>
                  <span className="entity-lv-icon">🏆</span>
                </div>
                <GameImage
                  src={getEntityImagePath(entity.id, archetype)}
                  category="entities"
                  alt={entity.name}
                  fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
                  className="entity-card-portrait"
                />
              </div>
              <div className="entity-card-info">
                <div className="entity-card-name-row">
                  <span className="entity-card-name">{entity.name}</span>
                  <span className="entity-card-check">✅</span>
                </div>
                <div className="entity-card-class-row">
                  <span className="entity-class-badge" style={{ backgroundColor: archetypeDisplay.color }}>
                    {archetype.toUpperCase() || 'UNKNOWN'}
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
