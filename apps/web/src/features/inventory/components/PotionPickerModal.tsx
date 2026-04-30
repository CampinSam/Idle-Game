import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSyncItems } from '../../../hooks/useSyncSelectors';
import ItemList from './ItemList';
import { isEntityTargetedConsumable } from '../utils/isEntityTargetedConsumable';
import './PotionPickerModal.css';

export interface PotionPickerModalProps {
  isOpen: boolean;
  entityId: string;
  entityName?: string;
  onClose: () => void;
  /**
   * Called when the player picks a potion and confirms. The parent should
   * close this modal and open the Use-Potion confirmation/result flow with
   * the chosen potion + entityId. This decouples picking from applying so
   * all entry points share the same confirm/result UX.
   */
  onSelectPotion: (potion: any) => void;
}

export default function PotionPickerModal({
  isOpen,
  entityId: _entityId,
  entityName,
  onClose,
  onSelectPotion,
}: PotionPickerModalProps) {
  const items = useSyncItems();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const potions = useMemo(() => {
    return items.map((i: any) => ({
      ...i,
      ...(i.definition || {}),
      instanceId: i.id,
    }));
  }, [items]);

  const allConsumables = useMemo(
    () => potions.filter((p: any) => p.type === 'CONSUMABLE'),
    [potions],
  );

  const entityTargetedPotions = useMemo(
    () => allConsumables.filter(isEntityTargetedConsumable),
    [allConsumables],
  );

  const emptyMessage =
    allConsumables.length === 0
      ? 'No potions in inventory'
      : 'No entity-targeted potions in inventory';

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return entityTargetedPotions.find((p: any) => p.instanceId === selectedId) || null;
  }, [entityTargetedPotions, selectedId]);

  useEffect(() => {
    if (!isOpen) setSelectedId(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSelect = useCallback((item: any) => {
    setSelectedId((prev) => (prev === item.instanceId ? null : item.instanceId));
  }, []);

  const handleApply = useCallback(() => {
    if (!selected) return;
    onSelectPotion(selected);
  }, [selected, onSelectPotion]);

  if (!isOpen) return null;

  return (
    <div
      className="potion-picker-modal__overlay"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="potion-picker-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pick Potion"
      >
        <button
          className="potion-picker-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="potion-picker-modal__header">
          <h2 className="potion-picker-modal__title">Pick Potion</h2>
          {entityName && (
            <p className="potion-picker-modal__subtitle">to apply on {entityName}</p>
          )}
        </div>

        <div className="potion-picker-modal__body">
          <ItemList
            items={entityTargetedPotions}
            mode="picker"
            useCase="potion-picker"
            selectedId={selectedId}
            onSelect={handleSelect}
            emptyMessage={emptyMessage}
          />
        </div>

        {selected && (
          <div className="potion-picker-modal__selected">
            <p className="potion-picker-modal__selected-name">{selected.name}</p>
            {selected.description && (
              <p className="potion-picker-modal__selected-desc">{selected.description}</p>
            )}
          </div>
        )}

        <div className="potion-picker-modal__footer">
          <button
            type="button"
            className="potion-picker-modal__btn potion-picker-modal__btn--cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="potion-picker-modal__btn potion-picker-modal__btn--apply"
            onClick={handleApply}
            disabled={!selected}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
