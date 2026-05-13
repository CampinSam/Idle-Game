import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSyncItems, useSyncEntities } from '../../../hooks/useSyncSelectors';
import GameIcon from '../../../components/GameIcon';
import {
  isEntityBusy,
  gearWouldChangeStats,
  BUSY_EQUIP_TOOLTIP,
} from '../../inventory/utils/statChangeHelpers';
import { rarityTextClass } from '../../../utils/rarityColors';

const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;

export interface EquipPickerModalProps {
  isOpen: boolean;
  slot: string | null;
  entityId: string | null;
  onClose: () => void;
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
  const entities = useSyncEntities();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const targetEntity = useMemo(
    () => (entities as any[]).find((e) => e.id === entityId) || null,
    [entities, entityId],
  );
  const targetBusy = isEntityBusy(targetEntity);

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
    if (targetBusy && gearWouldChangeStats(item)) return;
    onSelect(selectedId, item);
  }, [selectedId, candidates, onSelect, targetBusy]);

  const isItemBlocked = useCallback(
    (item: any) => targetBusy && gearWouldChangeStats(item),
    [targetBusy],
  );

  const selectedBlocked = useMemo(() => {
    if (!selectedId) return false;
    const item = candidates.find((c) => c.id === selectedId);
    return !!item && isItemBlocked(item);
  }, [selectedId, candidates, isItemBlocked]);

  if (!isOpen || !slot) return null;

  const slotLabel = slot.toUpperCase();

  return (
    <div className="modal-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="modal-box max-w-[480px]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Equip ${slotLabel}`}
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>

        <div className="px-6 pt-[22px] pb-3 text-center shrink-0">
          <h2 className="text-sm font-extrabold tracking-[1px] mb-3 text-slate-400 uppercase [font-family:'Exo_2',system-ui,sans-serif] m-0">
            Equip {slotLabel}
          </h2>
        </div>

        <div className="flex-1 min-h-[200px] px-3.5 pb-1 pt-2 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="py-8 px-4 text-slate-400 text-[13px] text-center leading-[1.4]">
              No unequipped {slot} items in your inventory.
            </div>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-1.5" role="listbox" aria-label={`${slotLabel} candidates`}>
              {candidates.map((item) => {
                const isSelected = selectedId === item.id;
                const iconKey = getItemIconKey(item);
                const rarity = getItemRarity(item);
                const statsLine = summarizeStats(item);
                const blocked = isItemBlocked(item);
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={blocked}
                    title={blocked ? BUSY_EQUIP_TOOLTIP : undefined}
                    className={[
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] cursor-pointer transition-[background,border-color] duration-150',
                      isSelected
                        ? 'bg-[rgba(245,158,11,0.14)] border border-[rgba(245,158,11,0.6)] shadow-[0_0_0_1px_rgba(245,158,11,0.4)_inset]'
                        : 'bg-[rgba(139,92,246,0.06)] border border-[rgba(139,92,246,0.18)] hover:bg-[rgba(139,92,246,0.12)]',
                      blocked ? 'cursor-not-allowed opacity-45 grayscale-[60%] !bg-[rgba(139,92,246,0.04)] !border-[rgba(139,92,246,0.12)]' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      if (blocked) return;
                      setSelectedId((p) => (p === item.id ? null : item.id));
                    }}
                  >
                    <div className="w-[42px] h-[42px] rounded-lg bg-[rgba(0,0,0,0.35)] flex items-center justify-center shrink-0 border border-[rgba(255,255,255,0.08)]">
                      {iconKey ? <GameIcon src={iconKey} size={32} /> : <span>?</span>}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                      <div className="text-[13px] font-extrabold text-[#e2e8f0] whitespace-nowrap overflow-hidden text-ellipsis">
                        {getItemName(item)}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#c4b5fd]">
                        {rarity && (
                          <span className={`font-extrabold tracking-[0.4px] uppercase text-[10px] ${rarityTextClass(rarity)}`}>
                            {rarity}
                          </span>
                        )}
                        {statsLine && <span className="text-[#fbbf24] font-bold">{statsLine}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
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
            disabled={!selectedId || selectedBlocked}
            title={selectedBlocked ? BUSY_EQUIP_TOOLTIP : undefined}
          >
            Equip
          </button>
        </div>
      </div>
    </div>
  );
}
