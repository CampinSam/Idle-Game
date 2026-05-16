import { useMemo } from 'react';
import { RARITY_TIERS, RARITY_ORDER, RARITY_DISPLAY_LABEL, type Rarity } from '@derp/shared';
import ItemCard from './ItemCard';
import type { ItemListMode, ItemUseCase } from '../types';

const RARITY_SORT_DESC: Record<string, number> = Object.fromEntries(
  [...RARITY_TIERS].reverse().map((r, i) => [r.toUpperCase(), i]),
);

export type ItemSortBy = 'rarity' | 'name' | 'quantity';
export type ItemRarityFilter = 'ALL' | Uppercase<Rarity>;

export const ITEM_RARITY_OPTIONS: Array<{ key: ItemRarityFilter; label: string }> = [
  { key: 'ALL', label: 'All' },
  ...RARITY_TIERS.map(r => ({ key: r.toUpperCase() as Uppercase<Rarity>, label: RARITY_DISPLAY_LABEL[r] })),
];


export const ITEM_SORT_OPTIONS: Array<{ key: ItemSortBy; label: string }> = [
  { key: 'rarity',   label: 'Rarity' },
  { key: 'name',     label: 'Name (A–Z)' },
  { key: 'quantity', label: 'Quantity' },
];

export interface ItemCategoryTab {
  key: string;
  label: string;
  types?: string[] | null;
}

export interface ItemListProps {
  items: any[];
  mode: ItemListMode;
  useCase?: ItemUseCase;
  categoryTabs?: ItemCategoryTab[];
  activeCategory?: string;
  onCategoryChange?: (key: string) => void;
  showControls?: boolean;
  search?: string;
  onSearchChange?: (q: string) => void;
  rarityFilter?: ItemRarityFilter;
  onRarityFilterChange?: (r: ItemRarityFilter) => void;
  sortBy?: ItemSortBy;
  onSortChange?: (s: ItemSortBy) => void;
  typeFilter?: string[];
  selectedId?: string | null;
  disabledIds?: string[];
  onSelect?: (item: any) => void;
  emptyMessage?: string;
  className?: string;
}

export default function ItemList({
  items,
  mode,
  useCase = 'inventory',
  categoryTabs,
  activeCategory,
  onCategoryChange,
  showControls = false,
  search,
  onSearchChange,
  rarityFilter = 'ALL',
  onRarityFilterChange,
  sortBy = 'rarity',
  onSortChange,
  typeFilter,
  selectedId,
  disabledIds,
  onSelect,
  emptyMessage = 'No items found',
  className = '',
}: ItemListProps) {
  const filtered = useMemo(() => {
    let list = items;

    if (typeFilter && typeFilter.length > 0) {
      list = list.filter((i: any) => typeFilter.includes(i.type));
    }

    if (categoryTabs && activeCategory) {
      const tab = categoryTabs.find((t) => t.key === activeCategory);
      if (tab?.types && tab.types.length > 0) {
        list = list.filter((i: any) => tab.types!.includes(i.type));
      }
    }

    if (showControls && search && search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((i: any) => (i.name || '').toLowerCase().includes(q));
    }

    if (showControls && rarityFilter !== 'ALL') {
      list = list.filter((i: any) => i.rarity === rarityFilter);
    }

    const effectiveSort = showControls ? sortBy : 'rarity';

    if (effectiveSort === 'rarity') {
      list = [...list].sort((a: any, b: any) => {
        const ra = RARITY_SORT_DESC[(a.rarity ?? '').toUpperCase()] ?? 99;
        const rb = RARITY_SORT_DESC[(b.rarity ?? '').toUpperCase()] ?? 99;
        if (ra !== rb) return ra - rb;
        return (a.name || '').localeCompare(b.name || '');
      });
    } else if (effectiveSort === 'name') {
      list = [...list].sort((a: any, b: any) =>
        (a.name || '').localeCompare(b.name || ''),
      );
    } else if (effectiveSort === 'quantity') {
      list = [...list].sort((a: any, b: any) =>
        (b.quantity ?? 1) - (a.quantity ?? 1),
      );
    }

    return list;
  }, [items, typeFilter, categoryTabs, activeCategory, showControls, search, rarityFilter, sortBy]);

  return (
    <div className={`item-list item-list--${useCase} ${className}`.trim()}>
      {showControls ? (
        <div className="item-list__controls">
          <div className="item-list__search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={search ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="item-list__search-input"
            />
          </div>

          {categoryTabs && categoryTabs.length > 0 && (
            <select
              className="item-list__select item-list__select--category"
              value={activeCategory ?? 'ALL'}
              onChange={(e) => onCategoryChange?.(e.target.value)}
              aria-label="Filter by category"
            >
              {categoryTabs.map((tab) => (
                <option key={tab.key} value={tab.key}>{tab.label}</option>
              ))}
            </select>
          )}

          <select
            className="item-list__select item-list__select--rarity"
            value={rarityFilter}
            onChange={(e) => onRarityFilterChange?.(e.target.value as ItemRarityFilter)}
            aria-label="Filter by rarity"
          >
            {ITEM_RARITY_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>

          <select
            className="item-list__select item-list__select--sort"
            value={sortBy}
            onChange={(e) => onSortChange?.(e.target.value as ItemSortBy)}
            aria-label="Sort by"
          >
            {ITEM_SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      ) : (
        categoryTabs && categoryTabs.length > 0 && (
          <div className="item-list__category-bar">
            {categoryTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`item-list__cat-tab ${activeCategory === tab.key ? 'item-list__cat-tab--active' : ''}`}
                onClick={() => onCategoryChange?.(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )
      )}

      <div className="item-list__grid-wrap">
        <div className={`item-list__grid item-list__grid--${useCase}`}>
          {filtered.length === 0 && (
            <div className="item-list__empty">
              <div className="item-list__empty-icon">📦</div>
              {emptyMessage}
            </div>
          )}
          {filtered.map((item: any) => {
            const id = item.instanceId ?? item.id;
            const isSelected = selectedId === id;
            const isDisabled = disabledIds?.includes(id) ?? false;
            return (
              <ItemCard
                key={id}
                item={item}
                selected={isSelected}
                disabled={isDisabled}
                onClick={onSelect}
              />
            );
          })}
        </div>
      </div>

    </div>
  );
}
