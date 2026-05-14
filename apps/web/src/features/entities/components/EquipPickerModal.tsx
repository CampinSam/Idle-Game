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
  /** The item currently occupying this slot, used for delta comparison. */
  equippedItem?: any;
  onClose: () => void;
  onSelect: (itemInstanceId: string, item: any) => void;
  /** Called when the player hovers over a candidate item (or null when leaving). */
  onHover?: (item: any | null) => void;
  /** Called when the player chooses to unequip the current occupant. Only shown when equippedItem is provided. */
  onUnequip?: () => void;
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

function getItemStats(item: any): Record<string, number> {
  return getEquipData(item)?.stats ?? {};
}

/** Returns [{key, delta}] for stats that differ between candidate and equipped. */
function computeStatDeltas(
  candidate: any,
  equipped: any | null,
): Array<{ key: string; delta: number }> {
  const cStats = getItemStats(candidate);
  const eStats = equipped ? getItemStats(equipped) : {};
  const results: Array<{ key: string; delta: number }> = [];
  for (const k of STAT_KEYS) {
    const cv = typeof cStats[k] === 'number' ? cStats[k] : 0;
    const ev = typeof eStats[k] === 'number' ? eStats[k] : 0;
    const delta = cv - ev;
    if (delta !== 0) results.push({ key: k, delta });
  }
  return results;
}

/** Compact summary of the item's own stats (no comparison). */
function summarizeStats(item: any): string {
  const stats = getItemStats(item);
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
  equippedItem,
  onClose,
  onSelect,
  onHover,
  onUnequip,
}: EquipPickerModalProps) {
  const items = useSyncItems();
  const entities = useSyncEntities();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const targetEntity = useMemo(
    () => (entities as any[]).find((e) => e.id === entityId) || null,
    [entities, entityId],
  );
  const targetBusy = isEntityBusy(targetEntity);

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setHoveredId(null);
      onHover?.(null);
    }
  }, [isOpen, slot, onHover]);

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

  const handleMouseEnter = useCallback(
    (item: any) => {
      setHoveredId(item.id);
      onHover?.(item);
    },
    [onHover],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
    onHover?.(null);
  }, [onHover]);

  if (!isOpen || !slot) return null;

  const slotLabel = slot.toUpperCase();
  const hasEquipped = !!equippedItem;

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
          <h2 className="text-sm font-extrabold tracking-[1px] mb-1 text-slate-400 uppercase [font-family:'Exo_2',system-ui,sans-serif] m-0">
            {hasEquipped ? `Replace ${slotLabel}` : `Equip ${slotLabel}`}
          </h2>
          {hasEquipped && (
            <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-1 m-0">
              Stat changes shown vs currently equipped item
            </p>
          )}
        </div>

        {hasEquipped && (
          <div className="px-3.5 pb-2 shrink-0">
            <div className="text-[9px] font-extrabold tracking-[1px] text-[rgba(255,255,255,0.35)] uppercase mb-1.5 px-1">
              Currently Equipped
            </div>
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.25)]">
              <div className="w-[36px] h-[36px] rounded-lg bg-[rgba(0,0,0,0.35)] flex items-center justify-center shrink-0 border border-[rgba(255,255,255,0.08)]">
                {getItemIconKey(equippedItem) ? (
                  <GameIcon src={getItemIconKey(equippedItem)!} size={26} />
                ) : (
                  <span>?</span>
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                <div className="text-[12px] font-extrabold text-[#fbbf24] whitespace-nowrap overflow-hidden text-ellipsis">
                  {getItemName(equippedItem)}
                </div>
                <div className="text-[10px] text-[rgba(255,255,255,0.45)]">
                  {summarizeStats(equippedItem) || 'No stats'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-[200px] px-3.5 pb-1 pt-2 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="py-8 px-4 text-slate-400 text-[13px] text-center leading-[1.4]">
              {hasEquipped
                ? `No replacement ${slot} items in your inventory. Use Unequip to remove the current item.`
                : `No unequipped ${slot} items in your inventory.`}
            </div>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-1.5" role="listbox" aria-label={`${slotLabel} candidates`}>
              {candidates.map((item) => {
                const isSelected = selectedId === item.id;
                const isHovered = hoveredId === item.id;
                const iconKey = getItemIconKey(item);
                const rarity = getItemRarity(item);
                const blocked = isItemBlocked(item);
                const deltas = hasEquipped ? computeStatDeltas(item, equippedItem) : null;
                const absoluteStats = !hasEquipped ? summarizeStats(item) : '';

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
                        : isHovered
                          ? 'bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.45)]'
                          : 'bg-[rgba(139,92,246,0.06)] border border-[rgba(139,92,246,0.18)] hover:bg-[rgba(139,92,246,0.12)]',
                      blocked ? 'cursor-not-allowed opacity-45 grayscale-[60%] !bg-[rgba(139,92,246,0.04)] !border-[rgba(139,92,246,0.12)]' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      if (blocked) return;
                      setSelectedId((p) => (p === item.id ? null : item.id));
                    }}
                    onMouseEnter={() => !blocked && handleMouseEnter(item)}
                    onMouseLeave={() => !blocked && handleMouseLeave()}
                  >
                    <div className="w-[42px] h-[42px] rounded-lg bg-[rgba(0,0,0,0.35)] flex items-center justify-center shrink-0 border border-[rgba(255,255,255,0.08)]">
                      {iconKey ? <GameIcon src={iconKey} size={32} /> : <span>?</span>}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                      <div className="text-[13px] font-extrabold text-[#e2e8f0] whitespace-nowrap overflow-hidden text-ellipsis">
                        {getItemName(item)}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {rarity && (
                          <span className={`font-extrabold tracking-[0.4px] uppercase text-[10px] ${rarityTextClass(rarity)}`}>
                            {rarity}
                          </span>
                        )}
                        {hasEquipped && deltas ? (
                          deltas.length === 0 ? (
                            <span className="text-[11px] text-[rgba(255,255,255,0.3)] italic">No change</span>
                          ) : (
                            <span className="flex items-center gap-1 flex-wrap">
                              {deltas.map(({ key, delta }) => (
                                <span
                                  key={key}
                                  className={[
                                    'text-[11px] font-bold',
                                    delta > 0 ? 'text-[#4ade80]' : 'text-[#f87171]',
                                  ].join(' ')}
                                >
                                  {delta > 0 ? `+${delta}` : delta} {key}
                                </span>
                              ))}
                            </span>
                          )
                        ) : absoluteStats ? (
                          <span className="text-[11px] text-[#fbbf24] font-bold">{absoluteStats}</span>
                        ) : null}
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
          {hasEquipped && onUnequip && (
            <button
              type="button"
              className="modal-btn modal-btn--cancel text-[#f87171] border-[rgba(248,113,113,0.4)] hover:bg-[rgba(248,113,113,0.08)]"
              onClick={onUnequip}
              title="Remove currently equipped item"
            >
              Unequip
            </button>
          )}
          <button
            type="button"
            className="modal-btn modal-btn--apply"
            onClick={handleConfirm}
            disabled={!selectedId || selectedBlocked}
            title={selectedBlocked ? BUSY_EQUIP_TOOLTIP : undefined}
          >
            {hasEquipped ? 'Replace' : 'Equip'}
          </button>
        </div>
      </div>
    </div>
  );
}
