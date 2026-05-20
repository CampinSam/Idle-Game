import { useMemo, useState } from 'react';
import EntityCard from './EntityCard';
import EntityList from './EntityList';
import { buildCollectionOptions, SORT_OPTIONS } from '../entityListUtils';
import type { EntityFilter, EntitySortBy, EntityUseCase } from '../types';

export interface RosterCardProps {
  title: string;
  entities: any[];
  selectedIds: string[];
  maxSlots: number;
  useCase: Extract<EntityUseCase, 'mission' | 'forge'>;
  onRemove: (entityId: string) => void;
  onAdd?: (entityId: string) => void;
  disabledIds?: string[];
  busyDisabledTooltip?: string;
  panelRef?: React.RefObject<HTMLDivElement>;
  isPickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  inlinePicker?: boolean;
}

export default function RosterCard({
  title,
  entities,
  selectedIds,
  maxSlots,
  useCase,
  onRemove,
  onAdd,
  disabledIds,
  busyDisabledTooltip,
  panelRef,
  isPickerOpen,
  onPickerOpenChange,
  inlinePicker = true,
}: RosterCardProps) {
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFilter, setPickerFilter] = useState<EntityFilter>('ALL');
  const [pickerSort, setPickerSort] = useState<EntitySortBy>('name');

  const atMax = selectedIds.length >= maxSlots;
  const pickerDisabledIds = useMemo(
    () => disabledIds ?? (atMax
      ? entities.filter((e: any) => !selectedIds.includes(e.id)).map((e: any) => e.id)
      : []),
    [atMax, entities, selectedIds, disabledIds],
  );

  const collectionOptions = useMemo(() => buildCollectionOptions(entities), [entities]);

  const panelClass = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
  const panelTitleClass = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';

  const showInlinePicker = inlinePicker && isPickerOpen;

  return (
    <div ref={panelRef} className={panelClass}>

      {!showInlinePicker && (
        <span className={panelTitleClass}>
          {title} ({selectedIds.length}/{maxSlots})
        </span>
      )}

      {!showInlinePicker && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
          {selectedIds.map((entityId) => {
            const entity = entities.find((e: any) => e.id === entityId);
            if (!entity) return null;
            return (
              <EntityCard
                key={entity.id}
                entity={entity}
                useCase={useCase}
                selected
                active={!inlinePicker && isPickerOpen}
                onClick={() => {
                  if (inlinePicker) {
                    onRemove(entity.id);
                  } else {
                    onPickerOpenChange(!isPickerOpen);
                  }
                }}
                onRemove={() => onRemove(entity.id)}
              />
            );
          })}
          {selectedIds.length < maxSlots && (
            <button
              type="button"
              onClick={() => onPickerOpenChange(true)}
              className="rounded-xl border-2 border-dashed border-white/15 bg-bg-card hover:border-white/25 cursor-pointer overflow-hidden p-0 transition-colors"
            >
              <div className="aspect-square flex items-center justify-center bg-white/[0.03]">
                <span className="text-[28px] text-white/20 font-light">＋</span>
              </div>
            </button>
          )}
        </div>
      )}

      {showInlinePicker && (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-extrabold tracking-widest uppercase text-text-secondary">
              Tap to toggle · {selectedIds.length}/{maxSlots} chosen
            </span>
            <button
              type="button"
              onClick={() => onPickerOpenChange(false)}
              className="text-[11px] font-extrabold tracking-wide text-[#c4b5fd] hover:text-white cursor-pointer"
            >
              ▲ Close
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-[7px] bg-[rgba(0,0,0,0.25)] border border-[rgba(139,92,246,0.18)] rounded-lg px-2.5 h-[34px] min-w-0 focus-within:border-[rgba(139,92,246,0.5)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary flex-shrink-0">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="flex-1 bg-transparent border-none text-text-primary text-[12px] outline-none min-w-0 placeholder:text-text-secondary [font-family:'Exo_2',system-ui,sans-serif]"
              />
            </div>
            <select
              className="entity-list__select entity-list__select--collection"
              value={pickerFilter}
              onChange={(e) => setPickerFilter(e.target.value as EntityFilter)}
              aria-label="Filter by collection"
            >
              {collectionOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <select
              className="entity-list__select entity-list__select--sort"
              value={pickerSort}
              onChange={(e) => setPickerSort(e.target.value as EntitySortBy)}
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
          <EntityList
            entities={entities}
            mode="picker"
            useCase={useCase}
            showControls={false}
            search={pickerSearch}
            onSearchChange={setPickerSearch}
            activeFilter={pickerFilter}
            onFilterChange={setPickerFilter}
            sortBy={pickerSort}
            onSortChange={setPickerSort}
            selectedIds={selectedIds}
            disabledIds={pickerDisabledIds}
            busyDisabledTooltip={busyDisabledTooltip}
            onSelect={(entity) => onAdd?.(entity.id)}
          />
        </>
      )}
    </div>
  );
}
