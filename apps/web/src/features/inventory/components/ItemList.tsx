import { useMemo } from 'react';
import { RARITY_TIERS, RARITY_DISPLAY_LABEL, type Rarity } from '@derp/shared';
import ItemCard from './ItemCard';
import { ListControls } from '../../../components/ui';
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
        <ListControls
          className="px-3.5 py-2.5 bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] shrink-0 sticky top-0 z-10"
          search={{ value: search ?? '', onChange: (v) => onSearchChange?.(v), placeholder: 'Search...' }}
          selects={[
            ...(categoryTabs && categoryTabs.length > 0 ? [{
              label: 'Filter by category',
              value: activeCategory ?? 'ALL',
              onChange: (v: string) => onCategoryChange?.(v),
              options: categoryTabs.map((t) => ({ key: t.key, label: t.label })),
              width: 90,
            }] : []),
            {
              label: 'Filter by rarity',
              value: rarityFilter,
              onChange: (v: string) => onRarityFilterChange?.(v as ItemRarityFilter),
              options: ITEM_RARITY_OPTIONS.map((o) => ({ key: o.key as string, label: o.label })),
              width: 90,
            },
            {
              label: 'Sort by',
              value: sortBy,
              onChange: (v: string) => onSortChange?.(v as ItemSortBy),
              options: ITEM_SORT_OPTIONS.map((o) => ({ key: o.key as string, label: o.label })),
              width: 108,
            },
          ]}
        />
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
