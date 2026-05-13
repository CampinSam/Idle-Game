import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncItems, useSyncStatus, useSyncEntities } from '../../hooks/useSyncSelectors';
import { useAppSelector } from '../../store';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import { api } from '../../services/api';
import { ItemList, EntityPickerModal, UsePotionFlowModal, type ItemCategoryTab, type ItemSortBy, type ItemRarityFilter } from './components';
import ItemDetailPanel from './components/ItemDetailPanel';
import EntityList from '../entities/components/EntityList';
import { getConsumableTargetType } from './utils/getConsumableTargetType';
import {
  isEntityBusy,
  gearWouldChangeStats,
  consumableWouldChangeEntityStats,
  BUSY_EQUIP_TOOLTIP,
  BUSY_CONSUMABLE_TOOLTIP,
} from './utils/statChangeHelpers';

const PAGE_WRAPPER_CLASS = 'flex flex-col flex-1 min-h-0';
const CARD_CLASS =
  'flex flex-col flex-1 min-h-0 overflow-hidden overscroll-contain ' +
  '[-webkit-overflow-scrolling:touch] relative';

const BTN_BASE =
  'px-3.5 py-1.5 text-[11px] font-bold rounded-lg text-white border-0 cursor-pointer ' +
  'whitespace-nowrap transition-all enabled:hover:scale-105 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_GREEN =
  'bg-gradient-to-br from-[#10b981] to-[#0ea573] enabled:hover:shadow-[0_0_10px_rgba(16,185,129,0.4)]';
const BTN_AMBER =
  'bg-gradient-to-br from-[#f59e0b] to-[#d97706] enabled:hover:shadow-[0_0_10px_rgba(245,158,11,0.5)]';
const BTN_CYAN =
  'bg-gradient-to-br from-[#06b6d4] to-[#0284c7] enabled:hover:shadow-[0_0_10px_rgba(6,182,212,0.5)]';
const BTN_BLOCKED = '!opacity-40 grayscale-[0.7] !cursor-not-allowed';

function manageBtn(variant: 'green' | 'amber' | 'cyan', blocked = false): string {
  const palette = variant === 'amber' ? BTN_AMBER : variant === 'cyan' ? BTN_CYAN : BTN_GREEN;
  return `${BTN_BASE} ${palette}${blocked ? ` ${BTN_BLOCKED}` : ''}`;
}

const CATEGORY_TABS: ItemCategoryTab[] = [
  { key: 'ALL', label: 'All', types: null },
  { key: 'MATERIAL', label: 'Materials', types: ['MATERIAL'] },
  { key: 'CONSUMABLE', label: 'Consumables', types: ['CONSUMABLE'] },
  { key: 'GEAR', label: 'Gear', types: ['GEAR'] },
  { key: 'QUEST', label: 'Quest', types: ['QUEST'] },
];

const RARE_RARITIES = new Set(['LEGENDARY', 'MYTHIC', 'EPIC', 'ULTRA_RARE']);
const OPENABLE_TYPES = new Set(['LOOTBOX', 'GIFT_PACKAGE']);
const USABLE_TYPES = new Set(['CONSUMABLE']);
const EQUIPPABLE_TYPES = new Set(['GEAR']);

const OPEN_COMMAND: Record<string, string> = {
  LOOTBOX: 'OpenLootBox',
  GIFT_PACKAGE: 'OpenGiftPackage',
};

const STORAGE_KEY_CATEGORY = 'inv_activeCategory';
const STORAGE_KEY_SEARCH   = 'inv_searchQuery';
const STORAGE_KEY_RARITY   = 'inv_rarityFilter';
const STORAGE_KEY_SORT     = 'inv_sortBy';

const VALID_CATEGORIES = new Set(CATEGORY_TABS.map(t => t.key));
const VALID_RARITIES = new Set(['ALL', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'MYTHIC', 'LEGENDARY']);
const VALID_SORTS = new Set(['rarity', 'name', 'quantity']);

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function readCategory(): string {
  const v = safeGet(STORAGE_KEY_CATEGORY);
  return v && VALID_CATEGORIES.has(v) ? v : 'ALL';
}

