import { useMemo, useState, useCallback } from 'react';
import { useAnimatedProgress } from './useAnimatedProgress';
import { GameImage } from '../../../../components/GameImage';
import GameIcon from '../../../../components/GameIcon';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../../../config/images';
import { getArchetypeDisplay, TRAIT_SLOT_DISPLAY } from '@derp/shared';
import { getEntityArchetype } from '../../registry';
import { getEntityPower, getXpForLevel, normalizeStats } from '../../utils';
import { useSyncItems } from '../../../../hooks/useSyncSelectors';
import { useCommand } from '../../../../hooks/useCommand';
import { useModal } from '../../../../context/ModalContext';
import StatRadarChart from './StatRadarChart';
import DefaultEntityCard from './DefaultEntityCard';
import EquipPickerModal from '../../components/EquipPickerModal';
import {
  isEntityBusy,
  gearWouldChangeStats,
  BUSY_EQUIP_TOOLTIP,
} from '../../../inventory/utils/statChangeHelpers';
import type { EntityDetailProps } from '../../types';

const TRAIT_SLOT_ORDER = ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'] as const;
const PROGRESSION_TABS = ['LEVEL', 'ASCENSION', 'MASTERY', 'RELICS', 'HISTORY'] as const;
type ProgressionTab = typeof PROGRESSION_TABS[number];

const MAX_LEVEL = 50;

const EQUIP_SLOTS = [
  { icon: '⚔️', label: 'WEAPON', slot: 'weapon' },
  { icon: '🛡️', label: 'ARMOR', slot: 'armor' },
  { icon: '💍', label: 'ACCESSORY', slot: 'accessory' },
] as const;

type EquipSlot = typeof EQUIP_SLOTS[number]['slot'];

export default function DefaultEntityDetail(props: EntityDetailProps) {
  const { entity, variant = 'full', useCase = 'mission', onRemove } = props;

  if (variant === 'lightweight') {
    return (
      <DefaultEntityCard
        entity={entity}
        useCase={useCase}
        onRemove={onRemove}
      />
    );
  }

  return <FullEntityDetail entity={entity} portraitBadge={props.portraitBadge} />;
}

