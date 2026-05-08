import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHomeBanners } from '../../hooks/useSyncSelectors';
import { formatSeasonRemaining } from '../../utils/formatSeasonRemaining';
import type { HomeBannerSnapshot } from '../../store/syncSlice';

const SWIPE_THRESHOLD_PX = 50;
const TAP_THRESHOLD_PX = 8;
const DEFAULT_AUTO_ADVANCE_MS = 7000;
const INTERACTION_PAUSE_MS = 10000;

/**
 * Data-driven home banner carousel. Renders the active set returned by the
 * server (filtered live against `Date.now()` so banners drop out when their
 * `endsAt` passes without waiting for a re-bootstrap):
 *   - 0 banners → renders nothing (the slot collapses)
 *   - 1 banner  → static card (no dots, no swipe handlers)
 *   - 2+        → swipeable carousel with page dots and auto-advance
 *
 * Swipe vs tap is distinguished by the magnitude of the touch delta at
 * touch-end: < TAP_THRESHOLD_PX is treated as a tap (CTA navigates),
 * > SWIPE_THRESHOLD_PX advances/retreats by one card.
 *
 * Auto-advance pauses for INTERACTION_PAUSE_MS after any user interaction
 * (swipe, dot click, CTA tap) so the user isn't yanked off a card they
 * just chose. The opt-out flag `config.autoAdvance: false` on any banner
 * disables auto-advance for the whole rotation.
 */
export function BannerCarousel() {
  const navigate = useNavigate();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const banners = useHomeBanners(nowMs);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  useEffect(() => () => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
  }, []);

  useEffect(() => {
    if (page >= banners.length && banners.length > 0) setPage(0);
  }, [banners.length, page]);

  const autoAdvanceMs = useMemo(() => {
    const max = banners.reduce((acc, b) => {
      const v = Number(b.config?.autoAdvanceMs);
      return Number.isFinite(v) && v > 0 ? Math.max(acc, v) : acc;
    }, 0);
    return max > 0 ? max : DEFAULT_AUTO_ADVANCE_MS;
  }, [banners]);

  const autoAdvanceDisabled = useMemo(
    () => banners.some((b) => b.config?.autoAdvance === false),
    [banners],
  );

  useEffect(() => {
    if (banners.length < 2 || autoAdvanceDisabled || paused) return;
    const id = setInterval(() => {
      setPage((p) => (p + 1) % banners.length);
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [banners.length, autoAdvanceMs, autoAdvanceDisabled, paused]);

  const pauseAutoAdvance = useCallback(() => {
    setPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => {
      setPaused(false);
      pauseTimerRef.current = null;
    }, INTERACTION_PAUSE_MS);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }, []);

  const goTo = useCallback((banner: HomeBannerSnapshot) => {
    pauseAutoAdvance();
    if (banner.ctaRoute) navigate(banner.ctaRoute);
  }, [navigate, pauseAutoAdvance]);

  const suppressClickRef = useRef(false);
  const handleTouchEnd = useCallback((banner: HomeBannerSnapshot) => {
    const delta = touchDeltaX.current;
    const abs = Math.abs(delta);
    if (abs <= TAP_THRESHOLD_PX) {
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 400);
      goTo(banner);
      return;
    }
    if (abs < SWIPE_THRESHOLD_PX) return;
    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 400);
    if (banners.length < 2) return;
    pauseAutoAdvance();
    if (delta < 0) {
      setPage((p) => (p + 1) % banners.length);
    } else {
      setPage((p) => (p - 1 + banners.length) % banners.length);
    }
  }, [banners.length, goTo, pauseAutoAdvance]);

  const handleCardClick = useCallback((banner: HomeBannerSnapshot) => {
    if (suppressClickRef.current) return;
    goTo(banner);
  }, [goTo]);

  if (banners.length === 0) return null;

  const activeIndex = Math.min(page, banners.length - 1);
  const banner = banners[activeIndex];
  const tagline = banner.config?.tagline ?? banner.description ?? null;
  const isCarousel = banners.length > 1;

  return (
    <div className="mb-4">
      <div
        className="relative rounded-[14px] overflow-hidden cursor-pointer transition-all border border-[rgba(139,92,246,0.3)] select-none touch-pan-y hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(139,92,246,0.3)]"
        data-testid="home-banner"
        data-banner-id={banner.id}
        onClick={() => handleCardClick(banner)}
        onTouchStart={isCarousel ? handleTouchStart : undefined}
        onTouchMove={isCarousel ? handleTouchMove : undefined}
        onTouchEnd={isCarousel ? () => handleTouchEnd(banner) : undefined}
      >
        {banner.backgroundImage && (
          <img src={banner.backgroundImage} alt="" className="w-full h-[170px] object-cover block" />
        )}
        <div className="absolute inset-0 p-5 flex flex-col justify-center bg-gradient-to-br from-[rgba(15,10,40,0.85)] via-[rgba(30,20,60,0.5)] to-transparent">
          <h3 className="font-cinzel text-[22px] max-[520px]:text-[18px] font-black tracking-[0.1em] text-[#f0e6ff] mb-1 [text-shadow:0_2px_8px_rgba(139,92,246,0.5)]">
            {String(banner.title || '').toUpperCase()}
          </h3>
          <BannerSubtitle banner={banner} />
          {tagline && <p className="text-[13px] text-white/60 mb-3">{tagline}</p>}
          {banner.ctaLabel && (
            <button
              className="self-start bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white border-0 rounded-lg px-4 py-2 text-xs font-extrabold tracking-[0.08em] cursor-pointer transition-transform hover:scale-105"
              onClick={(e) => { e.stopPropagation(); goTo(banner); }}
            >
              {banner.ctaLabel}
            </button>
          )}
        </div>

        {isCarousel && (
          <div
            className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 pointer-events-auto"
            role="tablist"
            aria-label="Banner pagination"
          >
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Banner ${i + 1} of ${banners.length}`}
                className={`w-[7px] h-[7px] rounded-full border-0 p-0 cursor-pointer transition-all ${
                  i === activeIndex
                    ? 'bg-[#f0e6ff] scale-125 shadow-[0_0_6px_rgba(196,181,253,0.8)]'
                    : 'bg-white/35 hover:bg-white/60'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  pauseAutoAdvance();
                  setPage(i);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Subtitle renderer. Uses pure JSX text + a `<strong>` countdown chip so
 * admin-authored strings can never inject HTML — even if a banner row's
 * `subtitle` field gets corrupted or maliciously crafted, the text is
 * displayed as-is, never parsed.
 */
function BannerSubtitle({ banner }: { banner: HomeBannerSnapshot }) {
  const remaining = banner.endsAt ? formatSeasonRemaining(banner.endsAt) : '';
  if (remaining) {
    const prefix = banner.subtitle && !banner.subtitle.includes(':')
      ? banner.subtitle
      : (banner.seasonId ? 'SEASON ENDS IN' : 'ENDS IN');
    return (
      <p className="text-[13px] text-[#c4b5fd] mb-0.5">
        {prefix}: <strong className="text-[#fbbf24]">{remaining}</strong>
      </p>
    );
  }
  if (banner.subtitle) {
    return <p className="text-[13px] text-[#c4b5fd] mb-0.5">{banner.subtitle}</p>;
  }
  return null;
}
