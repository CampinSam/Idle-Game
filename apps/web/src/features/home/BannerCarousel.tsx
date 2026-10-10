import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNow, useInterval } from '../../hooks/useNow';
import { useNavigate } from 'react-router-dom';
import { useHomeBanners } from '../../hooks/useSyncSelectors';
import { formatSeasonRemaining } from '../../utils/formatSeasonRemaining';
import { resolveAssetUrl } from '../../utils/iconResolver';
import type { HomeBannerSnapshot } from '../../store/syncSlice';

const SWIPE_THRESHOLD_PX = 50;
const TAP_THRESHOLD_PX = 8;
const DEFAULT_AUTO_ADVANCE_MS = 7000;
const INTERACTION_PAUSE_MS = 10000;

const DEFAULT_ACCENT_COLOR = 'rgba(139,92,246,0.3)';
const DEFAULT_OVERLAY_GRADIENT = 'linear-gradient(135deg, rgba(15,10,40,0.85) 0%, rgba(30,20,60,0.5) 60%, transparent 100%)';
const DEFAULT_TITLE_COLOR = '#f0e6ff';
const DEFAULT_SUBTITLE_COLOR = '#c4b5fd';
const DEFAULT_TAGLINE_COLOR = 'rgba(255,255,255,0.6)';
const DEFAULT_IMAGE_HEIGHT = 170;

const CTA_VARIANT_CLASSES: Record<string, string> = {
  primary: 'bg-gradient-to-br from-derp-purple to-[#7c3aed] text-white',
  gold: 'bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-white',
  outline: 'bg-transparent border border-white/60 text-white',
  ghost: 'bg-white/10 text-white',
};

interface BannerDisplay {
  accentColor: string;
  cardBackground: string;
  overlayGradient: string;
  titleColor: string;
  subtitleColor: string;
  taglineColor: string;
  ctaVariant: string;
  ctaBackground: string | undefined;
  ctaTextColor: string | undefined;
  badge: string | undefined;
  badgeColor: string;
  textAlign: 'left' | 'center' | 'right';
  imageHeight: number;
  imageObjectPosition: string;
}

function resolveBannerDisplay(banner: HomeBannerSnapshot): BannerDisplay {
  const d = (banner.display && typeof banner.display === 'object') ? banner.display : {};
  return {
    accentColor: (d.accentColor as string) || DEFAULT_ACCENT_COLOR,
    cardBackground: (d.cardBackground as string) || '#0f0a28',
    overlayGradient: (d.overlayGradient as string) || DEFAULT_OVERLAY_GRADIENT,
    titleColor: (d.titleColor as string) || DEFAULT_TITLE_COLOR,
    subtitleColor: (d.subtitleColor as string) || DEFAULT_SUBTITLE_COLOR,
    taglineColor: (d.taglineColor as string) || DEFAULT_TAGLINE_COLOR,
    ctaVariant: (d.ctaVariant as string) || 'primary',
    ctaBackground: (d.ctaBackground as string) || undefined,
    ctaTextColor: (d.ctaTextColor as string) || undefined,
    badge: (d.badge as string) || undefined,
    badgeColor: (d.badgeColor as string) || '#7c3aed',
    textAlign: (d.textAlign as 'left' | 'center' | 'right') || 'left',
    imageHeight: typeof d.imageHeight === 'number' ? d.imageHeight : DEFAULT_IMAGE_HEIGHT,
    imageObjectPosition: (d.imageObjectPosition as string) || 'center',
  };
}

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
 *
 * Visual appearance is driven by the `display` JSON field on each banner row.
 * All options fall back to the default purple RPG theme when unset.
 */