function FullEntityDetail({ entity, portraitBadge }: { entity: EntityDetailProps['entity']; portraitBadge?: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<ProgressionTab>('LEVEL');
  const [pickerSlot, setPickerSlot] = useState<EquipSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const progress = useAnimatedProgress(800);
  const allItems = useSyncItems();
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });

  const archetype = getEntityArchetype(entity);
  const archetypeDisplay = getArchetypeDisplay(archetype || 'default');
  const power = getEntityPower(entity);
  const baseStats = useMemo(
    () => (entity as any).baseStats || normalizeStats(entity.stats),
    [entity],
  );
  const equippedStats = (entity as any).equippedStats as Record<string, number> | undefined;
  const traits = (entity.traits || {}) as Partial<Record<typeof TRAIT_SLOT_ORDER[number], string>>;
  const entityBusy = isEntityBusy(entity);

  const equippedBySlot = useMemo(() => {
    const map: Record<string, any> = {};
    const equipment: any[] = Array.isArray((entity as any).equipment) ? (entity as any).equipment : [];
    for (const eq of equipment) {
      const item = (allItems as any[]).find((i) => i.id === eq.itemInstanceId);
      if (!item) continue;
      const equipData = item.definition?.equipData;
      const slot: string | undefined = equipData?.slot;
      if (!slot) continue;
      if (!map[slot]) map[slot] = item;
    }
    return map;
  }, [entity, allItems]);

  const handleSlotClick = useCallback((slot: EquipSlot) => {
    if (busy) return;
    const occupant = equippedBySlot[slot];
    if (occupant) {
      setBusy(true);
      execute('UnequipItem', { entityId: entity.id, itemInstanceId: occupant.id })
        .catch((err) => console.error('[EntityDetail] UnequipItem failed:', err))
        .finally(() => setBusy(false));
      return;
    }
    setPickerSlot(slot);
  }, [busy, equippedBySlot, execute, entity.id]);

  const handlePickerSelect = useCallback((itemInstanceId: string) => {
    if (!pickerSlot) return;
    setBusy(true);
    setPickerSlot(null);
    execute('EquipItem', { entityId: entity.id, itemInstanceId })
      .catch((err) => console.error('[EntityDetail] EquipItem failed:', err))
      .finally(() => setBusy(false));
  }, [pickerSlot, execute, entity.id]);

  const rawXpMax = getXpForLevel(entity.level);
  const xpMax = rawXpMax > 0 ? rawXpMax : 100;
  const xpCurrent = Number(entity.xp || 0);
  const xpPercent = xpMax > 0 ? Math.min((xpCurrent / xpMax) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-[10px]">

      {/* ── Top section: portrait card + power/radar ── */}
      <div className="grid grid-cols-2 gap-[10px] items-stretch">

        {/* Portrait card — entity-detail__hero retained as CSS hook for variant ::after overlays */}
        <div className="entity-detail__hero [background:linear-gradient(160deg,#1a1640_0%,#1e1850_100%)] border border-[rgba(139,92,246,0.2)] rounded-[14px] overflow-hidden flex flex-col items-center p-[6px] gap-[6px] relative">
          {/* Level badge overlaps portrait */}
          <div className="absolute top-2 left-2 flex items-center gap-[3px] bg-[rgba(0,0,0,0.65)] border border-[rgba(139,92,246,0.6)] rounded-[20px] px-2 py-[3px] z-[3]">
            <span className="text-[11px]">⚡</span>
            <span className="text-[10px] font-black text-white tracking-[0.5px]">LEVEL {entity.level}</span>
          </div>

          {portraitBadge}

          <div className="flex-1 flex items-start justify-center w-full">
            <GameImage
              src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'full')}
              placeholderSrc={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
              category="entities"
              alt={entity.name}
              fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
              className="!w-full !h-auto object-contain !rounded-[6px]"
              glow
              glowColor={archetypeDisplay.color}
            />
          </div>

          {/* Equipment slots */}
          <div className="flex gap-[6px] w-full">
            {EQUIP_SLOTS.map(({ icon, label, slot }) => {
              const occupant = equippedBySlot[slot];
              const occupantIcon = occupant?.definition?.iconKey ?? null;
              const occupantName = occupant?.definition?.name ?? '';
              const filled = !!occupant;
              const blockedByBusy =
                entityBusy && filled && gearWouldChangeStats(occupant);
              const slotDisabled = busy || blockedByBusy;
              const slotTitle = blockedByBusy
                ? BUSY_EQUIP_TOOLTIP
                : filled
                  ? `${occupantName} — tap to unequip`
                  : `Equip ${label.toLowerCase()}`;

              const slotCls = [
                'flex-1 aspect-square relative flex items-center justify-center',
                'bg-[#0e0c1e] rounded-[10px] cursor-pointer overflow-hidden',
                '[transition:border-color_0.15s,background_0.15s]',
                filled
                  ? 'border-[1.5px] border-solid border-[rgba(245,158,11,0.7)] bg-[rgba(245,158,11,0.08)]'
                  : 'border-[1.5px] border-dashed border-[rgba(255,255,255,0.25)]',
                blockedByBusy
                  ? 'cursor-not-allowed opacity-40 grayscale-[0.7] !border-dashed !border-[rgba(255,255,255,0.15)] !bg-[#0e0c1e]'
                  : 'enabled:hover:border-[rgba(139,92,246,0.7)] enabled:hover:bg-[rgba(139,92,246,0.1)]',
                !blockedByBusy && slotDisabled && 'cursor-wait opacity-60',
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={label}
                  className={slotCls}
                  type="button"
                  aria-label={filled ? `Unequip ${occupantName}` : `Equip ${label}`}
                  aria-disabled={slotDisabled}
                  title={slotTitle}
                  disabled={slotDisabled}
                  onClick={() => handleSlotClick(slot)}
                >
                  {filled && occupantIcon ? (
                    <GameIcon src={occupantIcon} size={32} />
                  ) : (
                    <span className="text-[20px] opacity-50 leading-none">{icon}</span>
                  )}
                  <span className={[
                    'absolute bottom-[3px] right-[5px] text-xs font-black leading-none',
                    filled ? 'text-[rgba(248,113,113,0.95)]' : 'text-[rgba(255,255,255,0.6)]',
                  ].join(' ')}>{filled ? '×' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Power score + divider + radar */}
        <div className="[background:linear-gradient(160deg,#1a1640_0%,#1e1850_100%)] border border-[rgba(139,92,246,0.2)] rounded-[14px] pt-3 px-[10px] pb-2 flex flex-col">
          <div className="flex flex-col">
            <div className="text-[10px] font-extrabold tracking-[1px] text-[rgba(255,255,255,0.6)] mb-[2px]">POWER SCORE</div>
            <div className="text-[32px] font-black text-[#F59E0B] leading-none tracking-[-0.5px]">{(power * progress).toFixed(2)}</div>
          </div>

          <div className="h-px bg-[rgba(139,92,246,0.2)] mt-1" />

          <div className="flex justify-center items-center flex-1 pt-[10px]">
            <StatRadarChart
              stats={baseStats}
              equippedStats={equippedStats}
              size={155}
              progress={progress}
            />
          </div>
        </div>
      </div>

      <EquipPickerModal
        isOpen={pickerSlot !== null}
        slot={pickerSlot}
        entityId={entity.id}
        onClose={() => setPickerSlot(null)}
        onSelect={handlePickerSelect}
      />

      {/* ── Middle section: progression tabs + body slots ── */}
      <div className="grid grid-cols-2 gap-[10px] items-stretch">

        {/* Progression tab panel */}
        <div className="[background:linear-gradient(160deg,#1a1640_0%,#1e1850_100%)] border border-[rgba(139,92,246,0.2)] rounded-[14px] overflow-hidden flex flex-col">
          <div
            className="flex border-b border-[rgba(139,92,246,0.2)] overflow-x-auto shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
          >
            {PROGRESSION_TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={[
                  'flex-none py-2 px-2 text-[8px] font-extrabold tracking-[0.4px] bg-transparent border-none',
                  'border-b-2 cursor-pointer whitespace-nowrap text-center',
                  '[transition:color_0.15s,border-color_0.15s]',
                  activeTab === tab
                    ? 'text-[#A78BFA] border-b-[#A78BFA]'
                    : 'text-[rgba(255,255,255,0.45)] border-b-transparent',
                ].join(' ')}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-[10px] flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.3)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.3)] [&::-webkit-scrollbar-thumb]:rounded-[2px]">
            {activeTab === 'LEVEL' ? (
              <div className="flex flex-col gap-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[rgba(255,255,255,0.55)]">Current Level</span>
                  <span className="text-xs font-extrabold text-white">{entity.level} / {MAX_LEVEL}</span>
                </div>
                <div className="flex flex-col items-stretch gap-[5px]">
                  <span className="text-[11px] text-[rgba(255,255,255,0.55)]">XP</span>
                  <div className="h-[7px] bg-[rgba(255,255,255,0.08)] rounded-[4px] overflow-hidden">
                    <div
                      className="h-full [background:linear-gradient(90deg,#7C3AED,#A78BFA)] rounded-[4px]"
                      style={{ width: `${xpPercent * progress}%`, transition: 'none' }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-[rgba(255,255,255,0.45)] text-right">{xpCurrent} / {xpMax}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[rgba(255,255,255,0.55)]">Stat Growth</span>
                  <span className="text-xs font-extrabold text-white">Normal</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-5 text-[rgba(255,255,255,0.35)] text-xs italic">
                <span className="text-[22px]">🔒</span>
                <span>Coming soon</span>
              </div>
            )}
          </div>
        </div>

        {/* Body slots & traits */}
        <div className="[background:linear-gradient(160deg,#1a1640_0%,#1e1850_100%)] border border-[rgba(139,92,246,0.2)] rounded-[14px] p-[10px] flex flex-col">
          <div className="text-[9px] font-extrabold tracking-[1px] text-[rgba(255,255,255,0.55)] mb-1.5">BODY SLOTS &amp; TRAITS</div>
          <div className="h-px bg-[rgba(139,92,246,0.2)] mb-[4px]" />
          {TRAIT_SLOT_ORDER.map((slot) => {
            const value = traits[slot];
            const archetypeColor = value
              ? (getArchetypeDisplay(value)?.color ?? '#A78BFA')
              : 'rgba(255,255,255,0.3)';
            const displayValue = value
              ? value.replace(/\b\w/g, (c) => c.toUpperCase())
              : '—';
            return (
              <div key={slot} className="grid grid-cols-2 items-center py-1 border-b border-[rgba(255,255,255,0.06)] last:border-b-0 last:pb-0 first:pt-0">
                <span className="text-[11px] text-[rgba(255,255,255,0.6)] font-semibold">{slot.charAt(0).toUpperCase() + slot.slice(1)}</span>
                <span className="text-[11px] font-extrabold text-right" style={{ color: archetypeColor }}>
                  {displayValue}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
