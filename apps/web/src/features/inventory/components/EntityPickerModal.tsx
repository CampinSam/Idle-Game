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
import './EntityPickerModal.css';

export interface EntityPickerModalProps {
  isOpen: boolean;
  /** The consumable item to apply (already normalised with definition spread). */
  potion: any | null;
  onClose: () => void;
  /** Called with the chosen entity id once the player confirms. */
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

  // Server rejects stat-changing consumables on busy entities (Task #182).
  // Compute the disabled-id set so the picker visibly greys out wearers
  // that the command would refuse, instead of letting the player tap and
  // bottom out on a toast. Heal / XP / non-stat potions leave every
  // entity selectable.
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

  // If the selected entity flips to busy while the modal is open (e.g. SSE
  // delta starts a mission for them), drop the selection so the player
  // can't bottom out on a server rejection by tapping Continue.
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
    <div
      className="epm-overlay"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="epm-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose Target Entity"
      >
        <button
          className="epm-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="epm-header">
          <h2 className="epm-title">Apply To Entity</h2>
          <div className="epm-potion-row">
            {potionIconKey && (
              <div className="epm-potion-icon">
                <GameIcon src={potionIconKey} size={28} />
              </div>
            )}
            <div className="epm-potion-text">
              <p className="epm-potion-name">{potionName}</p>
              {summary && <p className="epm-potion-summary">{summary}</p>}
            </div>
          </div>
        </div>

        <div className="epm-body">
          {noEntities ? (
            <div className="epm-empty">
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
                <p className="epm-busy-hint">{BUSY_CONSUMABLE_TOOLTIP}</p>
              )}
            </>
          )}
        </div>

        <div className="epm-footer">
          <button
            type="button"
            className="epm-btn epm-btn--cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="epm-btn epm-btn--apply"
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
