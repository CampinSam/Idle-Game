import { useMemo, useState } from 'react';
import EntityCard from './EntityCard';
import EntityList from './EntityList';
import { buildCollectionOptions, SORT_OPTIONS } from '../entityListUtils';
import { ListControls } from '../../../components/ui';
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
          <div className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 rounded-t-xl flex flex-col gap-2" style={{ background: 'linear-gradient(180deg,rgba(20,16,56,0.98) 80%,rgba(20,16,56,0) 100%)' }}>
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
            <ListControls
              search={{ value: pickerSearch, onChange: setPickerSearch, placeholder: 'Search...' }}
              selects={[
                {
                  label: 'Filter by collection',
                  value: pickerFilter,
                  onChange: (v) => setPickerFilter(v as EntityFilter),
                  options: collectionOptions,
                  width: 90,
                },
                {
                  label: 'Sort by',
                  value: pickerSort,
                  onChange: (v) => setPickerSort(v as EntitySortBy),
                  options: SORT_OPTIONS,
                  width: 108,
                },
              ]}
            />
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
