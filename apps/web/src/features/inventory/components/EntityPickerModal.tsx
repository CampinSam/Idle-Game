import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppSelector } from '../../../store';
import { useSyncEntities } from '../../../hooks/useSyncSelectors';
import EntityList from '../../entities/components/EntityList';
import GameIcon from '../../../components/GameIcon';
import { summarizeEffect } from '../utils/summarizeEffect';
import type { EffectDefLite } from '../utils/summarizeEffect';
import type { EntityFilter, EntitySortBy } from '../../entities/types';
import {
  isEntityBusy,
  consumableWouldChangeEntityStats,
  BUSY_CONSUMABLE_TOOLTIP,
} from '../utils/statChangeHelpers';

export interface EntityPickerModalProps {
  isOpen: boolean;
  potion: any | null;
  onClose: () => void;
  onSelectEntity: (entityId: string, entity: any) => void;
}

function getPotionEffects(potion: any): Array<{ effectDefId: string; targetType?: string }> {
  const cd = potion?.consumableData ?? potion?.definition?.consumableData;
  if (!cd || !Array.isArray(cd.effects)) return [];
  return cd.effects;
}

export default function EntityPickerModal({
  isOpen,
  potion,
  onClose,
  onSelectEntity,
}: EntityPickerModalProps) {
  const entities = useSyncEntities();
  const effectDefsList = useAppSelector((s) => s.game.effectDefs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<EntityFilter>(() => {
    const saved = localStorage.getItem('entityPicker.filter');
    const validFilters: EntityFilter[] = ['ALL', 'DERPS', 'VAMPS', 'PREDS'];
    return validFilters.includes(saved as EntityFilter) ? (saved as EntityFilter) : 'ALL';
  });
  const [sortBy, setSortBy] = useState<EntitySortBy>(() => {
    const saved = localStorage.getItem('entityPicker.sort');
    const validSorts: EntitySortBy[] = ['name', 'level', 'power', 'collection'];
    return validSorts.includes(saved as EntitySortBy) ? (saved as EntitySortBy) : 'name';
  });

  const effectDefs: Record<string, EffectDefLite> = useMemo(() => {
    const map: Record<string, EffectDefLite> = {};
    for (const d of effectDefsList || []) map[d.id] = d;
    return map;
  }, [effectDefsList]);

  const consumableEffects = useMemo(() => getPotionEffects(potion), [potion]);

  const isStatChanger = useMemo(
    () => consumableWouldChangeEntityStats(potion, effectDefs),
    [potion, effectDefs],
  );
  const disabledIds = useMemo(() => {
    if (!isStatChanger) return [];
    return (entities as any[]).filter(isEntityBusy).map((e) => e.id);
  }, [isStatChanger, entities]);

  const summary = useMemo(() => {
    if (consumableEffects.length === 0) return null;
    return consumableEffects
      .map((spec) => {
        const def = effectDefs[spec.effectDefId];
        return def ? summarizeEffect(def) : null;
      })
      .filter(Boolean)
      .join(' • ');
  }, [consumableEffects, effectDefs]);

  useEffect(() => {
    localStorage.setItem('entityPicker.filter', activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    localStorage.setItem('entityPicker.sort', sortBy);
  }, [sortBy]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setSearch('');
    }
  }, [isOpen, potion?.instanceId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSelect = useCallback((entity: any) => {
    setSelectedId((prev) => (prev === entity.id ? null : entity.id));
  }, []);

  const selectedDisabled = !!selectedId && disabledIds.includes(selectedId);

  useEffect(() => {
    if (selectedDisabled) setSelectedId(null);
  }, [selectedDisabled]);

  const handleConfirm = useCallback(() => {
    if (!selectedId) return;
    if (disabledIds.includes(selectedId)) return;
    const entity = entities.find((e: any) => e.id === selectedId);
    if (!entity) return;
    onSelectEntity(selectedId, entity);
  }, [selectedId, disabledIds, entities, onSelectEntity]);

  if (!isOpen || !potion) return null;

  const potionName: string = potion?.name ?? potion?.definition?.name ?? 'Potion';
  const potionIconKey: string | null =
    potion?.iconKey ?? potion?.definition?.iconKey ?? potion?.icon ?? null;

  const noEntities = entities.length === 0;

  return (
    <div className="modal-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="modal-box max-w-[480px]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose Target Entity"
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>

        <div className="px-6 pt-[22px] pb-3 text-center shrink-0">
          <h2 className="text-sm font-extrabold tracking-[1px] mb-3 text-slate-400 uppercase [font-family:'Exo_2',system-ui,sans-serif] m-0">
            Apply To Entity
          </h2>
          <div className="flex items-center gap-3 py-2.5 px-3 bg-purple-500/[0.08] border border-purple-500/20 rounded-xl text-left">
            {potionIconKey && (
              <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0 p-0.5">
                <GameIcon src={potionIconKey} size={28} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-[#e2e8f0] m-0">{potionName}</p>
              {summary && <p className="text-xs text-[#c4b5fd] mt-0.5 leading-[1.3] m-0">{summary}</p>}
            </div>
          </div>
        </div>

        <div className="epm-body flex-1 min-h-[200px] flex flex-col px-3 pt-1 pb-0 overflow-y-auto">
          {noEntities ? (
            <div className="py-8 px-4 text-slate-400 text-[13px] text-center leading-[1.4]">
              You don't own any entities yet. Earn one to use entity-targeted potions.
            </div>
          ) : (
            <>
              <EntityList
                entities={entities as any[]}
                mode="picker"
                useCase="potion-picker"
                showControls
                search={search}
                onSearchChange={setSearch}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                sortBy={sortBy}
                onSortChange={setSortBy}
                selectedIds={selectedId ? [selectedId] : []}
                disabledIds={disabledIds}
                onSelect={handleSelect}
                emptyMessage="No entities to show."
              />
              {disabledIds.length > 0 && (
                <p className="mt-2 mx-1 text-[11px] italic text-red-400/85 text-center">{BUSY_CONSUMABLE_TOOLTIP}</p>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn--apply"
            onClick={handleConfirm}
            disabled={!selectedId || selectedDisabled}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
