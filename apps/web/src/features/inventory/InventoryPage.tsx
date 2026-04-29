import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncItems, useSyncStatus } from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import { formatCompact } from '../../utils/formatNumber';
import { api } from '../../services/api';
import './InventoryPage.css';

const CATEGORY_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'MATERIAL', label: 'Materials' },
  { key: 'CONSUMABLE', label: 'Consumables' },
  { key: 'GEAR', label: 'Gear' },
  { key: 'QUEST', label: 'Quest' },
];

const RARITY_ORDER: Record<string, number> = {
  LEGENDARY: 0,
  MYTHIC: 1,
  EPIC: 2,
  ULTRA_RARE: 3,
  RARE: 4,
  ADVANCED: 5,
  SCARCE: 6,
  UNCOMMON: 7,
  COMMON: 8,
};

const RARE_RARITIES = new Set(['LEGENDARY', 'MYTHIC', 'EPIC', 'ULTRA_RARE']);

function rarityLabel(r: string) {
  return r.replace(/_/g, ' ');
}

function MissingIcon() {
  return (
    <svg className="inv-card-missing" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function InventoryPageSkeleton() {
  return (
    <div className="inventory-page page-transition-wrapper">
      <div className="inv-category-bar" style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ width: 76, height: 30, borderRadius: 20, flexShrink: 0 }} />
        ))}
      </div>
      <div className="inv-grid-wrap">
        <div className="inv-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="inv-card" style={{ animation: 'none', opacity: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div className="skeleton" style={{ width: 60, height: 60, borderRadius: 8 }} />
              <div className="skeleton" style={{ width: '80%', height: 11, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: '40%', height: 10, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const OPENABLE_TYPES = new Set(['LOOTBOX', 'GIFT_PACKAGE']);
const USABLE_TYPES = new Set(['CONSUMABLE']);

const OPEN_COMMAND: Record<string, string> = {
  LOOTBOX: 'OpenLootBox',
  GIFT_PACKAGE: 'OpenGiftPackage',
};

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

  const filtered = useMemo(() => {
    let list = allItems;
    if (activeTab !== 'ALL') {
      list = list.filter((i: any) => i.type === activeTab);
    }
    list.sort((a: any, b: any) => {
      const ra = RARITY_ORDER[a.rarity] ?? 99;
      const rb = RARITY_ORDER[b.rarity] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [allItems, activeTab]);

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return allItems.find((i: any) => i.instanceId === selectedId) || null;
  }, [selectedId, allItems]);

  const handleCardClick = useCallback((item: any) => {
    setSelectedId((prev) => (prev === item.instanceId ? null : item.instanceId));
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

  if (syncStatus === 'disconnected') return <InventoryPageSkeleton />;

  return (
    <div className="inventory-page page-transition-wrapper">
      <div className="inv-container">
        <div className="inv-category-bar">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`inv-cat-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(tab.key); setSelectedId(null); }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={`inv-grid-wrap${selectedItem ? ' has-detail' : ''}`}>
          <div className="inv-grid">
            {filtered.length === 0 && (
              <div className="inv-empty">
                <div className="inv-empty-icon">📦</div>
                No items found
              </div>
            )}
            {filtered.map((item: any) => {
              const isSelected = selectedId === item.instanceId;
              return (
                <div
                  key={item.instanceId}
                  className={`inv-card rarity-${item.rarity} ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleCardClick(item)}
                >
                  <div className="inv-card-img-wrap">
                    {item.iconUrl ? (
                      <img className="inv-card-img" src={item.iconUrl} alt={item.name} />
                    ) : (
                      <MissingIcon />
                    )}
                    <span className="inv-card-qty">
                      {formatCompact(item.quantity ?? 1)}
                    </span>
                  </div>
                  <span className="inv-card-name">{item.name}</span>
                  <span className="inv-card-sub">
                    {item.kind === 'gear' ? `Lvl ${item.level ?? 1}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {selectedItem && (
          <div className="inv-detail-panel">
            <div className="inv-detail-img-wrap">
              {selectedItem.iconUrl ? (
                <img className="inv-detail-img" src={selectedItem.iconUrl} alt={selectedItem.name} />
              ) : (
                <MissingIcon />
              )}
            </div>
            <div className="inv-detail-info">
              <span className={`inv-rarity-label rarity-${selectedItem.rarity}`}>
                {rarityLabel(selectedItem.rarity)}
              </span>
              <div className="inv-detail-name">{selectedItem.name}</div>
              <div className="inv-detail-desc">
                {selectedItem.description || 'A mysterious item with unknown properties.'}
              </div>
              <div className="inv-detail-tags">
                <span className="inv-detail-tag tag-type">{selectedItem.type}</span>
                {selectedItem.category && selectedItem.category !== 'MISC' && (
                  <span className="inv-detail-tag tag-category">{selectedItem.category}</span>
                )}
                {(selectedItem.tags || []).map((t: string) => (
                  <span key={t} className="inv-detail-tag">{t}</span>
                ))}
              </div>
            </div>
            <div className="inv-detail-actions">
              {OPENABLE_TYPES.has(selectedItem.type) ? (
                <button
                  className="inv-manage-btn inv-open-btn"
                  disabled={opening}
                  onClick={() => handleOpen(selectedItem)}
                >
                  {opening ? 'Opening…' : 'Open'}
                </button>
              ) : USABLE_TYPES.has(selectedItem.type) ? (
                <button
                  className="inv-manage-btn inv-use-btn"
                  disabled={using}
                  onClick={() => handleUse(selectedItem)}
                >
                  {using ? 'Using…' : 'Use'}
                </button>
              ) : selectedItem.type === 'MATERIAL' ? (
                <button
                  className="inv-manage-btn inv-craft-btn"
                  onClick={() => {
                    audioEngine.play('ui.button_click');
                    if (forgeLocationId) navigate(`/locations/${forgeLocationId}/workshop`);
                    else navigate('/locations');
                  }}
                  title={forgeLocationId ? 'Open The Forge' : 'Build a Workshop in your Outpost first'}
                >
                  ⚒️  Craft with this
                </button>
              ) : (
                <button className="inv-manage-btn">Manage</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
