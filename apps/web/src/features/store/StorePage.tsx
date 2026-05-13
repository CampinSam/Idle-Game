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

const CARD_BG = '[background:linear-gradient(160deg,#1a1640_0%,#221a50_100%)]';

const BADGE_CLASS =
  'inline-block px-2 py-0.5 rounded-[4px] text-[10px] font-black tracking-[1px] text-white uppercase';

const CONTENT_CHIP_CLASS =
  'inline-flex items-center gap-1 bg-black/25 border border-[rgba(139,92,246,0.15)] ' +
  'rounded-[6px] px-[7px] py-[3px] text-[12px] font-bold text-[#d8b4fe]';

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
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {cost.map((e, i) => (
        <ItemQty key={i} src={e.id} amount={e.amount} size={size} />
      ))}
    </span>
  );
}

function SkeletonCard({ wide }: { wide?: boolean }) {
  return (
    <div
      className={
        `rounded-[14px] ${CARD_BG} bg-[length:200%_100%] animate-[skeleton-shimmer_1.5s_infinite] ` +
        (wide ? 'h-[130px]' : 'h-[90px]')
      }
    />
  );
}

function FeaturedCard({ item, onOpen }: { item: ShopItem; onOpen: (item: ShopItem) => void }) {
  const countdown = useCountdown(item.limitedUntil);
  const accentColor = item.badgeColor || '#8b5cf6';
  return (
    <div
      className={`relative ${CARD_BG} border border-[rgba(139,92,246,0.25)] [border-top:2px_solid_var(--accent,#8b5cf6)] rounded-[14px] overflow-hidden cursor-pointer transition-[border-color,transform] duration-150 active:scale-[0.99] motion-safe:animate-[card-enter_0.2s_ease-out_both]`}
      style={{ '--accent': accentColor } as React.CSSProperties}
      onClick={() => onOpen(item)}
    >
      <div className="absolute top-0 left-0 w-[40%] h-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent pointer-events-none animate-[store-shimmer_3s_infinite_linear]" />
      {item.badge && (
        <span className={`absolute top-2.5 left-2.5 ${BADGE_CLASS}`} style={{ background: accentColor }}>
          {item.badge}
        </span>
      )}
      {countdown && (
        <span className="absolute top-3 right-3 text-[11px] text-[#fbbf24] font-bold">⏱ {countdown}</span>
      )}
      <div className="pt-9 px-3.5 pb-3 flex flex-col gap-1.5">
        <div className="text-[16px] font-black text-white tracking-[0.3px]">{item.name}</div>
        <div className="text-[12px] text-text-secondary leading-[1.5]">{item.description}</div>
        <div className="flex flex-wrap gap-[5px] mt-1">
          {item.contents.map((c, i) => (
            <span key={i} className={CONTENT_CHIP_CLASS}>
              <ItemQty src={c.id} amount={c.amount} size={14} />
            </span>
          ))}
        </div>
      </div>
      <div className="px-3.5 pt-2.5 pb-3.5 flex justify-end">
        <button data-sfx="ui.button_primary" className="bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.4)] rounded-lg px-3.5 py-[7px] cursor-pointer transition-colors duration-150 hover:bg-[rgba(139,92,246,0.25)]">
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
      className={
        `relative ${CARD_BG} border rounded-[14px] px-2 py-3.5 flex flex-col items-center gap-2 ` +
        `cursor-pointer transition-[border-color,transform] duration-150 active:scale-[0.97] ` +
        `motion-safe:animate-[card-enter_0.2s_ease-out_both] text-center ` +
        (isBestValue
          ? 'border-[rgba(139,92,246,0.5)] shadow-[0_0_12px_rgba(139,92,246,0.15)]'
          : 'border-[rgba(139,92,246,0.2)]')
      }
      onClick={() => onOpen(item)}
    >
      {item.badge && (
        <span
          className={`absolute -top-px left-1/2 -translate-x-1/2 ${BADGE_CLASS} !text-[8px] !px-1.5 whitespace-nowrap`}
          style={{ background: item.badgeColor || '#8b5cf6' }}
        >
          {item.badge}
        </span>
      )}
      {mainContent && (
        <div className="flex flex-col items-center gap-1">
          <GameIcon src={mainContent.id} size={40} />
          <div className="text-[18px] font-black text-white">{mainContent.amount.toLocaleString()}</div>
        </div>
      )}
      <div className="text-[10px] text-text-secondary font-semibold">{item.name.replace(/ Pack$/, '')}</div>
      <div className="flex flex-col items-center gap-0.5">
        {item.originalCost && (
          <div className="line-through opacity-50">
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
      className={`relative ${CARD_BG} border border-[rgba(139,92,246,0.2)] rounded-[14px] pt-7 px-3 pb-3 flex flex-col gap-1.5 cursor-pointer transition-[border-color,transform] duration-150 active:scale-[0.98] motion-safe:animate-[card-enter_0.2s_ease-out_both]`}
      onClick={() => onOpen(item)}
    >
      {item.badge && (
        <span className={`absolute top-2.5 left-2.5 ${BADGE_CLASS}`} style={{ background: item.badgeColor || '#8b5cf6' }}>
          {item.badge}
        </span>
      )}
      <div className="text-[13px] font-extrabold text-white">{item.name}</div>
      <div className="text-[11px] text-text-secondary leading-[1.5]">{item.description}</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {item.contents.map((c, i) => (
          <span key={i} className={CONTENT_CHIP_CLASS}>
            <ItemQty src={c.id} amount={c.amount} size={14} />
          </span>
        ))}
      </div>
      <div className="mt-auto pt-2 border-t border-[rgba(139,92,246,0.1)]">
        <CostDisplay cost={item.cost} size={14} />
      </div>
    </div>
  );
}

function ItemCard({ item, onOpen }: { item: ShopItem; onOpen: (item: ShopItem) => void }) {
  return (
    <div
      className={`relative ${CARD_BG} border border-[rgba(139,92,246,0.2)] rounded-[14px] pt-7 px-3 pb-3 flex flex-col items-center gap-2 cursor-pointer text-center transition-[border-color,transform] duration-150 active:scale-[0.98] motion-safe:animate-[card-enter_0.2s_ease-out_both]`}
      onClick={() => onOpen(item)}
    >
      {item.badge && (
        <span className={`absolute top-2.5 left-2.5 ${BADGE_CLASS}`} style={{ background: item.badgeColor || '#8b5cf6' }}>
          {item.badge}
        </span>
      )}
      <div className="p-1.5 bg-black/20 rounded-[10px] border border-[rgba(139,92,246,0.1)]">
        {item.contents[0] && <GameIcon src={item.contents[0].id} size={36} />}
      </div>
      <div className="text-[13px] font-extrabold text-white">{item.name}</div>
      <div className="mt-auto">
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="overflow-hidden flex flex-col flex-1 min-h-0">

        <div className="flex gap-2 flex-wrap px-3.5 pt-3 pb-2.5">
          {mainCurrencies.map((id) => (
            <span key={id} className="flex items-center gap-1.5 bg-black/35 border border-[rgba(139,92,246,0.2)] rounded-full px-2.5 py-[5px] text-[13px] font-bold text-[#e2d9f3]">
              <ItemQty src={id} amount={currencyBalances[id] ?? 0} size={16} />
            </span>
          ))}
        </div>

        <div className="flex bg-black/25 border-y border-[rgba(139,92,246,0.12)] overflow-hidden">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={
                `flex-1 py-2.5 px-1 text-[11px] font-bold tracking-[0.5px] uppercase bg-transparent ` +
                `border-0 border-b-2 cursor-pointer transition-[color,border-color] duration-150 ` +
                (activeTab === tab
                  ? 'text-[#c4b5fd] border-b-derp-purple'
                  : 'text-text-secondary border-b-transparent')
              }
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] p-3.5">
          {loading ? (
            <div className="flex flex-col gap-2.5">
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
            <div className="text-center py-10 px-5 text-text-secondary text-[14px]">Nothing here yet. Check back soon!</div>
          ) : activeTab === 'featured' ? (
            <div className="flex flex-col gap-2.5">
              {tabItems.map((item) => (
                <FeaturedCard key={item.id} item={item} onOpen={handleOpenModal} />
              ))}
            </div>
          ) : activeTab === 'currency' ? (
            <div className="grid grid-cols-3 gap-2">
              {tabItems.map((item) => (
                <CurrencyCard key={item.id} item={item} onOpen={handleOpenModal} />
              ))}
            </div>
          ) : activeTab === 'bundle' ? (
            <div className="grid grid-cols-2 gap-2.5">
              {tabItems.map((item) => (
                <BundleCard key={item.id} item={item} onOpen={handleOpenModal} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
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
