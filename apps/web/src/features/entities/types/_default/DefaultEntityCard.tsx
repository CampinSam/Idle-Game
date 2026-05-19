import { useMemo } from 'react';
import { GameImage } from '../../../../components/GameImage';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../../../config/images';
import { getArchetypeDisplay, getStatusDisplay } from '@derp/shared';
import { getEntityArchetype } from '../../registry';
import { getEntityMP, getEntityPower, getStarRating, normalizeStats } from '../../utils';
import type { EntityCardProps } from '../../types';

const BASE_CARD = [
  'relative cursor-pointer rounded-xl overflow-hidden flex flex-col',
  '[transition:transform_0.2s,border-color_0.2s,box-shadow_0.2s,opacity_0.2s]',
  '[animation:card-enter_0.25s_ease-out_both]',
  '[background:linear-gradient(180deg,#1e1850_0%,#151030_100%)]',
  'border border-[rgba(139,92,246,0.22)] text-text-primary',
  'hover:border-[rgba(139,92,246,0.6)]',
].join(' ');

const SELECTED_GLOW = 'border-[#8B5CF6] shadow-[0_0_12px_rgba(139,92,246,0.5),inset_0_0_8px_rgba(139,92,246,0.15)]';
const ACTIVE_GLOW = '!border-[#8B5CF6] shadow-[0_0_12px_rgba(139,92,246,0.5),inset_0_0_8px_rgba(139,92,246,0.15)] bg-[rgba(139,92,246,0.15)]';

function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  return (
    <div className="flex">
      {Array.from({ length: fullStars }).map((_, i) => (
        <span key={i} className="text-xs leading-none text-[#F59E0B]">★</span>
      ))}
      {hasHalf && <span className="text-xs leading-none text-[#F59E0B] opacity-60">★</span>}
      {Array.from({ length: 5 - fullStars - (hasHalf ? 1 : 0) }).map((_, i) => (
        <span key={`e${i}`} className="text-xs leading-none text-[#374151]">★</span>
      ))}
    </div>
  );
}

