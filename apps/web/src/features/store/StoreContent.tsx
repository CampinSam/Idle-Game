import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNow } from '../../hooks/useNow';
import type { ModalSpecV1 } from '@derp/shared';
import { useAppSelector } from '../../store';
import { useModal } from '../../context/ModalContext';
import GameIcon from '../../components/GameIcon';
import ItemQty from '../../components/ItemQty';
import { resolveName } from '../../utils/iconResolver';

interface GemPack {
  id: string;
  name: string;
  description: string;
  gemAmount: number;
  priceId: string;
  unitAmount: number;
  currency: string;
  displayOrder: number;
  displayName: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  badgeType: 'best_value' | 'extra' | null;
  badgeLabel: string | null;
  iconSize: number;
}

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
  sectionId?: string;
  cost: CostEntry[];
  originalCost?: CostEntry[];
  contents: ContentEntry[];
  badge?: string;
  badgeColor?: string;
  imageUrl?: string;
  displayOrder: number;
  availableFrom?: string;
  limitedUntil?: string;
}

interface ShopTab {
  id: string;
  name: string;
  tabType: string;
  layout: string;
  ungroupedPlacement: string;
  sortOrder: number;
  enabled: boolean;
}

interface ShopSection {
  id: string;
  tabId: string;
  label: string;
  subtitle?: string;
  sortOrder: number;
}

interface ShopHero {
  id: string;
  headline: string;
  subText?: string;
  imageUrl?: string;
  backgroundColor?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  sortOrder: number;
  enabled: boolean;
  limitedUntil?: string;
}

const HERO_AUTO_ADVANCE_MS = 5000;
const HERO_PAUSE_MS = 10000;
const HERO_SWIPE_THRESHOLD = 50;
const HERO_TAP_THRESHOLD = 8;

