import { useMemo } from 'react';
import { GameImage } from '../../../../components/GameImage';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../../../config/images';
import { getArchetypeDisplay, getStatusDisplay } from '@derp/shared';
import { getEntityArchetype } from '../../registry';
import { getEntityMP, getEntityPower, getStarRating, normalizeStats } from '../../utils';
import type { EntityCardProps } from '../../types';
import './DefaultEntityCard.css';

function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  return (
    <div className="entity-card__stars">
      {Array.from({ length: fullStars }).map((_, i) => (
        <span key={i} className="entity-card__star entity-card__star--full">★</span>
      ))}
      {hasHalf && <span className="entity-card__star entity-card__star--half">★</span>}
      {Array.from({ length: 5 - fullStars - (hasHalf ? 1 : 0) }).map((_, i) => (
        <span key={`e${i}`} className="entity-card__star entity-card__star--empty">★</span>
      ))}
    </div>
  );
}

export default function DefaultEntityCard({
  entity,
  useCase = 'browse',
  selected = false,
  disabled = false,
  active = false,
  onClick,
  onRemove,
  forecast,
  qualityColors,
  extras,
  className = '',
}: EntityCardProps) {
  const archetype = getEntityArchetype(entity);
  const archetypeDisplay = getArchetypeDisplay(archetype || 'Warrior');
  const statusDisplay = getStatusDisplay(entity.status);
  const power = useMemo(() => getEntityPower(entity), [entity]);
  const mp = useMemo(() => Math.round(getEntityMP(entity)), [entity]);
  const stars = useMemo(() => getStarRating(entity), [entity]);
  const stats = normalizeStats(entity.stats);

  const handleClick = () => {
    if (disabled) return;
    onClick?.(entity);
  };

  const cls = [
    'entity-card',
    `entity-card--${useCase}`,
    selected && 'entity-card--selected',
    disabled && 'entity-card--disabled',
    active && 'entity-card--active',
    className,
  ].filter(Boolean).join(' ');

  if (useCase === 'browse') {
    return (
      <div className={cls} onClick={handleClick}>
        <div className="entity-card__art" style={{ background: archetypeDisplay.gradient }}>
          <div className="entity-card__level-badge">
            <span className="entity-card__level-label">LVL</span>
            <span className="entity-card__level-num">{entity.level}</span>
          </div>
          <GameImage
            src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
            category="entities"
            alt={entity.name}
            fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
            className="entity-card__portrait entity-card__portrait--cover"
          />
        </div>
        <div className="entity-card__info">
          <div className="entity-card__name-row">
            <span className="entity-card__name">{entity.name}</span>
            <span className="entity-card__status-dot">{statusDisplay.icon}</span>
          </div>
          <div className="entity-card__class-row">
            <span className="entity-card__class-badge" style={{ backgroundColor: archetypeDisplay.color }}>
              {(archetype || 'UNKNOWN').toUpperCase()}
            </span>
          </div>
          <div className="entity-card__bottom">
            <StarRating rating={stars} />
            <span className="entity-card__power">{power.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }

  if (useCase === 'mission') {
    return (
      <div className={cls} onClick={handleClick}>
        <div className="entity-card__top" style={{ background: archetypeDisplay.gradient }}>
          {onRemove && (
            <button
              type="button"
              className="entity-card__remove"
              onClick={(e) => { e.stopPropagation(); onRemove(entity); }}
              aria-label="Remove entity"
            >✕</button>
          )}
          <span className="entity-card__mp-badge">⚡{mp}</span>
          <GameImage
            src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
            category="entities"
            alt={entity.name}
            fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
            className="entity-card__portrait entity-card__portrait--round"
          />
        </div>
        <div className="entity-card__bot">
          <span className="entity-card__id">{entity.name}</span>
          <span className="entity-card__sub">MP {mp}</span>
        </div>
      </div>
    );
  }

  if (useCase === 'crafting') {
    return (
      <button type="button" className={cls} onClick={handleClick} disabled={disabled}>
        <div className="entity-card__name">{entity.name}</div>
        <div className="entity-card__meta">Lvl {entity.level}</div>
        {forecast && (
          <div className="entity-card__forecast">
            <span className="entity-card__cl">CL {forecast.craftingLuck.toFixed(0)}</span>
            <span
              className="entity-card__quality"
              style={{ color: qualityColors?.[forecast.expectedQuality] || '#94a3b8' }}
            >
              {forecast.expectedQualityLabel}
            </span>
            <div className="entity-card__probs" aria-hidden>
              {forecast.probabilities.map((p) => (
                <div
                  key={p.key}
                  className="entity-card__prob-seg"
                  style={{
                    width: `${Math.max(2, p.probability * 100)}%`,
                    background: qualityColors?.[p.key] || '#475569',
                    opacity: 0.35 + p.probability * 0.65,
                  }}
                  title={`${p.label}: ${(p.probability * 100).toFixed(1)}%`}
                />
              ))}
            </div>
          </div>
        )}
        {extras}
      </button>
    );
  }

  if (useCase === 'outpost') {
    return (
      <div className={cls} onClick={handleClick}>
        <div className="entity-card__top entity-card__top--compact" style={{ background: archetypeDisplay.gradient }}>
          {onRemove && (
            <button
              type="button"
              className="entity-card__remove"
              onClick={(e) => { e.stopPropagation(); onRemove(entity); }}
              aria-label="Remove worker"
            >✕</button>
          )}
          <GameImage
            src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
            category="entities"
            alt={entity.name}
            fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
            className="entity-card__portrait entity-card__portrait--round"
          />
        </div>
        <div className="entity-card__bot">
          <span className="entity-card__id">{entity.name}</span>
          <span className="entity-card__sub">ATK {stats.ATK} · DEF {stats.DEF}</span>
        </div>
      </div>
    );
  }

  return null;
}