export default function DefaultEntityCard({
  entity,
  useCase = 'browse',
  selected = false,
  disabled = false,
  disabledTooltip,
  active = false,
  onClick,
  onRemove,
  forecast,
  qualityColors,
  extras,
  className = '',
  compact = false,
  tagOverride,
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

  if (useCase === 'browse') {
    const cls = [
      BASE_CARD,
      'entity-card--browse',
      'hover:-translate-y-0.5',
      selected && ['entity-card--selected', SELECTED_GLOW].join(' '),
      active && ['entity-card--active', ACTIVE_GLOW].join(' '),
      disabled && 'entity-card--disabled opacity-40 cursor-not-allowed',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div className={cls} onClick={handleClick}>
        <div
          className="relative h-[120px] shrink-0 flex items-center justify-center overflow-hidden"
          style={{ background: archetypeDisplay.gradient }}
        >
          <div className="absolute top-[6px] right-[6px] flex items-center gap-[3px] bg-[rgba(0,0,0,0.62)] border border-[rgba(139,92,246,0.55)] rounded-[20px] px-[7px] py-[2px] z-[2]">
            <span className="text-[8px] font-black text-[rgba(167,139,250,0.85)] tracking-[0.5px]">LVL</span>
            <span className="text-sm font-black text-white leading-none">{entity.level}</span>
          </div>
          {selected && (
            <div className="absolute top-[6px] left-[6px] w-[22px] h-[22px] rounded-full bg-[#059669] border-2 border-[#34d399] flex items-center justify-center z-[3] shadow-[0_0_8px_rgba(52,211,153,0.6)]">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <GameImage
            src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
            category="entities"
            alt={entity.name}
            fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
            className="absolute inset-0 !w-full !h-full !rounded-none opacity-85 drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]"
          />
        </div>
        <div className="p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-extrabold text-text-primary tracking-[0.3px] whitespace-nowrap overflow-hidden text-ellipsis">{entity.name}</span>
            <span className="text-[11px] shrink-0 leading-none">{statusDisplay.icon}</span>
          </div>
          <div className="mb-1.5">
            <span
              className="inline-block px-2 py-[2px] rounded-[4px] text-[9px] font-extrabold text-white tracking-[0.8px]"
              style={{ backgroundColor: tagOverride?.color ?? archetypeDisplay.color }}
            >
              {tagOverride?.label ?? (archetype || 'UNKNOWN').toUpperCase()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <StarRating rating={stars} />
            <span className="text-[13px] font-black text-text-primary">{power.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }

  if (useCase === 'mission') {
    const cardWidth = 'w-full';
    const portraitSize = '!w-4/5 !h-4/5';
    const portraitShadow = compact ? 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]' : 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]';
    const botPadding = compact ? 'p-[4px_4px_6px]' : 'p-2';
    const idStyle = compact
      ? 'block text-[10px] font-extrabold text-text-primary mb-[2px] whitespace-nowrap overflow-hidden text-ellipsis'
      : 'block text-[11px] font-extrabold text-text-primary uppercase tracking-[0.5px] mb-[2px] whitespace-nowrap overflow-hidden text-ellipsis';
    const subStyle = compact
      ? 'block text-[9px] text-text-secondary font-semibold'
      : 'block text-[10px] text-text-secondary font-semibold';

    const cls = [
      BASE_CARD,
      'entity-card--mission',
      cardWidth,
      'border-2 border-[var(--border)]',
      active && ['entity-card--active', ACTIVE_GLOW].join(' '),
      selected
        ? '!border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] !shadow-none opacity-40 cursor-not-allowed'
        : disabled && 'entity-card--disabled opacity-40 cursor-not-allowed',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div className={cls} onClick={handleClick} title={disabled && disabledTooltip ? disabledTooltip : undefined}>
        <div className="relative aspect-square flex items-center justify-center" style={{ background: archetypeDisplay.gradient }}>
          {onRemove && (
            <button
              type="button"
              className="absolute top-[6px] left-[6px] w-[22px] h-[22px] rounded-full bg-[rgba(239,68,68,0.85)] text-white text-xs font-black flex items-center justify-center cursor-pointer border-none z-[2] p-0"
              onClick={(e) => { e.stopPropagation(); onRemove(entity); }}
              aria-label="Remove entity"
            >✕</button>
          )}
          <span className="absolute top-[6px] right-[6px] bg-[rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.15)] py-[2px] px-2 rounded-[10px] text-[11px] font-extrabold text-white">⚡{mp}</span>
          <GameImage
            src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
            category="entities"
            alt={entity.name}
            fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
            className={`${portraitSize} !rounded-full ${portraitShadow}`}
          />
        </div>
        <div className={`${botPadding} bg-bg-card text-center`}>
          <span className={idStyle}>{entity.name}</span>
          <span className={subStyle}>MP {mp}</span>
        </div>
      </div>
    );
  }

  if (useCase === 'crafting') {
    const cls = [
      'entity-card--crafting',
      'text-left bg-[rgba(15,12,38,0.7)] border border-[rgba(139,92,246,0.35)] rounded-xl p-3',
      'flex flex-col gap-1 text-[#e2e8f0] cursor-pointer [transition:transform_0.12s_ease] font-[inherit]',
      'hover:-translate-y-px',
      selected && 'entity-card--selected outline outline-2 outline-[#f97316] outline-offset-2 !shadow-none',
      disabled && 'opacity-40 cursor-not-allowed',
      className,
    ].filter(Boolean).join(' ');

    return (
      <button type="button" className={cls} onClick={handleClick} disabled={disabled}>
        <div className="flex items-center gap-2.5">
          <div className="relative shrink-0">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden border border-[rgba(255,255,255,0.12)]"
              style={{ background: archetypeDisplay.gradient }}
            >
              <GameImage
                src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
                category="entities"
                alt={entity.name}
                fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
                className="!w-full !h-full object-cover !rounded-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
              />
            </div>
            {selected && (
              <div className="absolute -top-[3px] -right-[3px] w-[18px] h-[18px] rounded-full bg-[#f97316] border-2 border-[rgba(15,12,38,0.9)] flex items-center justify-center z-[2]">
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-[2px] min-w-0">
            <div className="text-[13px] font-bold text-[#fff7ed]">{entity.name}</div>
            <div className="text-[11px] text-[#94a3b8]">Lvl {entity.level}</div>
          </div>
        </div>
        {forecast && (
          <div className="flex flex-wrap items-baseline justify-between mt-1.5 text-xs [font-variant-numeric:tabular-nums] gap-1">
            <span className="text-[#fde68a] font-bold">CL {forecast.craftingLuck.toFixed(0)}</span>
            <span
              className="font-extrabold"
              style={{ color: qualityColors?.[forecast.expectedQuality] || '#94a3b8' }}
            >
              {forecast.expectedQualityLabel}
            </span>
            <div className="flex w-full h-1.5 mt-1.5 rounded-[3px] overflow-hidden bg-[rgba(0,0,0,0.35)]" aria-hidden>
              {forecast.probabilities.map((p) => (
                <div
                  key={p.key}
                  className="h-full [transition:width_0.3s_ease,opacity_0.3s_ease]"
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
    const cardWidth = 'w-full';
    const portraitSize = '!w-4/5 !h-4/5';
    const portraitShadow = compact ? 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]' : 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]';
    const botPadding = compact ? 'p-[4px_4px_6px]' : 'p-2';
    const idStyle = compact
      ? 'block text-[10px] font-extrabold text-text-primary mb-[2px] whitespace-nowrap overflow-hidden text-ellipsis'
      : 'block text-[11px] font-extrabold text-text-primary uppercase tracking-[0.5px] mb-[2px] whitespace-nowrap overflow-hidden text-ellipsis';
    const subStyle = compact
      ? 'block text-[9px] text-text-secondary font-semibold'
      : 'block text-[10px] text-text-secondary font-semibold';

    const cls = [
      BASE_CARD,
      'entity-card--outpost',
      cardWidth,
      'border-2 border-[var(--border)]',
      active && ['entity-card--active', ACTIVE_GLOW].join(' '),
      selected
        ? '!border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] !shadow-none opacity-40 cursor-not-allowed'
        : disabled && 'entity-card--disabled opacity-40 cursor-not-allowed',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div className={cls} onClick={handleClick} title={disabled && disabledTooltip ? disabledTooltip : undefined}>
        <div
          className="relative aspect-square flex items-center justify-center [background:linear-gradient(135deg,rgba(30,20,60,0.8),rgba(20,15,45,0.8))]"
          style={{ background: archetypeDisplay.gradient }}
        >
          {onRemove && (
            <button
              type="button"
              className="absolute top-[6px] left-[6px] w-[22px] h-[22px] rounded-full bg-[rgba(239,68,68,0.85)] text-white text-xs font-black flex items-center justify-center cursor-pointer border-none z-[2] p-0"
              onClick={(e) => { e.stopPropagation(); onRemove(entity); }}
              aria-label="Remove worker"
            >✕</button>
          )}
          <GameImage
            src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
            category="entities"
            alt={entity.name}
            fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
            className={`${portraitSize} !rounded-full ${portraitShadow}`}
          />
        </div>
        <div className={`${botPadding} bg-bg-card text-center`}>
          <span className={idStyle}>{entity.name}</span>
          <span className={subStyle}>SPD {stats.SPD} · FOC {stats.FOC}</span>
        </div>
      </div>
    );
  }

  return null;
}