function readSearch(): string {
  return safeGet(STORAGE_KEY_SEARCH) ?? '';
}

function readRarity(): ItemRarityFilter {
  const v = safeGet(STORAGE_KEY_RARITY);
  return v && VALID_RARITIES.has(v) ? v as ItemRarityFilter : 'ALL';
}

function readSort(): ItemSortBy {
  const v = safeGet(STORAGE_KEY_SORT);
  return v && VALID_SORTS.has(v) ? v as ItemSortBy : 'rarity';
}

function unsupportedTargetTooltip(target: 'unknown' | 'location' | 'team' | 'job' | 'global', hasEntities: boolean): string {
  if (target === 'location') return 'Location-targeted potions are not yet supported from the inventory.';
  if (target === 'unknown') return 'This consumable is missing target info — please report it.';
  if (!hasEntities) return 'You need at least one entity to use this potion.';
  return 'This potion can\'t be used here.';
}

function InventoryPageSkeleton() {
  return (
    <div className={PAGE_WRAPPER_CLASS}>
      <div className={CARD_CLASS}>
        <div className="item-list__controls" style={{ display: 'flex', gap: 8, padding: '10px 14px' }}>
          <div className="skeleton" style={{ flex: 1, height: 34, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 90, height: 34, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 90, height: 34, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 108, height: 34, borderRadius: 8 }} />
        </div>
        <div className="item-list__grid-wrap">
          <div className="item-list__grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div className="skeleton" style={{ width: 60, height: 60, borderRadius: 8 }} />
                <div className="skeleton" style={{ width: '80%', height: 11, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: '40%', height: 10, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const items = useSyncItems();
  const entities = useSyncEntities();
  const effectDefsList = useAppSelector((s) => s.game.effectDefs);
  const syncStatus = useSyncStatus();

  // Map of effectDefId → def for the consumable stat-change predicate. Built
  // here once instead of on each item-row render. Used to grey out the Use
  // button on stat-changing potions when no idle entities are available.
  const effectDefsById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const d of effectDefsList || []) map[d.id] = d;
    return map;
  }, [effectDefsList]);
  const [activeTab, setActiveTab] = useState(readCategory);
  const [searchQuery, setSearchQuery] = useState(readSearch);
  const [rarityFilter, setRarityFilter] = useState<ItemRarityFilter>(readRarity);
  const [sortBy, setSortBy] = useState<ItemSortBy>(readSort);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [forgeLocationId, setForgeLocationId] = useState<string | null>(null);
  const { pushModal } = useModal();

  const [entityPickerPotion, setEntityPickerPotion] = useState<any | null>(null);
  const [usePotionState, setUsePotionState] = useState<{ potion: any; targetEntityId?: string; targetEntityName?: string } | null>(null);
  // Gear-equip flow: when a player taps "Equip" on a gear item, we open a
  // lightweight entity picker (filtered to entities whose equipment schema
  // supports the gear's slot) and dispatch EquipItem on confirm.
  const [equipGear, setEquipGear] = useState<any | null>(null);
  const [equipBusy, setEquipBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getCraftingWorkshops()
      .then((list) => {
        if (cancelled) return;
        const enabled = list.find((w) => w.enabled) ?? list[0];
        setForgeLocationId(enabled?.locationId ?? null);
      })
      .catch(() => { if (!cancelled) setForgeLocationId(null); });
    return () => { cancelled = true; };
  }, []);

  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });

  const allItems = useMemo(() => {
    return items.map((i: any) => ({
      ...i,
      ...(i.definition || {}),
      instanceId: i.id,
      kind: i.definition?.type === 'GEAR' ? 'gear' : 'item',
    }));
  }, [items]);

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return allItems.find((i: any) => i.instanceId === selectedId) || null;
  }, [selectedId, allItems]);

  const handleSelect = useCallback((item: any) => {
    setSelectedId((prev) => (prev === item.instanceId ? null : item.instanceId));
  }, []);

  const handleCategoryChange = useCallback((key: string) => {
    safeSet(STORAGE_KEY_CATEGORY, key);
    setActiveTab(key);
    setSelectedId(null);
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    safeSet(STORAGE_KEY_SEARCH, q);
    setSearchQuery(q);
    setSelectedId(null);
  }, []);

  const handleRarityChange = useCallback((r: ItemRarityFilter) => {
    safeSet(STORAGE_KEY_RARITY, r);
    setRarityFilter(r);
    setSelectedId(null);
  }, []);

  const handleSortChange = useCallback((s: ItemSortBy) => {
    safeSet(STORAGE_KEY_SORT, s);
    setSortBy(s);
  }, []);

  const handleOpen = useCallback(async (item: any) => {
    if (opening) return;
    const commandType = OPEN_COMMAND[item.type];
    if (!commandType) return;
    setOpening(true);
    try {
      audioEngine.play('sfx.lootbox.open');
      const response = await execute(commandType, { itemInstanceId: item.instanceId });
      const hasRare = response?.patches?.some(
        (p: any) => p.op === 'upsert' && p.entity === 'item' && RARE_RARITIES.has(p.data?.rarity),
      );
      if (hasRare) {
        audioEngine.play('sfx.lootbox.rare');
      }
      setSelectedId(null);
    } catch (err) {
      console.error(`[InventoryPage] ${commandType} failed:`, err);
    } finally {
      setOpening(false);
    }
  }, [opening, execute]);

  const handleUse = useCallback((item: any) => {
    const target = getConsumableTargetType(item);
    if (target === 'player') {
      setUsePotionState({ potion: item });
      return;
    }
    if (target === 'entity') {
      setEntityPickerPotion(item);
      return;
    }
    console.warn('[InventoryPage] Use button pressed for unsupported target type:', target);
  }, []);

  const handlePickerSelectEntity = useCallback((entityId: string, entity: any) => {
    if (!entityPickerPotion) return;
    const potion = entityPickerPotion;
    setEntityPickerPotion(null);
    setUsePotionState({ potion, targetEntityId: entityId, targetEntityName: entity?.name });
  }, [entityPickerPotion]);

  const closeUsePotion = useCallback(() => {
    setUsePotionState(null);
    setSelectedId(null);
  }, []);

  const closeEntityPicker = useCallback(() => {
    setEntityPickerPotion(null);
  }, []);

  const handleEquip = useCallback((item: any) => {
    setEquipGear(item);
  }, []);

  const handleUnequip = useCallback(async (item: any) => {
    if (equipBusy) return;
    if (!item.equippedToId) return;
    setEquipBusy(true);
    try {
      await execute('UnequipItem', {
        entityId: item.equippedToId,
        itemInstanceId: item.instanceId,
      });
    } catch (err) {
      console.error('[InventoryPage] UnequipItem failed:', err);
    } finally {
      setEquipBusy(false);
    }
  }, [equipBusy, execute]);

  const handleEquipPickEntity = useCallback(async (entity: any) => {
    if (!equipGear || equipBusy) return;
    setEquipBusy(true);
    const itemInstanceId = equipGear.instanceId;
    setEquipGear(null);
    try {
      await execute('EquipItem', { entityId: entity.id, itemInstanceId });
    } catch (err) {
      console.error('[InventoryPage] EquipItem failed:', err);
    } finally {
      setEquipBusy(false);
    }
  }, [equipGear, equipBusy, execute]);

  const equipGearSlot: string | null = useMemo(() => {
    return equipGear?.equipData?.slot ?? equipGear?.definition?.equipData?.slot ?? null;
  }, [equipGear]);

  // Restrict the picker to entities whose definition.equipmentSchema declares
  // the gear's slot with non-zero capacity. Entities without an equipment
  // schema (legacy / non-equippable species) don't appear at all so the
  // player can't bottom out on a server-side rejection.
  const equipCandidates = useMemo(() => {
    if (!equipGearSlot) return [];
    return (entities as any[]).filter((e) => {
      const schema = e?.definition?.equipmentSchema?.schema as any;
      const cap = schema && typeof schema === 'object' ? Number(schema[equipGearSlot] ?? 0) : 0;
      return cap > 0;
    });
  }, [entities, equipGearSlot]);

  const renderActions = useCallback((item: any) => {
    if (OPENABLE_TYPES.has(item.type)) {
      return (
        <button
          className={manageBtn('amber')}
          disabled={opening}
          onClick={() => handleOpen(item)}
        >
          {opening ? 'Opening…' : 'Open'}
        </button>
      );
    }
    if (USABLE_TYPES.has(item.type)) {
      const target = getConsumableTargetType(item);
      const supported =
        target === 'player' || (target === 'entity' && entities.length > 0);
      // Pre-emptive grey-out: server rejects stat-changing consumables on
      // any non-idle target entity (Task #182). If every entity in the
      // roster is busy and the potion is stat-changing, there's no valid
      // target — disable with a "blocked while busy" hint. Heal / XP /
      // non-stat consumables remain enabled even when entities are busy.
      const isStatChanger =
        target === 'entity' &&
        consumableWouldChangeEntityStats(item, effectDefsById);
      const allTargetsBusy =
        isStatChanger &&
        entities.length > 0 &&
        (entities as any[]).every((e) => isEntityBusy(e));
      const blockedByBusy = isStatChanger && allTargetsBusy;
      const tooltip = !supported
        ? unsupportedTargetTooltip(target as any, entities.length > 0)
        : blockedByBusy
          ? BUSY_CONSUMABLE_TOOLTIP
          : undefined;
      return (
        <button
          className={manageBtn('cyan', blockedByBusy)}
          disabled={!supported || blockedByBusy}
          onClick={() => handleUse(item)}
          title={tooltip}
        >
          Use
        </button>
      );
    }
    if (EQUIPPABLE_TYPES.has(item.type)) {
      if (item.equippedToId) {
        // Pre-emptive grey-out: server rejects unequip of stat-bearing gear
        // on a busy entity. Cosmetic gear (no stat contribution) stays
        // unequippable even while the wearer is working / on mission.
        const wearer = (entities as any[]).find((e) => e.id === item.equippedToId);
        const blockedByBusy =
          isEntityBusy(wearer) && gearWouldChangeStats(item);
        return (
          <button
            className={manageBtn('cyan', blockedByBusy)}
            disabled={equipBusy || blockedByBusy}
            onClick={() => handleUnequip(item)}
            title={blockedByBusy ? BUSY_EQUIP_TOOLTIP : undefined}
          >
            {equipBusy ? '…' : 'Unequip'}
          </button>
        );
      }
      const slot: string | null = item.equipData?.slot ?? item.definition?.equipData?.slot ?? null;
      const isStatGear = gearWouldChangeStats(item);
      const eligibleEntities = !slot
        ? []
        : (entities as any[]).filter((e) => {
            const cap = Number(e?.definition?.equipmentSchema?.schema?.[slot] ?? 0);
            return cap > 0;
          });
      const hasTarget = eligibleEntities.length > 0;
      // For stat-bearing gear: if every eligible wearer is busy, the equip
      // picker would only show greyed-out rows — pre-emptively grey the
      // button and explain. Cosmetic gear stays equippable on busy
      // entities.
      const allTargetsBusy =
        isStatGear &&
        hasTarget &&
        eligibleEntities.every((e) => isEntityBusy(e));
      const blockedByBusy = allTargetsBusy;
      const tooltip = !slot
        ? 'This gear has no slot configured.'
        : !hasTarget
          ? 'No entity in your roster can wear this slot.'
          : blockedByBusy
            ? BUSY_EQUIP_TOOLTIP
            : undefined;
      return (
        <button
          className={manageBtn('cyan', blockedByBusy)}
          disabled={equipBusy || !hasTarget || blockedByBusy}
          onClick={() => handleEquip(item)}
          title={tooltip}
        >
          Equip
        </button>
      );
    }
    if (item.type === 'MATERIAL') {
      const hasWorkshop = !!forgeLocationId;
      return (
        <button
          className={manageBtn('green')}
          disabled={!hasWorkshop}
          onClick={() => {
            if (!hasWorkshop) return;
            const matId = (item.itemDefId || item.id) as string;
            const q = `?material=${encodeURIComponent(matId)}`;
            navigate(`/locations/${forgeLocationId}/workshop${q}`);
          }}
          title={hasWorkshop ? 'Open The Forge with recipes filtered to this material' : 'Build a Workshop in your Outpost first'}
        >
          ⚒️  Craft with this
        </button>
      );
    }
    return <button className={manageBtn('green')}>Manage</button>;
  }, [opening, entities, effectDefsById, forgeLocationId, handleOpen, handleUse, handleEquip, handleUnequip, equipBusy, navigate]);

  // Busy entity ids for the equip-flow picker. When the player is equipping
  // stat-bearing gear, busy wearers are visibly disabled so they can't be
  // selected (matches the server's busy-entity guard). Cosmetic gear leaves
  // every eligible entity selectable.
  const equipDisabledIds = useMemo(() => {
    if (!equipGear) return [];
    if (!gearWouldChangeStats(equipGear)) return [];
    return (equipCandidates as any[]).filter(isEntityBusy).map((e) => e.id);
  }, [equipGear, equipCandidates]);

  if (syncStatus === 'disconnected') return <InventoryPageSkeleton />;

  return (
    <div className={PAGE_WRAPPER_CLASS}>
      <div className={CARD_CLASS}>
        <ItemList
          items={allItems}
          mode="display"
          showControls
          categoryTabs={CATEGORY_TABS}
          activeCategory={activeTab}
          onCategoryChange={handleCategoryChange}
          search={searchQuery}
          onSearchChange={handleSearchChange}
          rarityFilter={rarityFilter}
          onRarityFilterChange={handleRarityChange}
          sortBy={sortBy}
          onSortChange={handleSortChange}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
        {selectedItem && (
          <div className="flex-shrink-0">
            <ItemDetailPanel
              key={selectedItem.instanceId ?? selectedItem.id}
              item={selectedItem}
              actions={renderActions(selectedItem)}
            />
          </div>
        )}
      </div>

      <EntityPickerModal
        isOpen={!!entityPickerPotion}
        potion={entityPickerPotion}
        onClose={closeEntityPicker}
        onSelectEntity={handlePickerSelectEntity}
      />

      {equipGear && (
        <div className="epm-overlay" onMouseDown={() => setEquipGear(null)} role="presentation">
          <div
            className="epm-modal"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Equip ${equipGear.name ?? 'item'}`}
          >
            <button className="epm-close" onClick={() => setEquipGear(null)} aria-label="Close">✕</button>
            <div className="epm-header">
              <h2 className="epm-title">Equip On Entity</h2>
              <div className="epm-potion-row">
                <div className="epm-potion-text">
                  <p className="epm-potion-name">{equipGear.name}</p>
                  {equipGearSlot && (
                    <p className="epm-potion-summary">
                      Slot: {equipGearSlot}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="epm-body">
              {equipCandidates.length === 0 ? (
                <div className="epm-empty">
                  No entity in your roster can equip this {equipGearSlot ?? 'item'}.
                </div>
              ) : (
                <>
                  <EntityList
                    entities={equipCandidates}
                    mode="picker"
                    useCase="potion-picker"
                    onSelect={handleEquipPickEntity}
                    disabledIds={equipDisabledIds}
                    emptyMessage="No eligible entities."
                  />
                  {equipDisabledIds.length > 0 && (
                    <p className="mt-2 mx-1 text-[11px] italic text-[rgba(248,113,113,0.85)] text-center">
                      {BUSY_EQUIP_TOOLTIP}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="epm-footer">
              <button
                type="button"
                className="epm-btn epm-btn--cancel"
                onClick={() => setEquipGear(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <UsePotionFlowModal
        isOpen={!!usePotionState}
        potion={usePotionState?.potion ?? null}
        targetEntityId={usePotionState?.targetEntityId ?? null}
        targetEntityName={usePotionState?.targetEntityName ?? null}
        onClose={closeUsePotion}
      />
    </div>
  );
}
