import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import EntityCard from './EntityCard';
import { getEntityPower } from '../utils';
import type {
  EntityListLayout,
  EntityListMode,
  EntityUseCase,
  EntityFilter,
  EntitySortBy,
  EntityForecast,
} from '../types';
import './EntityList.css';

const COLLECTION_OPTIONS: Array<{ key: EntityFilter; label: string; archetypeKeys: string[] | null }> = [
  { key: 'ALL',   label: 'All', archetypeKeys: null },
  { key: 'DERPS', label: 'Derps',  archetypeKeys: ['Derp', 'Dave', 'Warrior', 'Mage', 'Rogue', 'Healer', 'Tank'] },
  { key: 'VAMPS', label: 'Vamps',  archetypeKeys: ['Vamp', 'Vampire'] },
  { key: 'PREDS', label: 'Preds',  archetypeKeys: ['Pred', 'Predator'] },
];

const SORT_OPTIONS: Array<{ key: EntitySortBy; label: string }> = [
  { key: 'name',       label: 'Name (A–Z)' },
  { key: 'level',      label: 'Level' },
  { key: 'power',      label: 'Power Score' },
  { key: 'collection', label: 'Collection' },
];

function passesFilter(entity: any, filter: EntityFilter): boolean {
  if (filter === 'ALL') return true;
  const set = COLLECTION_OPTIONS.find(t => t.key === filter)?.archetypeKeys;
  if (!set) return true;
  const archetype = (entity?.traits?.body || entity?.traits?.head || '') as string;
  return set.some(k => archetype.toLowerCase().includes(k.toLowerCase()));
}

function collectionBucket(entity: any): number {
  const idx = COLLECTION_OPTIONS.findIndex(
    t => t.key !== 'ALL' && passesFilter(entity, t.key),
  );
  return idx === -1 ? 99 : idx;
}

export interface EntityListProps {
  entities: any[];
  mode: EntityListMode;
  useCase?: EntityUseCase;
  layout?: EntityListLayout;
  /** Sub-filter applied internally when controls are not shown. */
  filter?: EntityFilter;
  /** Controlled active filter — used when showControls=true. */
  activeFilter?: EntityFilter;
  onFilterChange?: (filter: EntityFilter) => void;
  /** Show the unified search + collection + sort controls bar. */
  showControls?: boolean;
  sortBy?: EntitySortBy;
  onSortChange?: (sort: EntitySortBy) => void;
  /** Optional search text. */
  search?: string;
  onSearchChange?: (q: string) => void;
  /** @deprecated use showControls */
  showFilterTabs?: boolean;
  /** @deprecated use showControls */
  showSearchBar?: boolean;
  /** Picker mode props */
  selectedIds?: string[];
  disabledIds?: string[];
  activeId?: string | null;
  onSelect?: (entity: any) => void;
  /** For display mode: defaults to navigating to /entities/:id when not provided. */
  onCardClick?: (entity: any) => void;
  /** Forge use-case forecast lookup (entityId → forecast). */
  forecasts?: Record<string, EntityForecast>;
  qualityColors?: Record<string, string>;
  emptyMessage?: string;
  className?: string;
}

export default function EntityList({
  entities,
  mode,
  useCase = 'browse',
  layout,
  filter,
  activeFilter,
  onFilterChange,
  showControls = false,
  sortBy = 'name',
  onSortChange,
  search,
  onSearchChange,
  showFilterTabs = false,
  showSearchBar = false,
  selectedIds,
  disabledIds,
  activeId,
  onSelect,
  onCardClick,
  forecasts,
  qualityColors,
  emptyMessage = 'No entities found.',
  className = '',
}: EntityListProps) {
  const navigate = useNavigate();

  const effectiveFilter: EntityFilter = activeFilter ?? filter ?? 'ALL';

  const filtered = useMemo(() => {
    let list = entities;

    list = list.filter((e) => passesFilter(e, effectiveFilter));

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((e: any) => (e.name || '').toLowerCase().includes(q));
    }

    if (showControls) {
      if (sortBy === 'name') {
        list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      } else if (sortBy === 'level') {
        list = [...list].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
      } else if (sortBy === 'power') {
        list = [...list].sort((a, b) => getEntityPower(b) - getEntityPower(a));
      } else if (sortBy === 'collection') {
        list = [...list].sort((a, b) => collectionBucket(a) - collectionBucket(b));
      }
    }

    return list;
  }, [entities, effectiveFilter, search, sortBy, showControls]);

  const resolvedLayout: EntityListLayout = layout ?? (
    mode === 'picker'
      ? (useCase === 'crafting' ? 'wide' : 'picker')
      : useCase === 'mission' || useCase === 'outpost'
        ? 'team'
        : 'grid'
  );

  const handleCardClick = (entity: any) => {
    if (mode === 'picker') {
      if (disabledIds?.includes(entity.id)) return;
      onSelect?.(entity);
      return;
    }
    if (onCardClick) onCardClick(entity);
    else navigate(`/entities/${entity.id}`);
  };

  return (
    <div className={`entity-list entity-list--${resolvedLayout} ${className}`.trim()}>

      {/* Unified controls bar */}
      {showControls && (
        <div className="entity-list__controls">
          <div className="entity-list__search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={search ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="entity-list__search-input"
            />
          </div>

          <select
            className="entity-list__select entity-list__select--collection"
            value={effectiveFilter}
            onChange={(e) => onFilterChange?.(e.target.value as EntityFilter)}
            aria-label="Filter by collection"
          >
            {COLLECTION_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>

          <select
            className="entity-list__select entity-list__select--sort"
            value={sortBy}
            onChange={(e) => onSortChange?.(e.target.value as EntitySortBy)}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Legacy tab strip */}
      {showFilterTabs && !showControls && (
        <div className="entity-list__filter-strip">
          {COLLECTION_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`entity-list__filter-tab ${effectiveFilter === tab.key ? 'entity-list__filter-tab--active' : ''}`}
              onClick={() => onFilterChange?.(tab.key)}
            >
              {tab.key}
            </button>
          ))}
        </div>
      )}

      {/* Legacy search bar */}
      {showSearchBar && !showControls && (
        <div className="entity-list__search-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search entities..."
            value={search ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="entity-list__search-input"
          />
        </div>
      )}

      <div className="entity-list__grid">
        {filtered.length === 0 && (
          <div className="entity-list__empty">{emptyMessage}</div>
        )}
        {filtered.map((entity: any) => {
          const isSelected = selectedIds?.includes(entity.id) ?? false;
          const isDisabled = disabledIds?.includes(entity.id) ?? false;
          const isActive = activeId === entity.id;
          const forecast = forecasts?.[entity.id] ?? null;
          return (
            <EntityCard
              key={entity.id}
              entity={entity}
              useCase={useCase}
              selected={isSelected}
              disabled={isDisabled}
              active={isActive}
              forecast={forecast}
              qualityColors={qualityColors}
              onClick={handleCardClick}
            />
          );
        })}
      </div>
    </div>
  );
}