export function BannerCarousel() {
  const navigate = useNavigate();
  const nowMs = useNow(60_000);
  const banners = useHomeBanners(nowMs);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cardHovered, setCardHovered] = useState(false);
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

  const autoAdvanceEnabled = banners.length >= 2 && !autoAdvanceDisabled && !paused;
  useInterval(() => setPage((p) => (p + 1) % banners.length), autoAdvanceMs, autoAdvanceEnabled);

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
  const display = resolveBannerDisplay(banner);
  const ctaBaseClass = CTA_VARIANT_CLASSES[display.ctaVariant] ?? CTA_VARIANT_CLASSES.primary;

  return (
    <div className="mb-4">
      <div
        className="relative rounded-[14px] overflow-hidden cursor-pointer transition-all border select-none touch-pan-y hover:-translate-y-0.5"
        style={{
          borderColor: display.accentColor,
          boxShadow: cardHovered ? `0 8px 24px ${display.accentColor}` : undefined,
          backgroundColor: banner.backgroundImage ? undefined : display.cardBackground,
        }}
        data-testid="home-banner"
        data-banner-id={banner.id}
        onClick={() => handleCardClick(banner)}
        onMouseEnter={() => setCardHovered(true)}
        onMouseLeave={() => setCardHovered(false)}
        onTouchStart={isCarousel ? handleTouchStart : undefined}
        onTouchMove={isCarousel ? handleTouchMove : undefined}
        onTouchEnd={isCarousel ? () => handleTouchEnd(banner) : undefined}
      >
        {banner.backgroundImage && (
          <img
            src={resolveAssetUrl(banner.backgroundImage) ?? banner.backgroundImage}
            alt=""
            className="w-full object-cover block"
            style={{ height: display.imageHeight, objectPosition: display.imageObjectPosition }}
          />
        )}

        <div
          className="absolute inset-0 p-5 flex flex-col justify-center"
          style={{
            background: display.overlayGradient,
            textAlign: display.textAlign,
            alignItems: display.textAlign === 'center' ? 'center' : display.textAlign === 'right' ? 'flex-end' : 'flex-start',
          }}
        >
          <h3
            className="font-cinzel text-[22px] max-[520px]:text-[18px] font-black tracking-[0.1em] mb-1 [text-shadow:0_2px_8px_rgba(139,92,246,0.5)]"
            style={{ color: display.titleColor }}
          >
            {String(banner.title || '').toUpperCase()}
          </h3>

          <BannerSubtitle banner={banner} subtitleColor={display.subtitleColor} />

          {tagline && (
            <p className="text-[13px] mb-3" style={{ color: display.taglineColor }}>
              {tagline}
            </p>
          )}

          {banner.ctaLabel && (
            <button
              className={`border-0 rounded-lg px-4 py-2 text-xs font-extrabold tracking-[0.08em] cursor-pointer transition-transform hover:scale-105 ${ctaBaseClass}`}
              style={
                display.ctaBackground || display.ctaTextColor
                  ? {
                      background: display.ctaBackground ?? undefined,
                      color: display.ctaTextColor ?? undefined,
                    }
                  : undefined
              }
              onClick={(e) => { e.stopPropagation(); goTo(banner); }}
            >
              {banner.ctaLabel}
            </button>
          )}
        </div>

        {display.badge && (
          <span
            className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-[0.06em] text-white pointer-events-none"
            style={{ backgroundColor: display.badgeColor }}
          >
            {display.badge}
          </span>
        )}

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
function BannerSubtitle({ banner, subtitleColor }: { banner: HomeBannerSnapshot; subtitleColor: string }) {
  const remaining = banner.endsAt ? formatSeasonRemaining(banner.endsAt) : '';
  if (remaining) {
    const prefix = banner.subtitle && !banner.subtitle.includes(':')
      ? banner.subtitle
      : (banner.seasonId ? 'SEASON ENDS IN' : 'ENDS IN');
    return (
      <p className="text-[13px] mb-0.5" style={{ color: subtitleColor }}>
        {prefix}: <strong className="text-[#fbbf24]">{remaining}</strong>
      </p>
    );
  }
  if (banner.subtitle) {
    return <p className="text-[13px] mb-0.5" style={{ color: subtitleColor }}>{banner.subtitle}</p>;
  }
  return null;
}
