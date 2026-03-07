import { useState, useMemo } from 'react';
import { useSyncItems, useSyncStatus } from '../../hooks/useSyncSelectors';
import { formatCompact } from '../../utils/formatNumber';
import './InventoryPage.css';

const CATEGORY_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'MATERIAL', label: 'Materials' },
  { key: 'CONSUMABLE', label: 'Consumables' },
  { key: 'POTION', label: 'Potions' },
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

export default function InventoryPage() {
  const items = useSyncItems();
  const syncStatus = useSyncStatus();
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (syncStatus === 'disconnected') return <InventoryPageSkeleton />;

  const allItems = useMemo(() => {
    return items.map((i: any) => ({
      ...i,
      ...(i.definition || {}),
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
    return allItems.find((i: any) => (i.kind === 'gear' ? i.instanceId : i.itemId || i.id) === selectedId) || null;
  }, [selectedId, allItems]);

  const handleCardClick = (item: any) => {
    const id = item.kind === 'gear' ? item.instanceId : item.itemId || item.id;
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const getItemKey = (item: any) => item.kind === 'gear' ? item.instanceId : item.itemId || item.id;

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

        <div className="inv-grid-wrap">
          <div className="inv-grid">
            {filtered.length === 0 && (
              <div className="inv-empty">
                <div className="inv-empty-icon">📦</div>
                No items found
              </div>
            )}
            {filtered.map((item: any) => {
              const key = getItemKey(item);
              const isSelected = selectedId === key;
              return (
                <div
                  key={key}
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
              <button className="inv-manage-btn">Manage</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
