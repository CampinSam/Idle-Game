import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncItems, useSyncStatus, useSyncEntities } from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import { api } from '../../services/api';
import { ItemList, EntityPickerModal, UsePotionFlowModal, type ItemCategoryTab } from './components';
import { getConsumableTargetType } from './utils/getConsumableTargetType';
import './InventoryPage.css';

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

const OPEN_COMMAND: Record<string, string> = {
  LOOTBOX: 'OpenLootBox',
  GIFT_PACKAGE: 'OpenGiftPackage',
};

function unsupportedTargetTooltip(target: 'unknown' | 'location' | 'team' | 'job' | 'global', hasEntities: boolean): string {
  if (target === 'location') return 'Location-targeted potions are not yet supported from the inventory.';
  if (target === 'unknown') return 'This consumable is missing target info — please report it.';
  if (!hasEntities) return 'You need at least one entity to use this potion.';
  return 'This potion can\'t be used here.';
}

function InventoryPageSkeleton() {
  return (
    <div className="inventory-page page-transition-wrapper">
      <div className="inv-container">
        <div className="item-list__category-bar" style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ width: 76, height: 30, borderRadius: 20, flexShrink: 0 }} />
          ))}
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
  const syncStatus = useSyncStatus();
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [forgeLocationId, setForgeLocationId] = useState<string | null>(null);
  const { pushModal } = useModal();

  // Use-Potion flow state. Either the entity picker is open (for entity-targeted
  // potions) or the confirm/result modal is open. Only one at a time.
  const [entityPickerPotion, setEntityPickerPotion] = useState<any | null>(null);
  const [usePotionState, setUsePotionState] = useState<{ potion: any; targetEntityId?: string; targetEntityName?: string } | null>(null);

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
    setActiveTab(key);
    setSelectedId(null);
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

  /**
   * Routes the Use button by consumable target type.
   * - player: open confirm/result modal directly.
   * - entity: open entity picker first; on confirm hand off to the same modal.
   * - location/unknown: button is disabled at render time, so this is a no-op.
   */
  const handleUse = useCallback((item: any) => {
    audioEngine.play('ui.button_click');
    const target = getConsumableTargetType(item);
    if (target === 'player') {
      setUsePotionState({ potion: item });
      return;
    }
    if (target === 'entity') {
      setEntityPickerPotion(item);
      return;
    }
    // location / unknown — should be disabled, but be explicit just in case.
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

  const renderActions = useCallback((item: any) => {
    if (OPENABLE_TYPES.has(item.type)) {
      return (
        <button
          className="inv-manage-btn inv-open-btn"
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
      const tooltip = supported
        ? undefined
        : unsupportedTargetTooltip(target as any, entities.length > 0);
      return (
        <button
          className="inv-manage-btn inv-use-btn"
          disabled={!supported}
          onClick={() => handleUse(item)}
          title={tooltip}
        >
          Use
        </button>
      );
    }
    if (item.type === 'MATERIAL') {
      // Crafting requires a Workshop building at one of the player's outposts.
      // ForgePage does the same preflight server-side and redirects away when
      // it fails — gating the entry button avoids a redirect loop and gives a
      // clearer reason in the tooltip.
      const hasWorkshop = !!forgeLocationId;
      return (
        <button
          className="inv-manage-btn inv-craft-btn"
          disabled={!hasWorkshop}
          onClick={() => {
            if (!hasWorkshop) return;
            audioEngine.play('ui.button_click');
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
    return <button className="inv-manage-btn">Manage</button>;
  }, [opening, entities.length, forgeLocationId, handleOpen, handleUse, navigate]);

  if (syncStatus === 'disconnected') return <InventoryPageSkeleton />;

  return (
    <div className="inventory-page page-transition-wrapper">
      <div className="inv-container">
        <ItemList
          items={allItems}
          mode="display"
          categoryTabs={CATEGORY_TABS}
          activeCategory={activeTab}
          onCategoryChange={handleCategoryChange}
          selectedId={selectedId}
          selectedItem={selectedItem}
          onSelect={handleSelect}
          detailPanelActions={renderActions}
        />
      </div>

      <EntityPickerModal
        isOpen={!!entityPickerPotion}
        potion={entityPickerPotion}
        onClose={closeEntityPicker}
        onSelectEntity={handlePickerSelectEntity}
      />

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
