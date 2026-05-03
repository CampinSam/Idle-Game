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
  // Re-tick once a minute so the countdown subtitle and the auto-expiry
  // filter both refresh without forcing a global tick subscription.
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

  // Clamp the page index when the banner list shrinks (e.g. one expired).
  useEffect(() => {
    if (page >= banners.length && banners.length > 0) setPage(0);
  }, [banners.length, page]);

  // Auto-advance — uses the longest configured interval among the cards
  // currently in rotation (sane default if none set). Disabled for a
  // single banner since there's nowhere to advance to.
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
      // Touch tap: handle navigation here and suppress the synthetic
      // click the browser will fire next so we don't double-navigate.
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 400);
      goTo(banner);
      return;
    }
    if (abs < SWIPE_THRESHOLD_PX) return;
    // Real swipe — suppress the trailing click the browser may fire.
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
    <div className="hp-section">
      <div
        className="hp-banner-card hp-season-banner"
        data-testid="home-banner"
        data-banner-id={banner.id}
        onClick={() => handleCardClick(banner)}
        onTouchStart={isCarousel ? handleTouchStart : undefined}
        onTouchMove={isCarousel ? handleTouchMove : undefined}
        onTouchEnd={isCarousel ? () => handleTouchEnd(banner) : undefined}
      >
        {banner.backgroundImage && (
          <img src={banner.backgroundImage} alt="" className="hp-season-bg" />
        )}
        <div className="hp-season-content">
          <h3>{String(banner.title || '').toUpperCase()}</h3>
          <BannerSubtitle banner={banner} />
          {tagline && <p className="hp-season-desc">{tagline}</p>}
          {banner.ctaLabel && (
            <button
              className="hp-season-btn"
              onClick={(e) => { e.stopPropagation(); goTo(banner); }}
            >
              {banner.ctaLabel}
            </button>
          )}
        </div>

        {isCarousel && (
          <div className="hp-banner-dots" role="tablist" aria-label="Banner pagination">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Banner ${i + 1} of ${banners.length}`}
                className={`hp-banner-dot${i === activeIndex ? ' hp-banner-dot-active' : ''}`}
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
      <p className="hp-season-sub">
        {prefix}: <strong>{remaining}</strong>
      </p>
    );
  }
  if (banner.subtitle) {
    return <p className="hp-season-sub">{banner.subtitle}</p>;
  }
  return null;
}
