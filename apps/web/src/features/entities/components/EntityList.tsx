import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import EntityCard from './EntityCard';
import type {
  EntityListLayout,
  EntityListMode,
  EntityUseCase,
  EntityFilter,
  EntityForecast,
} from '../types';
import './EntityList.css';

const FILTER_TABS: Array<{ key: EntityFilter; label: string; archetypeKeys: string[] | null }> = [
  { key: 'ALL', label: 'ALL', archetypeKeys: null },
  { key: 'DERPS', label: 'DERPS', archetypeKeys: ['Derp', 'Dave', 'Warrior', 'Mage', 'Rogue', 'Healer', 'Tank'] },
  { key: 'VAMPS', label: 'VAMPS', archetypeKeys: ['Vamp', 'Vampire'] },
  { key: 'PREDS', label: 'PREDS', archetypeKeys: ['Pred', 'Predator'] },
];

function passesFilter(entity: any, filter: EntityFilter): boolean {
  if (filter === 'ALL') return true;
  const set = FILTER_TABS.find(t => t.key === filter)?.archetypeKeys;
  if (!set) return true;
  const archetype = (entity?.traits?.body || entity?.traits?.head || '') as string;
  return set.some(k => archetype.toLowerCase().includes(k.toLowerCase()));
}

export interface EntityListProps {
  entities: any[];
  mode: EntityListMode;
  useCase?: EntityUseCase;
  layout?: EntityListLayout;
  /** Sub-filter applied internally when filter tabs are not user-controlled. */
  filter?: EntityFilter;
  /** Controlled active filter — caller manages state. */
  activeFilter?: EntityFilter;
  onFilterChange?: (filter: EntityFilter) => void;
  showFilterTabs?: boolean;
  /** Optional search text. Caller is responsible for input rendering when showSearchBar=false. */
  search?: string;
  showSearchBar?: boolean;
  onSearchChange?: (q: string) => void;
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
  showFilterTabs = false,
  search,
  showSearchBar = false,
  onSearchChange,
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
    return list;
  }, [entities, effectiveFilter, search]);

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
      {showFilterTabs && (
        <div className="entity-list__filter-strip">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`entity-list__filter-tab ${effectiveFilter === tab.key ? 'entity-list__filter-tab--active' : ''}`}
              onClick={() => onFilterChange?.(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {showSearchBar && (
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
