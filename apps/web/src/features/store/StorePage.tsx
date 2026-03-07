import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../../store';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import GameIcon from '../../components/GameIcon';
import { resolveName } from '../../utils/iconResolver';
import './StorePage.css';

interface CostEntry {
  type: 'currency' | 'item';
  id: string;
  amount: number;
}

interface ContentEntry {
  type: 'currency' | 'item';
  id: string;
  amount: number;
}

interface ShopItem {
  id: string;
  name: string;
  description: string;
  tab: string;
  cost: CostEntry[];
  originalCost?: CostEntry[];
  contents: ContentEntry[];
  badge?: string;
  badgeColor?: string;
  imageUrl?: string;
  displayOrder: number;
  limitedUntil?: string;
}

function useCountdown(limitedUntil?: string) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!limitedUntil) return;
    const update = () => {
      const diff = new Date(limitedUntil).getTime() - Date.now();
      if (diff <= 0) { setLabel('Expired'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (d > 0) setLabel(`${d}d ${h}h left`);
      else if (h > 0) setLabel(`${h}h ${m}m left`);
      else setLabel(`${m}m left`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [limitedUntil]);
  return label;
}

function CostDisplay({ cost, size = 16 }: { cost: CostEntry[]; size?: number }) {
  return (
    <span className="store-cost">
      {cost.map((e, i) => (
        <span key={i} className="store-cost-entry">
          <GameIcon src={e.id} size={size} />
          <span>{e.amount.toLocaleString()}</span>
        </span>
      ))}
    </span>
  );
}

function SkeletonCard({ wide }: { wide?: boolean }) {
  return <div className={`store-skeleton ${wide ? 'store-skeleton-wide' : ''}`} />;
}

function FeaturedCard({ item, onSelect, selected }: { item: ShopItem; onSelect: (item: ShopItem) => void; selected: boolean }) {
  const countdown = useCountdown(item.limitedUntil);
  const accentColor = item.badgeColor || '#8b5cf6';
  return (
    <div
      className={`store-featured-card ${selected ? 'selected' : ''}`}
      style={{ '--accent': accentColor } as React.CSSProperties}
      onClick={() => onSelect(item)}
    >
      <div className="store-featured-shimmer" />
      {item.badge && (
        <span className="store-badge" style={{ background: accentColor }}>{item.badge}</span>
      )}
      {countdown && (
        <span className="store-countdown">⏱ {countdown}</span>
      )}
      <div className="store-featured-body">
        <div className="store-featured-name">{item.name}</div>
        <div className="store-featured-desc">{item.description}</div>
        <div className="store-featured-contents">
          {item.contents.map((c, i) => (
            <span key={i} className="store-content-chip">
              <GameIcon src={c.id} size={14} />
              <span>{c.amount.toLocaleString()}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="store-featured-footer">
        <button className="store-price-btn">
          <CostDisplay cost={item.cost} size={15} />
        </button>
      </div>
    </div>
  );
}

function CurrencyCard({ item, onSelect, selected }: { item: ShopItem; onSelect: (item: ShopItem) => void; selected: boolean }) {
  const mainContent = item.contents[0];
  const isBestValue = item.badge === 'BEST VALUE';
  return (
    <div
      className={`store-currency-card ${isBestValue ? 'best-value' : ''} ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(item)}
    >
      {item.badge && (
        <span className="store-badge" style={{ background: item.badgeColor || '#8b5cf6' }}>{item.badge}</span>
      )}
      {mainContent && (
        <div className="store-currency-icon">
          <GameIcon src={mainContent.id} size={40} />
          <div className="store-currency-amount">{mainContent.amount.toLocaleString()}</div>
        </div>
      )}
      <div className="store-currency-name">{item.name.replace(/ Pack$/, '')}</div>
      <div className="store-currency-price">
        {item.originalCost && (
          <div className="store-original-cost">
            <CostDisplay cost={item.originalCost} size={12} />
          </div>
        )}
        <CostDisplay cost={item.cost} size={14} />
      </div>
    </div>
  );
}

function BundleCard({ item, onSelect, selected }: { item: ShopItem; onSelect: (item: ShopItem) => void; selected: boolean }) {
  return (
    <div
      className={`store-bundle-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(item)}
    >
      {item.badge && (
        <span className="store-badge" style={{ background: item.badgeColor || '#8b5cf6' }}>{item.badge}</span>
      )}
      <div className="store-bundle-name">{item.name}</div>
      <div className="store-bundle-desc">{item.description}</div>
      <div className="store-bundle-contents">
        {item.contents.map((c, i) => (
          <span key={i} className="store-content-chip">
            <GameIcon src={c.id} size={14} />
            <span>{c.amount.toLocaleString()}</span>
          </span>
        ))}
      </div>
      <div className="store-bundle-price">
        <CostDisplay cost={item.cost} size={14} />
      </div>
    </div>
  );
}

function ItemCard({ item, onSelect, selected }: { item: ShopItem; onSelect: (item: ShopItem) => void; selected: boolean }) {
  return (
    <div
      className={`store-item-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(item)}
    >
      {item.badge && (
        <span className="store-badge" style={{ background: item.badgeColor || '#8b5cf6' }}>{item.badge}</span>
      )}
      <div className="store-item-icon">
        {item.contents[0] && <GameIcon src={item.contents[0].id} size={36} />}
      </div>
      <div className="store-item-name">{item.name}</div>
      <div className="store-item-price">
        <CostDisplay cost={item.cost} size={14} />
      </div>
    </div>
  );
}

const TABS = ['featured', 'currency', 'bundle', 'items'] as const;
const TAB_LABELS: Record<string, string> = {
  featured: 'Featured',
  currency: 'Currencies',
  bundle: 'Bundles',
  items: 'Items',
};

export default function StorePage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('featured');
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);

  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal') pushModal(intent as any);
    },
  });

  useEffect(() => {
    fetch('/api/shop/items', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('derp_token') || ''}`,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tabItems = items.filter((i) => i.tab === activeTab);

  const handleSelect = useCallback((item: ShopItem) => {
    setSelectedItem((prev) => (prev?.id === item.id ? null : item));
    setConfirmError('');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!selectedItem || confirming) return;
    setConfirming(true);
    setConfirmError('');
    try {
      await execute('ShopPurchase', { shopItemDefId: selectedItem.id });
      setSelectedItem(null);
    } catch (err: any) {
      setConfirmError(err?.message || 'Purchase failed');
    } finally {
      setConfirming(false);
    }
  }, [selectedItem, confirming, execute]);

  const getBalanceForCost = (costEntry: CostEntry) => {
    if (costEntry.type === 'currency') {
      return currencyBalances[costEntry.id] ?? 0;
    }
    return 0;
  };

  const canAfford = selectedItem
    ? selectedItem.cost.every((c) => getBalanceForCost(c) >= c.amount)
    : true;

  const mainCurrencies = ['soft_arcanium', 'hard_essence', 'premium_gems'];

  return (
    <div className="store-wrapper page-transition-wrapper">
      <div className="store-balance-bar">
        {mainCurrencies.map((id) => (
          <div key={id} className="store-balance-chip">
            <GameIcon src={id} size={16} />
            <span>{(currencyBalances[id] ?? 0).toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="store-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`store-tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); setSelectedItem(null); setConfirmError(''); }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="store-content">
        {loading ? (
          <div className="store-skeleton-list">
            {activeTab === 'featured' ? (
              <>
                <SkeletonCard wide />
                <SkeletonCard wide />
                <SkeletonCard wide />
              </>
            ) : (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}
          </div>
        ) : tabItems.length === 0 ? (
          <div className="store-empty">Nothing here yet. Check back soon!</div>
        ) : activeTab === 'featured' ? (
          <div className="store-featured-list">
            {tabItems.map((item) => (
              <FeaturedCard key={item.id} item={item} onSelect={handleSelect} selected={selectedItem?.id === item.id} />
            ))}
          </div>
        ) : activeTab === 'currency' ? (
          <div className="store-currency-grid">
            {tabItems.map((item) => (
              <CurrencyCard key={item.id} item={item} onSelect={handleSelect} selected={selectedItem?.id === item.id} />
            ))}
          </div>
        ) : activeTab === 'bundle' ? (
          <div className="store-bundle-grid">
            {tabItems.map((item) => (
              <BundleCard key={item.id} item={item} onSelect={handleSelect} selected={selectedItem?.id === item.id} />
            ))}
          </div>
        ) : (
          <div className="store-item-grid">
            {tabItems.map((item) => (
              <ItemCard key={item.id} item={item} onSelect={handleSelect} selected={selectedItem?.id === item.id} />
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="store-confirm-bar">
          <div className="store-confirm-info">
            <span className="store-confirm-name">{selectedItem.name}</span>
            <div className="store-confirm-costs">
              {selectedItem.cost.map((c, i) => {
                const balance = getBalanceForCost(c);
                const enough = balance >= c.amount;
                return (
                  <div key={i} className={`store-confirm-cost-row ${!enough ? 'insufficient' : ''}`}>
                    <GameIcon src={c.id} size={15} />
                    <span className="store-confirm-cost-label">
                      {resolveName(c.type === 'currency' ? 'CURRENCY' : 'ITEM', c.id, currencyDefs, itemDefs)}
                    </span>
                    <span className="store-confirm-balance">
                      {balance.toLocaleString()} / {c.amount.toLocaleString()}
                    </span>
                    {!enough && <span className="store-confirm-insufficient">✗</span>}
                  </div>
                );
              })}
            </div>
            {confirmError && <div className="store-confirm-error">{confirmError}</div>}
          </div>
          <div className="store-confirm-actions">
            <button className="store-confirm-cancel" onClick={() => { setSelectedItem(null); setConfirmError(''); }}>
              Cancel
            </button>
            <button
              className="store-confirm-buy"
              disabled={!canAfford || confirming}
              onClick={handleConfirm}
            >
              {confirming ? 'Buying...' : canAfford ? 'Confirm' : 'Can\'t Afford'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
