import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { BannerCarousel } from './BannerCarousel';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual: any = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const baseSyncState = {
  status: 'connected',
  cursor: 'c0',
  serverTime: Date.now(),
  player: null,
  entities: {},
  locations: {},
  buildings: {},
  rooms: {},
  items: {},
  jobs: {},
  notifications: {},
  currencies: {},
  missions: {},
  quests: {},
  checkins: {},
  gifts: {},
  activeEffects: {},
  currencyBalances: {},
  activeSeason: null,
  homeBanners: [] as any[],
  tickBroadcast: null,
  lastError: null,
};

function makeBanner(overrides: any = {}) {
  return {
    id: 'b',
    title: 'Banner',
    subtitle: null,
    description: null,
    backgroundImage: null,
    ctaLabel: 'GO',
    ctaRoute: '/missions',
    priority: 0,
    startsAt: null,
    endsAt: null,
    seasonId: null,
    config: {},
    ...overrides,
  };
}

function fireTouch(el: Element, type: 'touchstart' | 'touchmove' | 'touchend', x: number) {
  fireEvent[
    type === 'touchstart' ? 'touchStart' : type === 'touchmove' ? 'touchMove' : 'touchEnd'
  ](el, { touches: type === 'touchend' ? [] : [{ clientX: x }] });
}

describe('BannerCarousel interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockNavigate.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats a small touch delta as a tap and navigates to the CTA route', () => {
    renderWithProviders(<BannerCarousel />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          homeBanners: [
            makeBanner({ id: 'b1', title: 'A', ctaRoute: '/a' }),
            makeBanner({ id: 'b2', title: 'B', ctaRoute: '/b' }),
          ],
        },
      } as any,
    });

    const card = screen.getByTestId('home-banner');
    fireTouch(card, 'touchstart', 100);
    fireTouch(card, 'touchmove', 102); // < 8px
    fireTouch(card, 'touchend', 102);

    expect(mockNavigate).toHaveBeenCalledWith('/a');
  });

  it('left swipe advances to the next banner without navigating', () => {
    renderWithProviders(<BannerCarousel />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          homeBanners: [
            makeBanner({ id: 'b1', title: 'First', ctaRoute: '/first' }),
            makeBanner({ id: 'b2', title: 'Second', ctaRoute: '/second' }),
          ],
        },
      } as any,
    });

    const card = screen.getByTestId('home-banner');
    expect(card.getAttribute('data-banner-id')).toBe('b1');

    fireTouch(card, 'touchstart', 200);
    fireTouch(card, 'touchmove', 100); // -100px → swipe
    fireTouch(card, 'touchend', 100);

    expect(mockNavigate).not.toHaveBeenCalled();
    const after = screen.getByTestId('home-banner');
    expect(after.getAttribute('data-banner-id')).toBe('b2');
  });

  it('right swipe retreats to the previous banner', () => {
    renderWithProviders(<BannerCarousel />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          homeBanners: [
            makeBanner({ id: 'b1', title: 'First' }),
            makeBanner({ id: 'b2', title: 'Second' }),
          ],
        },
      } as any,
    });

    // Advance to b2 first.
    const card = screen.getByTestId('home-banner');
    fireTouch(card, 'touchstart', 200);
    fireTouch(card, 'touchmove', 100);
    fireTouch(card, 'touchend', 100);
    expect(screen.getByTestId('home-banner').getAttribute('data-banner-id')).toBe('b2');

    // Now swipe right to go back.
    const card2 = screen.getByTestId('home-banner');
    fireTouch(card2, 'touchstart', 100);
    fireTouch(card2, 'touchmove', 200);
    fireTouch(card2, 'touchend', 200);
    expect(screen.getByTestId('home-banner').getAttribute('data-banner-id')).toBe('b1');
  });

  it('clicking the CTA button navigates to the route', () => {
    renderWithProviders(<BannerCarousel />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          homeBanners: [makeBanner({ id: 'b1', ctaLabel: 'GO', ctaRoute: '/x' })],
        },
      } as any,
    });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    expect(mockNavigate).toHaveBeenCalledWith('/x');
  });

  it('auto-advances every autoAdvanceMs and pauses for a window after user interaction', () => {
    renderWithProviders(<BannerCarousel />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          homeBanners: [
            makeBanner({ id: 'b1', config: { autoAdvanceMs: 1000 } }),
            makeBanner({ id: 'b2', config: { autoAdvanceMs: 1000 } }),
          ],
        },
      } as any,
    });

    expect(screen.getByTestId('home-banner').getAttribute('data-banner-id')).toBe('b1');

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('home-banner').getAttribute('data-banner-id')).toBe('b2');

    // User interacts (swipe back to b1) — should pause auto-advance.
    const card = screen.getByTestId('home-banner');
    fireTouch(card, 'touchstart', 100);
    fireTouch(card, 'touchmove', 200);
    fireTouch(card, 'touchend', 200);
    expect(screen.getByTestId('home-banner').getAttribute('data-banner-id')).toBe('b1');

    // Tick past the configured advance interval but inside the pause window — no advance.
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('home-banner').getAttribute('data-banner-id')).toBe('b1');

    // Cross the 10s pause boundary — the pause-clearing setTimeout fires and
    // the effect re-registers the interval on the next render.
    act(() => { vi.advanceTimersByTime(10_000); });
    // Then the freshly-registered interval fires after one more autoAdvanceMs.
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByTestId('home-banner').getAttribute('data-banner-id')).toBe('b2');
  });

  it('clicking a page dot jumps to that index and does not navigate', () => {
    renderWithProviders(<BannerCarousel />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          homeBanners: [
            makeBanner({ id: 'b1' }),
            makeBanner({ id: 'b2' }),
            makeBanner({ id: 'b3' }),
          ],
        },
      } as any,
    });
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[2]);
    expect(screen.getByTestId('home-banner').getAttribute('data-banner-id')).toBe('b3');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