function StoreHeroCarousel({
  heroes,
  onTabSelect,
}: {
  heroes: ShopHero[];
  onTabSelect: (tabId: string) => void;
}) {
  const now = useNow(30_000);
  const activeHeroes = useMemo(
    () => heroes.filter((h) => !h.limitedUntil || new Date(h.limitedUntil).getTime() > now),
    [heroes, now],
  );

  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const suppressClickRef = useRef(false);

  useEffect(() => () => { if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current); }, []);
  useEffect(() => {
    if (page >= activeHeroes.length && activeHeroes.length > 0) setPage(0);
  }, [activeHeroes.length, page]);
  useEffect(() => {
    if (activeHeroes.length < 2 || paused) return;
    const id = setInterval(() => setPage((p) => (p + 1) % activeHeroes.length), HERO_AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [activeHeroes.length, paused]);

  const pauseAutoAdvance = useCallback(() => {
    setPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => { setPaused(false); pauseTimerRef.current = null; }, HERO_PAUSE_MS);
  }, []);

  const handleCta = useCallback((hero: ShopHero) => {
    pauseAutoAdvance();
    if (!hero.ctaTarget) return;
    if (hero.ctaTarget.startsWith('http')) {
      window.open(hero.ctaTarget, '_blank', 'noopener,noreferrer');
    } else {
      onTabSelect(hero.ctaTarget);
    }
  }, [onTabSelect, pauseAutoAdvance]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }, []);
  const handleTouchEnd = useCallback((hero: ShopHero) => {
    const delta = touchDeltaX.current;
    const abs = Math.abs(delta);
    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 400);
    if (abs <= HERO_TAP_THRESHOLD) { handleCta(hero); return; }
    if (abs < HERO_SWIPE_THRESHOLD || activeHeroes.length < 2) return;
    pauseAutoAdvance();
    if (delta < 0) setPage((p) => (p + 1) % activeHeroes.length);
    else setPage((p) => (p - 1 + activeHeroes.length) % activeHeroes.length);
  }, [activeHeroes.length, handleCta, pauseAutoAdvance]);

  if (activeHeroes.length === 0) return null;

  const activeIndex = Math.min(page, activeHeroes.length - 1);
  const hero = activeHeroes[activeIndex];
  const isCarousel = activeHeroes.length > 1;

  return (
    <div className="px-3.5 pt-3">
      <div
        className="relative rounded-[14px] overflow-hidden cursor-pointer select-none touch-pan-y border border-[rgba(139,92,246,0.3)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(139,92,246,0.3)]"
        style={{ background: hero.backgroundColor || '#1a1640', minHeight: hero.imageUrl ? undefined : '120px' }}
        onClick={() => { if (!suppressClickRef.current) handleCta(hero); }}
        onTouchStart={isCarousel ? handleTouchStart : undefined}
        onTouchMove={isCarousel ? handleTouchMove : undefined}
        onTouchEnd={isCarousel ? () => handleTouchEnd(hero) : undefined}
      >
        {hero.imageUrl && (
          <img src={hero.imageUrl} alt="" className="w-full h-[160px] object-cover block" />
        )}
        <div className={`${hero.imageUrl ? 'absolute inset-0' : ''} p-4 flex flex-col justify-center bg-gradient-to-br from-[rgba(15,10,40,0.85)] via-[rgba(30,20,60,0.55)] to-transparent`}>
          <h3 className="font-cinzel text-[20px] max-[480px]:text-[16px] font-black tracking-[0.1em] text-[#f0e6ff] mb-0.5 [text-shadow:0_2px_8px_rgba(139,92,246,0.5)]">
            {hero.headline.toUpperCase()}
          </h3>
          {hero.subText && (
            <p className="text-[12px] text-[#c4b5fd] mb-2 leading-snug">{hero.subText}</p>
          )}
          {hero.ctaLabel && (
            <button
              className="self-start bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white border-0 rounded-lg px-4 py-1.5 text-xs font-extrabold tracking-[0.08em] cursor-pointer transition-transform hover:scale-105"
              onClick={(e) => { e.stopPropagation(); handleCta(hero); }}
            >
              {hero.ctaLabel}
            </button>
          )}
        </div>

        {isCarousel && (
          <div
            className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 pointer-events-auto"
            role="tablist"
            aria-label="Store hero banner pagination"
          >
            {activeHeroes.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Banner ${i + 1} of ${activeHeroes.length}`}
                className={`w-[7px] h-[7px] rounded-full border-0 p-0 cursor-pointer transition-all ${
                  i === activeIndex
                    ? 'bg-[#f0e6ff] scale-125 shadow-[0_0_6px_rgba(196,181,253,0.8)]'
                    : 'bg-white/35 hover:bg-white/60'
                }`}
                onClick={(e) => { e.stopPropagation(); pauseAutoAdvance(); setPage(i); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface LinkedWallet {
  id: string;
  chain: string;
  address: string;
  isPrimary: boolean;
}

interface CryptoModalState {
  purchaseId: string;
  address: string;
  amountDisplay: string;
  chain: string;
  expiresAt: string;
  paymentMethod: 'crypto_evm' | 'crypto_cardano';
  comingSoon?: boolean;
}

const CARD_BG = '[background:linear-gradient(160deg,#1a1640_0%,#221a50_100%)]';

const PACK_ART: Record<string, string> = {
  gems_100:  '/gem-packs/handful.png',
  gems_500:  '/gem-packs/satchel.png',
  gems_1200: '/gem-packs/chest.png',
  gems_2000: '/gem-packs/mountain.png',
  gems_2500: '/gem-packs/vault.png',
  gems_5000: '/gem-packs/trove.png',
};

const BADGE_CLASS =
  'inline-block px-2 py-0.5 rounded-[4px] text-[10px] font-black tracking-[1px] text-white uppercase';

const CONTENT_CHIP_CLASS =
  'inline-flex items-center gap-1 bg-black/25 border border-[rgba(139,92,246,0.15)] ' +
  'rounded-[6px] px-[7px] py-[3px] text-[12px] font-bold text-[#d8b4fe]';

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('derp_token') || ''}`,
  };
}

function useCountdown(limitedUntil?: string) {
  const now = useNow(60_000);
  if (!limitedUntil) return '';
  const diff = new Date(limitedUntil).getTime() - now;
  if (diff <= 0) return 'Expired';
  if (diff > 24 * 3_600_000) return '';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function useExpiryCountdown(expiresAt: string) {
  const now = useNow(1000);
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return 'Expired';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
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

function SectionHeader({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-0.5 pt-1 pb-0.5">
      <div className="text-[11px] font-black tracking-[1px] uppercase text-[#c4b5fd]">{label}</div>
      {subtitle && <div className="text-[10px] text-text-secondary leading-snug">{subtitle}</div>}
    </div>
  );
}

function SkeletonCard({ wide, tall }: { wide?: boolean; tall?: boolean }) {
  return (
    <div
      className={
        `rounded-[14px] ${CARD_BG} bg-[length:200%_100%] animate-[skeleton-shimmer_1.5s_infinite] ` +
        (wide ? 'h-[130px]' : tall ? 'h-[170px]' : 'h-[90px]')
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

function DerpPassBanner({ onCta, loading }: { onCta: () => void; loading: boolean }) {
  return (
    <div
      className="relative rounded-[16px] overflow-hidden px-4 py-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, #1c1240 0%, #2d1a5e 50%, #1a1040 100%)',
        border: '1px solid rgba(251,191,36,0.4)',
        boxShadow: '0 0 24px rgba(251,191,36,0.08)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.06) 0%, transparent 60%)' }}
      />
      <div className="absolute top-0 left-0 w-[60%] h-full pointer-events-none animate-[store-shimmer_4s_infinite_linear]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)' }} />

      <div className="relative flex items-start gap-3">
        <div
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-[10px]"
          style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}
        >
          <span className="text-[22px] leading-none">👑</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[15px] font-black text-[#fbbf24] tracking-[0.3px]">Derp Pass</span>
            <span
              className="text-[8px] font-black tracking-[1px] uppercase px-1.5 py-0.5 rounded-[4px]"
              style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }}
            >
              Subscription
            </span>
          </div>
          <div className="text-[11px] text-[#e2d9f3] leading-[1.5]">
            Get <span className="font-black text-[#fbbf24]">300 gems</span> instantly and{' '}
            <span className="font-black text-[#fbbf24]">100 gems</span> every day!
          </div>
          <div className="text-[10px] text-text-secondary mt-0.5">Exclusive badge &amp; bonuses included.</div>
        </div>
      </div>

      <div className="relative flex items-center gap-2.5">
        <button
          onClick={onCta}
          disabled={loading}
          className="flex-1 py-2.5 rounded-[10px] text-[12px] font-black tracking-[0.5px] uppercase cursor-pointer transition-all duration-150 active:scale-[0.98] disabled:opacity-60"
          style={{
            background: loading ? 'rgba(251,191,36,0.2)' : 'linear-gradient(135deg, #d97706, #f59e0b)',
            color: '#1c1004',
            border: '1px solid rgba(251,191,36,0.5)',
            boxShadow: loading ? 'none' : '0 2px 12px rgba(251,191,36,0.25)',
          }}
        >
          {loading ? 'Loading…' : '7 Day Free Trial'}
        </button>
        <div className="text-right">
          <div className="text-[11px] font-black text-white">$4.99</div>
          <div className="text-[9px] text-text-secondary">/month</div>
        </div>
      </div>
    </div>
  );
}

function formatUsd(unitAmount: number): string {
  return `$${(unitAmount / 100).toFixed(2)}`;
}

function ChainLabel({ chain }: { chain: string }) {
  if (chain === 'CARDANO') return <>🔵 ADA</>;
  return <>🔷 USDC</>;
}

function CryptoPayModal({
  state,
  onClose,
  onConfirmed,
}: {
  state: CryptoModalState;
  onClose: () => void;
  onConfirmed: (gemAmount: number) => void;
}) {
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'expired' | 'failed'>('pending');
  const [copied, setCopied] = useState(false);
  const [confirmedGems, setConfirmedGems] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeft = useExpiryCountdown(state.expiresAt);

  useEffect(() => {
    if (state.comingSoon) return;
    const token = localStorage.getItem('derp_token') || '';
    if (!token) return;
    const rawApiUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;
    const sseBase = rawApiUrl ? rawApiUrl.replace(/\/$/, '') : '/api';
    const es = new EventSource(`${sseBase}/v1/stream?token=${encodeURIComponent(token)}`);

    es.addEventListener('purchase.confirmed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.purchaseId === state.purchaseId) {
          setConfirmedGems(data.gemAmount ?? 0);
          setStatus('confirmed');
        }
      } catch { }
    });

    return () => es.close();
  }, [state.purchaseId, state.comingSoon]);

  useEffect(() => {
    if (state.comingSoon) return;
    if (status !== 'pending') return;

    const poll = async () => {
      try {
        const resp = await fetch(`/api/v1/purchases/${state.purchaseId}`, {
          headers: authHeaders(),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.status === 'CONFIRMED') {
          setConfirmedGems(data.gemAmount ?? 0);
          setStatus('confirmed');
        } else if (data.status === 'EXPIRED' || data.status === 'FAILED') {
          setStatus(data.status === 'EXPIRED' ? 'expired' : 'failed');
        }
      } catch { }
    };

    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state.purchaseId, state.comingSoon, status]);

  useEffect(() => {
    if (status === 'confirmed') {
      if (pollRef.current) clearInterval(pollRef.current);
      const t = setTimeout(() => onConfirmed(confirmedGems), 1800);
      return () => clearTimeout(t);
    }
  }, [status, confirmedGems, onConfirmed]);

  useEffect(() => {
    if (timeLeft === 'Expired' && status === 'pending') {
      setStatus('expired');
    }
  }, [timeLeft, status]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(state.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [state.address]);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(state.address)}&bgcolor=1a1640&color=c4b5fd&margin=6`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm mx-2 mb-0 sm:mb-0 [background:linear-gradient(160deg,#12103a_0%,#1a1550_100%)] border border-[rgba(139,92,246,0.3)] rounded-t-[20px] sm:rounded-[20px] overflow-hidden shadow-[0_0_40px_rgba(139,92,246,0.2)]">

        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[rgba(139,92,246,0.15)]">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">💳</span>
            <span className="text-[15px] font-black text-white">Pay with Wallet</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-text-secondary hover:text-white cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {status === 'confirmed' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-5">
            <div className="text-[48px] animate-[card-enter_0.3s_ease-out_both]">✅</div>
            <div className="text-[18px] font-black text-white">Payment Confirmed!</div>
            <div className="text-[13px] text-[#a3e635] font-bold">
              +{confirmedGems.toLocaleString()} Gems added to your account
            </div>
          </div>
        ) : status === 'expired' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-5">
            <div className="text-[48px]">⏰</div>
            <div className="text-[16px] font-black text-white">Payment Window Expired</div>
            <div className="text-[13px] text-text-secondary text-center">This payment request has expired. Please start a new purchase.</div>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2 rounded-[8px] text-[13px] font-bold bg-[rgba(139,92,246,0.2)] border border-[rgba(139,92,246,0.4)] text-[#c4b5fd] cursor-pointer hover:bg-[rgba(139,92,246,0.3)] transition-colors"
            >
              Close
            </button>
          </div>
        ) : status === 'failed' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-5">
            <div className="text-[48px]">❌</div>
            <div className="text-[16px] font-black text-white">Payment Failed</div>
            <div className="text-[13px] text-text-secondary text-center">Something went wrong. Please contact support if gems were deducted.</div>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2 rounded-[8px] text-[13px] font-bold bg-[rgba(139,92,246,0.2)] border border-[rgba(139,92,246,0.4)] text-[#c4b5fd] cursor-pointer hover:bg-[rgba(139,92,246,0.3)] transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-text-secondary">Chain</span>
              <span className="font-bold text-[#c4b5fd]"><ChainLabel chain={state.chain} /></span>
            </div>

            <div className="flex flex-col items-center gap-3 py-2">
              <div className="border-2 border-[rgba(139,92,246,0.4)] rounded-[12px] p-1.5 bg-[#0e0c2a]">
                <img
                  src={qrUrl}
                  alt="Payment QR code"
                  width={160}
                  height={160}
                  className="rounded-[8px]"
                />
              </div>
              <div className="text-[11px] text-text-secondary">Scan or copy the address below</div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] text-text-secondary uppercase tracking-wide font-semibold">Send to address</div>
              <div className="flex items-center gap-2 bg-black/30 border border-[rgba(139,92,246,0.2)] rounded-[8px] px-3 py-2">
                <div className="flex-1 text-[11px] text-[#c4b5fd] font-mono break-all leading-snug">{state.address}</div>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 px-2 py-1 text-[11px] font-bold rounded-[5px] border cursor-pointer transition-colors duration-150 border-[rgba(139,92,246,0.4)] text-[#c4b5fd] hover:bg-[rgba(139,92,246,0.15)]"
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between bg-black/20 border border-[rgba(139,92,246,0.15)] rounded-[8px] px-3 py-2.5">
              <span className="text-[12px] text-text-secondary">Exact amount</span>
              <span className="text-[14px] font-black text-white">{state.amountDisplay}</span>
            </div>

            {state.comingSoon ? (
              <div className="flex flex-col items-center gap-2 bg-[rgba(251,191,36,0.06)] border border-[rgba(251,191,36,0.2)] rounded-[10px] px-4 py-3 text-center">
                <span className="text-[16px]">🚧</span>
                <div className="text-[12px] font-black text-[#fbbf24] uppercase tracking-wide">Coming Soon</div>
                <div className="text-[11px] text-text-secondary leading-snug">
                  On-chain payments are not yet live. This preview shows what the payment flow will look like.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
                    Waiting for payment…
                  </span>
                  <span className={`font-mono font-bold ${timeLeft === 'Expired' ? 'text-red-400' : 'text-[#fbbf24]'}`}>
                    {timeLeft}
                  </span>
                </div>
                <div className="text-[10px] text-text-secondary text-center leading-snug px-2">
                  Send the exact amount shown. Payments are detected automatically and gems are credited instantly.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GemPackCard({
  pack,
  onBuyCard,
  onBuyWallet,
  buying,
  hasWallet,
}: {
  pack: GemPack;
  onBuyCard: (pack: GemPack) => void;
  onBuyWallet: (pack: GemPack) => void;
  buying: boolean;
  hasWallet: boolean;
}) {
  return (
    <div
      className="relative flex flex-col rounded-[14px] overflow-hidden motion-safe:animate-[card-enter_0.2s_ease-out_both]"
      style={{
        background: 'linear-gradient(160deg,#131028 0%,#1c1640 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderTop: `3px solid ${pack.accentColor}`,
        boxShadow: pack.glowColor !== 'transparent'
          ? `0 0 18px ${pack.glowColor}, inset 0 1px 0 rgba(255,255,255,0.05)`
          : 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {pack.badgeType === 'best_value' && (
        <span
          className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-[5px] text-[7px] font-black tracking-[0.8px] text-white uppercase whitespace-nowrap leading-none"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}
        >
          BEST VALUE
        </span>
      )}

      <div className="px-2 pt-2 pb-0 text-center">
        <div className="text-[9px] font-black tracking-[1.4px] uppercase leading-none" style={{ color: pack.accentColor }}>
          {pack.displayName}
        </div>
      </div>

      <div
        className="relative mx-2 mt-1.5 mb-0 rounded-[8px] overflow-hidden flex items-center justify-center"
        style={{
          background: `radial-gradient(ellipse at 50% 60%, ${pack.borderColor} 0%, transparent 70%)`,
          height: '72px',
        }}
      >
        {PACK_ART[pack.id] ? (
          <img
            src={PACK_ART[pack.id]}
            alt={pack.displayName}
            className="h-full w-full object-cover object-center"
            draggable={false}
          />
        ) : (
          <div className="py-2.5">
            <GameIcon src="premium_gems" size={pack.iconSize} />
          </div>
        )}
        {pack.badgeType === 'extra' && pack.badgeLabel && (
          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-[4px] text-[7px] font-black tracking-[0.5px] text-white uppercase leading-none bg-[#16a34a] z-10">
            {pack.badgeLabel}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-0 px-1 pb-0.5 mt-1">
        <div className="text-[15px] font-black text-white leading-none">
          {pack.gemAmount.toLocaleString()}
        </div>
        <div className="text-[8px] text-text-secondary font-semibold uppercase tracking-wide">Gems</div>
      </div>

      <div className="px-2 pb-2 pt-1.5 flex flex-col gap-1 mt-auto">
        <button
          disabled={buying}
          onClick={() => onBuyCard(pack)}
          data-sfx="ui.button_primary"
          className={
            `w-full py-1.5 rounded-[7px] text-[11px] font-black tracking-[0.3px] border-0 cursor-pointer ` +
            `transition-colors duration-150 ` +
            (buying
              ? 'opacity-50 cursor-not-allowed bg-[#15803d] text-white/60'
              : 'bg-[#16a34a] hover:bg-[#15803d] text-white')
          }
        >
          {buying ? '…' : formatUsd(pack.unitAmount)}
        </button>
        {hasWallet && (
          <button
            disabled={buying}
            onClick={() => onBuyWallet(pack)}
            data-sfx="ui.button_primary"
            className={
              `w-full py-1 rounded-[6px] text-[9px] font-bold tracking-[0.2px] border cursor-pointer ` +
              `transition-colors duration-150 bg-transparent ` +
              (buying
                ? 'opacity-40 cursor-not-allowed border-[rgba(139,92,246,0.15)] text-text-secondary'
                : 'border-[rgba(139,92,246,0.25)] text-text-secondary hover:border-[rgba(139,92,246,0.5)] hover:text-[#c4b5fd]')
            }
          >
            💳 Pay with Wallet
          </button>
        )}
      </div>
    </div>
  );
}

export default function StoreContent() {
  const [tabs, setTabs] = useState<ShopTab[]>([]);
  const [sections, setSections] = useState<ShopSection[]>([]);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [heroes, setHeroes] = useState<ShopHero[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('featured');

  const [gemPacks, setGemPacks] = useState<GemPack[]>([]);
  const [gemPacksLoading, setGemPacksLoading] = useState(false);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  const [gemPacksError, setGemPacksError] = useState<string | null>(null);

  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [cryptoModal, setCryptoModal] = useState<CryptoModalState | null>(null);
  const [chainSelectPack, setChainSelectPack] = useState<GemPack | null>(null);
  const [successGems, setSuccessGems] = useState<number | null>(null);
  const [comingSoonCard, setComingSoonCard] = useState(false);
  const [comingSoonPass, setComingSoonPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);

  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);

  const { pushModal } = useModal();

  const hasEvmWallet = wallets.some((w) => w.chain !== 'CARDANO');
  const hasCardanoWallet = wallets.some((w) => w.chain === 'CARDANO');
  const hasAnyWallet = hasEvmWallet || hasCardanoWallet;
  const hasBothChains = hasEvmWallet && hasCardanoWallet;

  useEffect(() => {
    fetch('/api/shop/items', { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data.items)) {
          setItems(data.items);
          setTabs(data.tabs ?? []);
          setSections(data.sections ?? []);
          setHeroes(data.heroes ?? []);
          if (data.tabs?.length > 0) {
            setActiveTab((prev) =>
              data.tabs.find((t: ShopTab) => t.id === prev) ? prev : data.tabs[0].id
            );
          }
        } else if (Array.isArray(data)) {
          setItems(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/player/wallets', { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setWallets(data); })
      .catch(() => {});
  }, []);

  const activeTabDef = tabs.find((t) => t.id === activeTab);
  const isGemPacksTab = activeTabDef?.tabType === 'gems_packs';

  useEffect(() => {
    if (!isGemPacksTab) return;
    setGemPacksLoading(true);
    setGemPacksError(null);
    fetch('/api/v1/payments/packs')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGemPacks(data);
        else setGemPacksError('Could not load gem packs.');
      })
      .catch(() => setGemPacksError('Could not load gem packs.'))
      .finally(() => setGemPacksLoading(false));
  }, [isGemPacksTab]);

  const handleBuyGemPack = useCallback(async (pack: GemPack) => {
    setBuyingPackId(pack.id);
    try {
      const resp = await fetch('/api/v1/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ packId: pack.id, paymentMethod: 'stripe' }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message ?? 'Purchase failed');
      if (data?.comingSoon || data?.action?.type === 'coming_soon') {
        setComingSoonCard(true);
        return;
      }
      if (data?.action?.type === 'redirect' && data.action.url) {
        window.location.href = data.action.url;
      }
    } catch (err: any) {
      alert(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBuyingPackId(null);
    }
  }, []);

  const initiateCryptoPurchase = useCallback(async (
    pack: GemPack,
    paymentMethod: 'crypto_evm' | 'crypto_cardano',
  ) => {
    setBuyingPackId(pack.id);
    setChainSelectPack(null);
    try {
      const resp = await fetch('/api/v1/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ packId: pack.id, paymentMethod }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message ?? 'Purchase failed');
      if (data?.action?.type === 'payment_address') {
        setCryptoModal({
          purchaseId: data.purchaseId,
          address: data.action.address,
          amountDisplay: data.action.amountDisplay ?? data.action.amountExpected,
          chain: data.action.chain,
          expiresAt: data.action.expiresAt,
          paymentMethod,
          comingSoon: data.comingSoon ?? false,
        });
      }
    } catch (err: any) {
      alert(err?.message ?? 'Could not start crypto payment. Please try again.');
    } finally {
      setBuyingPackId(null);
    }
  }, []);

  const handleDerpPassCta = useCallback(async () => {
    setPassLoading(true);
    try {
      const resp = await fetch('/api/v1/subscriptions/derp-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message ?? 'Request failed');
      if (data?.comingSoon || data?.action?.type === 'coming_soon') {
        setComingSoonPass(true);
        return;
      }
      if (data?.action?.type === 'redirect' && data.action.url) {
        window.location.href = data.action.url;
      }
    } catch (err: any) {
      alert(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setPassLoading(false);
    }
  }, []);

  const handleBuyWithWallet = useCallback((pack: GemPack) => {
    if (hasBothChains) {
      setChainSelectPack(pack);
    } else {
      const method = hasCardanoWallet ? 'crypto_cardano' : 'crypto_evm';
      initiateCryptoPurchase(pack, method);
    }
  }, [hasBothChains, hasCardanoWallet, initiateCryptoPurchase]);

  const handleCryptoConfirmed = useCallback((gemAmount: number) => {
    setCryptoModal(null);
    setSuccessGems(gemAmount);
    setTimeout(() => setSuccessGems(null), 4000);
  }, []);

  const tabItems = items.filter((i) => i.tab === activeTab);
  const tabSections = sections
    .filter((s) => s.tabId === activeTab)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function renderItemGroup(groupItems: ShopItem[], layout: string) {
    if (layout === 'featured') {
      return (
        <div className="flex flex-col gap-2.5">
          {groupItems.map((item) => (
            <FeaturedCard key={item.id} item={item} onOpen={handleOpenModal} />
          ))}
        </div>
      );
    }
    if (layout === 'grid-3') {
      return (
        <div className="grid grid-cols-3 gap-2">
          {groupItems.map((item) => (
            <CurrencyCard key={item.id} item={item} onOpen={handleOpenModal} />
          ))}
        </div>
      );
    }
    if (activeTab === 'bundle') {
      return (
        <div className="grid grid-cols-2 gap-2.5">
          {groupItems.map((item) => (
            <BundleCard key={item.id} item={item} onOpen={handleOpenModal} />
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {groupItems.map((item) => (
          <ItemCard key={item.id} item={item} onOpen={handleOpenModal} />
        ))}
      </div>
    );
  }

  function renderTabItemsWithSections() {
    const layout = activeTabDef?.layout ?? 'grid-2';
    const placeBefore = (activeTabDef?.ungroupedPlacement ?? 'before') === 'before';
    if (tabSections.length === 0) {
      return renderItemGroup(tabItems, layout);
    }
    const ungrouped = tabItems.filter((i) => !i.sectionId);
    const sectionedBlock = tabSections.map((section) => {
      const sectionItems = tabItems.filter((i) => i.sectionId === section.id);
      if (sectionItems.length === 0) return null;
      return (
        <div key={section.id} className="flex flex-col gap-2">
          <SectionHeader label={section.label} subtitle={section.subtitle} />
          {renderItemGroup(sectionItems, layout)}
        </div>
      );
    });
    const ungroupedBlock = ungrouped.length > 0 ? renderItemGroup(ungrouped, layout) : null;
    return (
      <div className="flex flex-col gap-3">
        {placeBefore ? ungroupedBlock : null}
        {sectionedBlock}
        {!placeBefore ? ungroupedBlock : null}
      </div>
    );
  }

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
      {successGems !== null && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#14532d] border border-[#22c55e] text-[#bbf7d0] rounded-[10px] px-4 py-2.5 text-[13px] font-bold shadow-lg animate-[card-enter_0.3s_ease-out_both]">
          ✅ +{successGems.toLocaleString()} Gems received!
        </div>
      )}

      {chainSelectPack && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setChainSelectPack(null); }}
        >
          <div className="w-full max-w-xs mx-3 [background:linear-gradient(160deg,#12103a_0%,#1a1550_100%)] border border-[rgba(139,92,246,0.3)] rounded-t-[20px] sm:rounded-[20px] p-5 flex flex-col gap-4 shadow-[0_0_40px_rgba(139,92,246,0.2)]">
            <div className="text-[15px] font-black text-white">Select Chain</div>
            <div className="text-[12px] text-text-secondary">Which blockchain would you like to pay with?</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => initiateCryptoPurchase(chainSelectPack, 'crypto_evm')}
                className="w-full py-3 rounded-[10px] text-[13px] font-bold bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.4)] text-[#c4b5fd] hover:bg-[rgba(139,92,246,0.3)] cursor-pointer transition-colors"
              >
                🔷 Ethereum / USDC
              </button>
              <button
                onClick={() => initiateCryptoPurchase(chainSelectPack, 'crypto_cardano')}
                className="w-full py-3 rounded-[10px] text-[13px] font-bold bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.4)] text-[#c4b5fd] hover:bg-[rgba(139,92,246,0.3)] cursor-pointer transition-colors"
              >
                🔵 Cardano / ADA
              </button>
            </div>
            <button
              onClick={() => setChainSelectPack(null)}
              className="text-[12px] text-text-secondary hover:text-white cursor-pointer transition-colors bg-transparent border-0"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {cryptoModal && (
        <CryptoPayModal
          state={cryptoModal}
          onClose={() => setCryptoModal(null)}
          onConfirmed={handleCryptoConfirmed}
        />
      )}

      {comingSoonPass && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setComingSoonPass(false); }}
        >
          <div className="w-full max-w-xs mx-3 [background:linear-gradient(160deg,#12103a_0%,#1a1550_100%)] border border-[rgba(251,191,36,0.3)] rounded-t-[20px] sm:rounded-[20px] p-6 flex flex-col items-center gap-4 shadow-[0_0_40px_rgba(251,191,36,0.1)] text-center">
            <span className="text-[40px]">👑</span>
            <div className="text-[16px] font-black text-[#fbbf24]">Derp Pass Coming Soon</div>
            <div className="text-[12px] text-text-secondary leading-relaxed">
              Subscriptions are not yet live. Stay tuned — the Derp Pass will be available soon!
            </div>
            <button
              onClick={() => setComingSoonPass(false)}
              className="w-full py-2.5 rounded-[10px] text-[13px] font-bold bg-[rgba(251,191,36,0.12)] border border-[rgba(251,191,36,0.35)] text-[#fbbf24] hover:bg-[rgba(251,191,36,0.25)] cursor-pointer transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {comingSoonCard && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setComingSoonCard(false); }}
        >
          <div className="w-full max-w-xs mx-3 [background:linear-gradient(160deg,#12103a_0%,#1a1550_100%)] border border-[rgba(139,92,246,0.3)] rounded-t-[20px] sm:rounded-[20px] p-6 flex flex-col items-center gap-4 shadow-[0_0_40px_rgba(139,92,246,0.2)] text-center">
            <span className="text-[40px]">🚧</span>
            <div className="text-[16px] font-black text-white">Card Payments Coming Soon</div>
            <div className="text-[12px] text-text-secondary leading-relaxed">
              Stripe card payments are not yet live. Connect the Stripe integration to enable real purchases.
            </div>
            <button
              onClick={() => setComingSoonCard(false)}
              className="w-full py-2.5 rounded-[10px] text-[13px] font-bold bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.4)] text-[#c4b5fd] hover:bg-[rgba(139,92,246,0.3)] cursor-pointer transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden flex flex-col flex-1 min-h-0">

        <StoreHeroCarousel heroes={heroes} onTabSelect={setActiveTab} />

        <div className="flex gap-2 flex-wrap px-3.5 pt-3 pb-2.5">
          {mainCurrencies.map((id) => (
            <span key={id} className="flex items-center gap-1.5 bg-black/35 border border-[rgba(139,92,246,0.2)] rounded-full px-2.5 py-[5px] text-[13px] font-bold text-[#e2d9f3]">
              <ItemQty src={id} amount={currencyBalances[id] ?? 0} size={16} />
            </span>
          ))}
        </div>

        <div className="flex bg-black/25 border-y border-[rgba(139,92,246,0.12)] overflow-x-auto overflow-y-hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={
                `flex-shrink-0 flex-1 min-w-[60px] py-2.5 px-1 text-[11px] font-bold tracking-[0.5px] uppercase bg-transparent ` +
                `border-0 border-b-2 cursor-pointer transition-[color,border-color] duration-150 ` +
                (activeTab === tab.id
                  ? 'text-[#c4b5fd] border-b-derp-purple'
                  : 'text-text-secondary border-b-transparent')
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.name}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] p-3.5">
          {isGemPacksTab ? (
            gemPacksLoading ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-2"></div>
                <div className="grid grid-cols-3 gap-2">
                  {[0,1,2,3,4,5].map(i => <SkeletonCard key={i} tall />)}
                </div>
              </div>
            ) : gemPacksError ? (
              <div className="text-center py-10 px-5 text-text-secondary text-[14px]">{gemPacksError}</div>
            ) : gemPacks.length === 0 ? (
              <div className="text-center py-10 px-5 text-text-secondary text-[14px]">
                <div className="text-[28px] mb-2">💎</div>
                <div className="font-semibold text-text-primary mb-1">Gem packs coming soon</div>
                <div className="text-[12px]">Connect Stripe in the Integrations tab to enable purchases.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { icon: '⏱️', title: 'SPEED UP',    desc: 'Reduce timers\n& queues'     },
                    { icon: '👕', title: 'COSMETICS',   desc: 'Unique skins\n& outfits'     },
                    { icon: '📦', title: 'EXTRA SLOTS', desc: 'Expand your\ncapacity'       },
                    { icon: '⚡', title: 'RECHARGE',    desc: 'More energy\nfor missions'   },
                  ] as const).map(({ icon, title, desc }) => (
                    <div
                      key={title}
                      className="flex flex-col items-center gap-1 rounded-[10px] px-1 py-2 text-center"
                      style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.15)' }}
                    >
                      <span className="text-[18px] leading-none">{icon}</span>
                      <div className="text-[7px] font-black tracking-[0.8px] text-[#c4b5fd] uppercase leading-none">{title}</div>
                      <div className="text-[7px] text-text-secondary leading-snug whitespace-pre-line">{desc}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {gemPacks.map((pack) => (
                    <GemPackCard
                      key={pack.id}
                      pack={pack}
                      onBuyCard={handleBuyGemPack}
                      onBuyWallet={handleBuyWithWallet}
                      buying={buyingPackId === pack.id}
                      hasWallet={hasAnyWallet}
                    />
                  ))}
                </div>

                <DerpPassBanner onCta={handleDerpPassCta} loading={passLoading} />

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {([
                    { icon: '🔒', title: 'Safe & Secure',      desc: 'Purchases are secure.\nWe never store\npayment info.'      },
                    { icon: '⚖️', title: 'Fair & Balanced',    desc: 'Cosmetics only.\nNever\nPay-to-Win.'                       },
                    { icon: '🎁', title: 'Supports the Game',  desc: 'Purchases fund\nnew content\n& improvements.'              },
                  ] as const).map(({ icon, title, desc }) => (
                    <div
                      key={title}
                      className="flex flex-col items-center gap-1 rounded-[10px] px-1.5 py-2.5 text-center"
                      style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}
                    >
                      <span className="text-[16px] leading-none">{icon}</span>
                      <div className="text-[7px] font-black text-text-primary uppercase tracking-wide leading-tight">{title}</div>
                      <div className="text-[7px] text-text-secondary leading-snug whitespace-pre-line">{desc}</div>
                    </div>
                  ))}
                </div>

                <div className="text-[9px] text-text-secondary text-center px-4 pb-1">
                  Payments processed securely. Gems delivered instantly after confirmation.
                </div>
              </div>
            )
          ) : loading ? (
            <div className="flex flex-col gap-2.5">
              {activeTabDef?.layout === 'featured' ? (
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
          ) : (
            renderTabItemsWithSections()
          )}
        </div>

      </div>
    </div>
  );
}
