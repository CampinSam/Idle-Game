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
  // Server-resolved equipped overlay; falls back to base if absent so this
  // component still renders for legacy snapshots.
  const baseStats = useMemo(
    () => (entity as any).baseStats || normalizeStats(entity.stats),
    [entity],
  );
  const equippedStats = (entity as any).equippedStats as Record<string, number> | undefined;
  const traits = (entity.traits || {}) as Partial<Record<typeof TRAIT_SLOT_ORDER[number], string>>;
  const entityBusy = isEntityBusy(entity);

  // Build a slot → equipped item map by joining EntityEquipment rows
  // (shipped on the entity payload) against the sync `items` table. Looking
  // them up here keeps the per-slot tile a one-line read in the JSX below.
  const equippedBySlot = useMemo(() => {
    const map: Record<string, any> = {};
    const equipment: any[] = Array.isArray((entity as any).equipment) ? (entity as any).equipment : [];
    for (const eq of equipment) {
      const item = (allItems as any[]).find((i) => i.id === eq.itemInstanceId);
      if (!item) continue;
      const equipData = item.definition?.equipData;
      const slot: string | undefined = equipData?.slot;
      if (!slot) continue;
      // First-write wins per slot — accessory caps at 2 but the UI today
      // shows a single tile per slot. The picker shows count via "+N" in
      // the future; for now a single occupant is enough to convey "filled".
      if (!map[slot]) map[slot] = item;
    }
    return map;
  }, [entity, allItems]);

  const handleSlotClick = useCallback((slot: EquipSlot) => {
    if (busy) return;
    const occupant = equippedBySlot[slot];
    if (occupant) {
      // Tap-to-unequip when the slot is filled — keeps both equip and
      // unequip a single tap from the entity sheet. Picker stays closed.
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
    <div className="entity-detail">

      {/* ── Top section: portrait card + power/radar ── */}
      <div className="entity-detail__top">

        {/* Portrait card */}
        <div className="entity-detail__portrait-card">
          {/* Level badge overlaps portrait */}
          <div className="entity-detail__level-badge">
            <span className="entity-detail__level-badge-icon">⚡</span>
            <span className="entity-detail__level-badge-text">LEVEL {entity.level}</span>
          </div>

          {portraitBadge}

          <div className="entity-detail__portrait-wrap">
            <GameImage
              src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'full')}
              // Same thumb URL the entities list painted — already in the
              // browser cache on tap-through, so the detail page shows the
              // portrait on the first frame and the full-res image just
              // crossfades in once it finishes downloading.
              placeholderSrc={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
              category="entities"
              alt={entity.name}
              fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
              className="entity-detail__portrait"
              glow
              glowColor={archetypeDisplay.color}
            />
          </div>

          {/* Equipment slots — equal square, icon + overlapping "+" */}
          <div className="entity-detail__equip-row">
            {EQUIP_SLOTS.map(({ icon, label, slot }) => {
              const occupant = equippedBySlot[slot];
              const occupantIcon = occupant?.definition?.iconKey ?? null;
              const occupantName = occupant?.definition?.name ?? '';
              const filled = !!occupant;
              // Pre-emptive grey-out: server rejects unequip of stat-bearing
              // gear on a busy entity. We don't know what gear the player
              // would equip into an empty slot, so leave empty slots tappable
              // — the EquipPickerModal greys out individual stat-bearing
              // candidates when the entity is busy.
              const blockedByBusy =
                entityBusy && filled && gearWouldChangeStats(occupant);
              const slotDisabled = busy || blockedByBusy;
              const slotTitle = blockedByBusy
                ? BUSY_EQUIP_TOOLTIP
                : filled
                  ? `${occupantName} — tap to unequip`
                  : `Equip ${label.toLowerCase()}`;
              return (
                <button
                  key={label}
                  className={`entity-detail__equip-slot${filled ? ' entity-detail__equip-slot--filled' : ''}${blockedByBusy ? ' entity-detail__equip-slot--blocked' : ''}`}
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
                    <span className="entity-detail__equip-slot-icon">{icon}</span>
                  )}
                  <span className="entity-detail__equip-slot-plus">{filled ? '×' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Power score + divider + radar */}
        <div className="entity-detail__power-block">
          <div className="entity-detail__power-header">
            <div className="entity-detail__power-label">POWER SCORE</div>
            <div className="entity-detail__power-value">{(power * progress).toFixed(2)}</div>
          </div>

          <div className="entity-detail__power-divider" />

          <div className="entity-detail__radar-wrap">
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
      <div className="entity-detail__middle">

        {/* Progression tab panel */}
        <div className="entity-detail__prog-panel">
          <div className="entity-detail__prog-tabs" role="tablist">
            {PROGRESSION_TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`entity-detail__prog-tab${activeTab === tab ? ' entity-detail__prog-tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="entity-detail__prog-content">
            {activeTab === 'LEVEL' ? (
              <div className="entity-detail__level-tab">
                <div className="entity-detail__prog-row">
                  <span className="entity-detail__prog-row-label">Current Level</span>
                  <span className="entity-detail__prog-row-value">{entity.level} / {MAX_LEVEL}</span>
                </div>
                <div className="entity-detail__prog-row entity-detail__prog-row--xp">
                  <span className="entity-detail__prog-row-label">XP</span>
                  <div className="entity-detail__xp-bar-wrap">
                    <div className="entity-detail__xp-bar" style={{ width: `${xpPercent * progress}%` }} />
                  </div>
                  <span className="entity-detail__xp-nums">{xpCurrent} / {xpMax}</span>
                </div>
                <div className="entity-detail__prog-row">
                  <span className="entity-detail__prog-row-label">Stat Growth</span>
                  <span className="entity-detail__prog-row-value">Normal</span>
                </div>
              </div>
            ) : (
              <div className="entity-detail__prog-placeholder">
                <span className="entity-detail__prog-placeholder-icon">🔒</span>
                <span>Coming soon</span>
              </div>
            )}
          </div>
        </div>

        {/* Body slots & traits — no emojis, tighter rows */}
        <div className="entity-detail__body-slots">
          <div className="entity-detail__panel-title">BODY SLOTS &amp; TRAITS</div>
          <div className="entity-detail__power-divider" />
          {TRAIT_SLOT_ORDER.map((slot) => {
            const value = traits[slot];
            const archetypeColor = value
              ? (getArchetypeDisplay(value)?.color ?? '#A78BFA')
              : 'rgba(255,255,255,0.3)';
            const displayValue = value
              ? value.replace(/\b\w/g, (c) => c.toUpperCase())
              : '—';
            return (
              <div key={slot} className="entity-detail__slot-row">
                <span className="entity-detail__slot-name">{slot.charAt(0).toUpperCase() + slot.slice(1)}</span>
                <span className="entity-detail__slot-value" style={{ color: archetypeColor }}>
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
