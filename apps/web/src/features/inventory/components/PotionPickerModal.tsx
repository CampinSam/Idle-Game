import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSyncItems } from '../../../hooks/useSyncSelectors';
import { useCommand } from '../../../hooks/useCommand';
import { useModal } from '../../../context/ModalContext';
import ItemList from './ItemList';
import './PotionPickerModal.css';

export interface PotionPickerModalProps {
  isOpen: boolean;
  entityId: string;
  entityName?: string;
  onClose: () => void;
}

export default function PotionPickerModal({
  isOpen,
  entityId,
  entityName,
  onClose,
}: PotionPickerModalProps) {
  const items = useSyncItems();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });

  const potions = useMemo(() => {
    return items.map((i: any) => ({
      ...i,
      ...(i.definition || {}),
      instanceId: i.id,
    }));
  }, [items]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return potions.find((p: any) => p.instanceId === selectedId) || null;
  }, [potions, selectedId]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setApplying(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setError(null);
  }, [selectedId]);

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

  const handleApply = useCallback(async () => {
    if (!selected || applying) return;
    setApplying(true);
    setError(null);
    try {
      await execute('UseConsumable', {
        itemInstanceId: selected.instanceId,
        targetId: entityId,
      });
      onClose();
    } catch (err: any) {
      console.error('[PotionPickerModal] UseConsumable failed:', err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Could not apply potion. Please try again.';
      setError(typeof message === 'string' ? message : 'Could not apply potion.');
    } finally {
      setApplying(false);
    }
  }, [selected, applying, execute, entityId, onClose]);

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
        aria-label="Apply Potion"
      >
        <button
          className="potion-picker-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="potion-picker-modal__header">
          <h2 className="potion-picker-modal__title">Apply Potion</h2>
          {entityName && (
            <p className="potion-picker-modal__subtitle">to {entityName}</p>
          )}
        </div>

        <div className="potion-picker-modal__body">
          <ItemList
            items={potions}
            mode="picker"
            useCase="potion-picker"
            typeFilter={['CONSUMABLE']}
            selectedId={selectedId}
            onSelect={handleSelect}
            emptyMessage="No potions in inventory"
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

        {error && (
          <div className="potion-picker-modal__error" role="alert">
            {error}
          </div>
        )}

        <div className="potion-picker-modal__footer">
          <button
            type="button"
            className="potion-picker-modal__btn potion-picker-modal__btn--cancel"
            onClick={onClose}
            disabled={applying}
          >
            Cancel
          </button>
          <button
            type="button"
            className="potion-picker-modal__btn potion-picker-modal__btn--apply"
            onClick={handleApply}
            disabled={!selected || applying}
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
