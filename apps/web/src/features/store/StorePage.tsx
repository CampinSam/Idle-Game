import { useState, useEffect, useCallback } from 'react';
import type { ModalSpecV1 } from '@derp/shared';
import { useAppSelector } from '../../store';
import { useModal } from '../../context/ModalContext';
import GameIcon from '../../components/GameIcon';
import ItemQty from '../../components/ItemQty';
import { resolveName } from '../../utils/iconResolver';

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
        <ItemQty key={i} src={e.id} amount={e.amount} size={size} />
      ))}
    </span>
  );
}

function SkeletonCard({ wide }: { wide?: boolean }) {
  return <div className={`store-skeleton ${wide ? 'store-skeleton-wide' : ''}`} />;
}

function FeaturedCard({ item, onOpen }: { item: ShopItem; onOpen: (item: ShopItem) => void }) {
  const countdown = useCountdown(item.limitedUntil);
  const accentColor = item.badgeColor || '#8b5cf6';
  return (
    <div
      className="store-featured-card"
      style={{ '--accent': accentColor } as React.CSSProperties}
      onClick={() => onOpen(item)}
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
              <ItemQty src={c.id} amount={c.amount} size={14} />
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

function CurrencyCard({ item, onOpen }: { item: ShopItem; onOpen: (item: ShopItem) => void }) {
  const mainContent = item.contents[0];
  const isBestValue = item.badge === 'BEST VALUE';
  return (
    <div
      className={`store-currency-card ${isBestValue ? 'best-value' : ''}`}
      onClick={() => onOpen(item)}
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

function BundleCard({ item, onOpen }: { item: ShopItem; onOpen: (item: ShopItem) => void }) {
  return (
    <div
      className="store-bundle-card"
      onClick={() => onOpen(item)}
    >
      {item.badge && (
        <span className="store-badge" style={{ background: item.badgeColor || '#8b5cf6' }}>{item.badge}</span>
      )}
      <div className="store-bundle-name">{item.name}</div>
      <div className="store-bundle-desc">{item.description}</div>
      <div className="store-bundle-contents">
        {item.contents.map((c, i) => (
          <span key={i} className="store-content-chip">
            <ItemQty src={c.id} amount={c.amount} size={14} />
          </span>
        ))}
      </div>
      <div className="store-bundle-price">
        <CostDisplay cost={item.cost} size={14} />
      </div>
    </div>
  );
}

function ItemCard({ item, onOpen }: { item: ShopItem; onOpen: (item: ShopItem) => void }) {
  return (
    <div
      className="store-item-card"
      onClick={() => onOpen(item)}
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

  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);

  const { pushModal } = useModal();

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

  const handleOpenModal = useCallback((item: ShopItem) => {
    const body: ModalSpecV1['pages'][number]['body'] = [];

    if (item.description) {
      body.push({
        type: 'richText',
        doc: [{ t: 'p', c: [{ t: 'text', v: item.description }] }],
      });
    }

    if (item.contents.length > 0) {
      body.push({
        type: 'rewardsList',
        title: "You'll Receive",
        items: item.contents.map((c) => ({
          name: resolveName(c.type === 'currency' ? 'CURRENCY' : 'ITEM', c.id, currencyDefs, itemDefs),
          qty: c.amount,
          assetKey: c.id,
        })),
      });
    }

    if (item.cost.length > 0) {
      body.push({
        type: 'metaRows',
        rows: item.cost.map((c) => {
          const balance = c.type === 'currency' ? (currencyBalances[c.id] ?? 0) : 0;
          const name = resolveName(c.type === 'currency' ? 'CURRENCY' : 'ITEM', c.id, currencyDefs, itemDefs);
          return {
            label: `${name} (have: ${balance.toLocaleString()})`,
            value: c.amount.toLocaleString(),
          };
        }),
      });
    }

    const spec: ModalSpecV1 = {
      version: 1,
      id: `shop-item-${item.id}`,
      kind: 'shop_item_detail',
      dismiss: { backdrop: true, x: true, escape: true },
      header: { title: item.name },
      pages: [{ body }],
      buttons: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost', action: { type: 'CLOSE_MODAL' } },
        { id: 'buy', label: 'Buy Now', variant: 'primary', action: { type: 'SHOP_PURCHASE', shopItemDefId: item.id } },
      ],
    };

    pushModal(spec);
  }, [pushModal, currencyDefs, itemDefs, currencyBalances]);

  const mainCurrencies = ['soft_arcanium', 'hard_essence', 'premium_gems'];

  return (
    <div className="store-wrapper page-transition-wrapper">
      <div className="store-card">
      <div className="store-balance-bar">
        {mainCurrencies.map((id) => (
          <span key={id} className="store-balance-chip">
            <ItemQty src={id} amount={currencyBalances[id] ?? 0} size={16} />
          </span>
        ))}
      </div>

      <div className="store-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`store-tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
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
              <FeaturedCard key={item.id} item={item} onOpen={handleOpenModal} />
            ))}
          </div>
        ) : activeTab === 'currency' ? (
          <div className="store-currency-grid">
            {tabItems.map((item) => (
              <CurrencyCard key={item.id} item={item} onOpen={handleOpenModal} />
            ))}
          </div>
        ) : activeTab === 'bundle' ? (
          <div className="store-bundle-grid">
            {tabItems.map((item) => (
              <BundleCard key={item.id} item={item} onOpen={handleOpenModal} />
            ))}
          </div>
        ) : (
          <div className="store-item-grid">
            {tabItems.map((item) => (
              <ItemCard key={item.id} item={item} onOpen={handleOpenModal} />
            ))}
          </div>
        )}
      </div>
      </div>

    </div>
  );
}
