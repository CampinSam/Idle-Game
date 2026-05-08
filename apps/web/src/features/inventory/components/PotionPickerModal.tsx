import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSyncItems } from '../../../hooks/useSyncSelectors';
import ItemList from './ItemList';
import { isEntityTargetedConsumable } from '../utils/isEntityTargetedConsumable';

export interface PotionPickerModalProps {
  isOpen: boolean;
  entityId: string;
  entityName?: string;
  onClose: () => void;
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
    <div className="modal-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="modal-box max-w-[420px]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pick Potion"
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>

        <div className="px-6 pt-[22px] pb-[14px] text-center shrink-0">
          <h2 className="text-lg font-black tracking-[0.8px] mb-1 text-[#e2e8f0] uppercase [font-family:'Exo_2',system-ui,sans-serif] m-0">
            Pick Potion
          </h2>
          {entityName && (
            <p className="text-xs text-slate-400 m-0">to apply on {entityName}</p>
          )}
        </div>

        <div className="flex-1 min-h-[200px] flex flex-col overflow-hidden">
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
          <div className="shrink-0 px-5 py-3 border-t border-purple-500/[0.18] bg-black/25">
            <p className="text-sm font-bold text-[#e2e8f0] m-0 mb-1">{selected.name}</p>
            {selected.description && (
              <p className="text-xs text-slate-400 leading-[1.4] m-0">{selected.description}</p>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn--apply"
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
