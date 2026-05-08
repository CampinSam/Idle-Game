import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import EntityCard from './EntityCard';
import { COLLECTION_OPTIONS, SORT_OPTIONS, passesFilter, getFilteredSortedEntities } from '../entityListUtils';
import type {
  EntityListLayout,
  EntityListMode,
  EntityUseCase,
  EntityFilter,
  EntitySortBy,
  EntityForecast,
} from '../types';

export interface EntityListProps {
  entities: any[];
  mode: EntityListMode;
  useCase?: EntityUseCase;
  layout?: EntityListLayout;
  filter?: EntityFilter;
  activeFilter?: EntityFilter;
  onFilterChange?: (filter: EntityFilter) => void;
  showControls?: boolean;
  sortBy?: EntitySortBy;
  onSortChange?: (sort: EntitySortBy) => void;
  search?: string;
  onSearchChange?: (q: string) => void;
  /** @deprecated use showControls */
  showFilterTabs?: boolean;
  /** @deprecated use showControls */
  showSearchBar?: boolean;
  selectedIds?: string[];
  disabledIds?: string[];
  activeId?: string | null;
  onSelect?: (entity: any) => void;
  onCardClick?: (entity: any) => void;
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
    if (showControls) {
      return getFilteredSortedEntities(entities, effectiveFilter, search ?? '', sortBy);
    }
    let list = entities.filter((e) => passesFilter(e, effectiveFilter));
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((e: any) => (e.name || '').toLowerCase().includes(q));
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
        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] shrink-0 sticky top-0 z-10">
          <div className="flex-1 flex items-center gap-[7px] bg-[rgba(0,0,0,0.25)] border border-[rgba(139,92,246,0.18)] rounded-lg px-2.5 h-[34px] min-w-0 focus-within:border-[rgba(139,92,246,0.5)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={search ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-[12px] outline-none [font-family:'Exo_2',system-ui,sans-serif] min-w-0 placeholder:text-[color:var(--text-secondary)]"
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
        <div className="flex bg-[rgba(0,0,0,0.25)] border-b border-[rgba(139,92,246,0.12)] shrink-0">
          {COLLECTION_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={[
                'flex-1 py-[11px] px-1.5 text-[11px] font-bold tracking-[0.6px] uppercase border-b-2 border-transparent cursor-pointer transition-colors duration-150 [font-family:inherit] !rounded-none !p-[11px_6px]',
                effectiveFilter === tab.key
                  ? 'text-[#c4b5fd] border-b-[color:var(--derp-purple)] !border-b-2'
                  : 'text-[color:var(--text-secondary)] hover:text-[#c4b5fd]',
              ].join(' ')}
              onClick={() => onFilterChange?.(tab.key)}
            >
              {tab.key}
            </button>
          ))}
        </div>
      )}

      {/* Legacy search bar */}
      {showSearchBar && !showControls && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[rgba(0,0,0,0.15)] border-b border-[rgba(139,92,246,0.1)] shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search entities..."
            value={search ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-[12px] outline-none [font-family:'Exo_2',system-ui,sans-serif] min-w-0 placeholder:text-[color:var(--text-secondary)]"
          />
        </div>
      )}

      <div className="entity-list__grid p-3 grid gap-2">
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-6 px-4 text-[color:var(--text-secondary)] text-[13px]">
            {emptyMessage}
          </div>
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
