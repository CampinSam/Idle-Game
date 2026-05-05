import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSyncItems } from '../../../hooks/useSyncSelectors';
import GameIcon from '../../../components/GameIcon';
import './EquipPickerModal.css';

const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;

export interface EquipPickerModalProps {
  isOpen: boolean;
  /** The slot the player is filling (e.g. 'weapon' / 'armor' / 'accessory'). */
  slot: string | null;
  /** The entity that will receive the equipment. Used to skip its own equipped items. */
  entityId: string | null;
  onClose: () => void;
  /** Called with the chosen item instance once the player confirms. */
  onSelect: (itemInstanceId: string, item: any) => void;
}

function getEquipData(item: any): any {
  return item?.equipData ?? item?.definition?.equipData ?? null;
}

function getItemSlot(item: any): string | null {
  const eq = getEquipData(item);
  return eq?.slot ?? null;
}

function getItemName(item: any): string {
  return item?.name ?? item?.definition?.name ?? 'Item';
}

function getItemIconKey(item: any): string | null {
  return item?.iconKey ?? item?.definition?.iconKey ?? null;
}

function getItemRarity(item: any): string | null {
  return item?.rarity ?? item?.definition?.rarity ?? null;
}

function summarizeStats(item: any): string {
  const eq = getEquipData(item);
  const stats = eq?.stats || {};
  const parts: string[] = [];
  for (const k of STAT_KEYS) {
    const v = stats[k];
    if (typeof v === 'number' && v !== 0) parts.push(`${v > 0 ? '+' : ''}${v} ${k}`);
  }
  return parts.join(' · ');
}

export default function EquipPickerModal({
  isOpen,
  slot,
  entityId,
  onClose,
  onSelect,
}: EquipPickerModalProps) {
  const items = useSyncItems();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setSelectedId(null);
  }, [isOpen, slot]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const candidates = useMemo(() => {
    if (!slot) return [];
    return (items as any[])
      .filter((it) => {
        const def = it.definition;
        if (!def || def.type !== 'GEAR') return false;
        if (getItemSlot(it) !== slot) return false;
        // Hide items already equipped to *this* entity in this slot — those
        // are no-ops and would just confuse the player. Items equipped
        // elsewhere are also hidden so we don't suggest a swap-from-other.
        if (it.equippedToId && it.equippedToId !== entityId) return false;
        if (it.equippedToId === entityId) return false;
        return true;
      })
      .sort((a, b) => getItemName(a).localeCompare(getItemName(b)));
  }, [items, slot, entityId]);

  const handleConfirm = useCallback(() => {
    if (!selectedId) return;
    const item = candidates.find((c) => c.id === selectedId);
    if (!item) return;
    onSelect(selectedId, item);
  }, [selectedId, candidates, onSelect]);

  if (!isOpen || !slot) return null;

  const slotLabel = slot.toUpperCase();

  return (
    <div className="epm-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="epm-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Equip ${slotLabel}`}
      >
        <button className="epm-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="epm-header">
          <h2 className="epm-title">Equip {slotLabel}</h2>
        </div>

        <div className="equip-picker-body">
          {candidates.length === 0 ? (
            <div className="epm-empty">
              No unequipped {slot} items in your inventory.
            </div>
          ) : (
            <ul className="equip-picker-list" role="listbox" aria-label={`${slotLabel} candidates`}>
              {candidates.map((item) => {
                const isSelected = selectedId === item.id;
                const iconKey = getItemIconKey(item);
                const rarity = getItemRarity(item);
                const statsLine = summarizeStats(item);
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    className={`equip-picker-row${isSelected ? ' equip-picker-row--selected' : ''}`}
                    onClick={() => setSelectedId((p) => (p === item.id ? null : item.id))}
                  >
                    <div className={`equip-picker-icon equip-picker-icon--${(rarity || 'common').toLowerCase()}`}>
                      {iconKey ? <GameIcon src={iconKey} size={32} /> : <span>?</span>}
                    </div>
                    <div className="equip-picker-info">
                      <div className="equip-picker-name">{getItemName(item)}</div>
                      <div className="equip-picker-meta">
                        {rarity && <span className={`equip-picker-rarity equip-picker-rarity--${rarity.toLowerCase()}`}>{rarity}</span>}
                        {statsLine && <span className="equip-picker-stats">{statsLine}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="epm-footer">
          <button type="button" className="epm-btn epm-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="epm-btn epm-btn--apply"
            onClick={handleConfirm}
            disabled={!selectedId}
          >
            Equip
          </button>
        </div>
      </div>
    </div>
  );
}
