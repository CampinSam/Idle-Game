import { useMemo, type ReactNode } from 'react';
import ItemCard from './ItemCard';
import ItemDetailPanel from './ItemDetailPanel';
import type { ItemListMode, ItemUseCase } from '../types';
import './ItemList.css';

const RARITY_ORDER: Record<string, number> = {
  LEGENDARY: 0,
  MYTHIC: 1,
  EPIC: 2,
  ULTRA_RARE: 3,
  RARE: 4,
  ADVANCED: 5,
  SCARCE: 6,
  UNCOMMON: 7,
  COMMON: 8,
};

export interface ItemCategoryTab {
  key: string;
  label: string;
  /** When tab is selected, items are filtered to this/these `type` value(s). 'ALL' = no filter. */
  types?: string[] | null;
}

export interface ItemListProps {
  items: any[];
  mode: ItemListMode;
  /** Drives layout/density. 'inventory' = full grid + detail panel; 'potion-picker' = compact 5-col, no detail panel. */
  useCase?: ItemUseCase;
  /** Optional set of category tabs to render above the grid. */
  categoryTabs?: ItemCategoryTab[];
  activeCategory?: string;
  onCategoryChange?: (key: string) => void;
  /** When set, items are filtered to these types regardless of activeCategory. */
  typeFilter?: string[];
  /** Picker mode props */
  selectedId?: string | null;
  disabledIds?: string[];
  onSelect?: (item: any) => void;
  /** When set, an inline detail panel is rendered for the selected item. */
  selectedItem?: any | null;
  detailPanelActions?: (item: any) => ReactNode;
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
  typeFilter,
  selectedId,
  disabledIds,
  onSelect,
  selectedItem,
  detailPanelActions,
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

    list = [...list].sort((a: any, b: any) => {
      const ra = RARITY_ORDER[a.rarity] ?? 99;
      const rb = RARITY_ORDER[b.rarity] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.name || '').localeCompare(b.name || '');
    });

    return list;
  }, [items, typeFilter, categoryTabs, activeCategory]);

  const isCompactPicker = mode === 'picker' && useCase === 'potion-picker';
  const showDetailPanel = !isCompactPicker && !!selectedItem;

  return (
    <div className={`item-list item-list--${useCase} ${className}`.trim()}>
      {categoryTabs && categoryTabs.length > 0 && (
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
      )}

      <div className={`item-list__grid-wrap ${showDetailPanel ? 'item-list__grid-wrap--has-detail' : ''}`}>
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

      {showDetailPanel && (
        <ItemDetailPanel
          item={selectedItem}
          actions={detailPanelActions ? detailPanelActions(selectedItem) : undefined}
          className="item-list__detail-panel"
        />
      )}
    </div>
  );
}
