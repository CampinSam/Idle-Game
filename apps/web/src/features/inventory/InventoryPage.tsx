import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncItems, useSyncStatus } from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import { api } from '../../services/api';
import { ItemList, type ItemCategoryTab } from './components';
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
  const syncStatus = useSyncStatus();
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [using, setUsing] = useState(false);
  const [forgeLocationId, setForgeLocationId] = useState<string | null>(null);
  const { pushModal } = useModal();

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

  const handleUse = useCallback(async (item: any) => {
    if (using) return;
    setUsing(true);
    try {
      await execute('UseConsumable', { itemInstanceId: item.instanceId });
      setSelectedId(null);
    } catch (err) {
      console.error('[InventoryPage] UseConsumable failed:', err);
    } finally {
      setUsing(false);
    }
  }, [using, execute]);

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
      return (
        <button
          className="inv-manage-btn inv-use-btn"
          disabled={using}
          onClick={() => handleUse(item)}
        >
          {using ? 'Using…' : 'Use'}
        </button>
      );
    }
    if (item.type === 'MATERIAL') {
      return (
        <button
          className="inv-manage-btn inv-craft-btn"
          onClick={() => {
            audioEngine.play('ui.button_click');
            const matId = (item.itemDefId || item.id) as string;
            const q = `?material=${encodeURIComponent(matId)}`;
            if (forgeLocationId) navigate(`/locations/${forgeLocationId}/workshop${q}`);
            else navigate(`/crafting${q}`);
          }}
          title={forgeLocationId ? 'Open The Forge with recipes filtered to this material' : 'Build a Workshop in your Outpost first'}
        >
          ⚒️  Craft with this
        </button>
      );
    }
    return <button className="inv-manage-btn">Manage</button>;
  }, [opening, using, forgeLocationId, handleOpen, handleUse, navigate]);

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
    </div>
  );
}
