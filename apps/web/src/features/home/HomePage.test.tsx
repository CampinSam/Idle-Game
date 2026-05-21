import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';

vi.mock('../../services/api', () => ({
  api: {
    getCraftingWorkshops: vi.fn().mockResolvedValue([]),
    getCraftingRecipes: vi.fn().mockResolvedValue([]),
    getModalSpec: vi.fn().mockResolvedValue(null),
    getScreenComposition: vi.fn().mockResolvedValue(null),
    setToken: vi.fn(),
  },
}));

import { api } from '../../services/api';

vi.mock('../../services/AudioEngine', () => ({
  audioEngine: { play: vi.fn(), setVolume: vi.fn() },
}));

vi.mock('../../tick', () => ({
  useCurrentTick: () => 100,
  useTickRate: () => 1,
  createCountdownTimer: () => ({ getValue: () => 0 }),
}));

import HomePage from './HomePage';

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
  homeBanners: [],
  globalPowers: [],
  tickBroadcast: null,
  lastError: null,
};

function makeBanner(overrides: any = {}) {
  return {
    id: 'banner_test',
    title: 'Void Convergence',
    subtitle: 'SEASON ENDS IN',
    description: null,
    backgroundImage: '/media/images/season-banner.png',
    ctaLabel: 'SEASON MISSIONS',
    ctaRoute: '/missions',
    priority: 100,
    startsAt: null,
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000 * 3).toISOString(),
    seasonId: 'season_1',
    config: { tagline: 'Beware the void.' },
    ...overrides,
  };
}

describe('HomePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the loading skeleton when bootstrap has not produced a player yet', async () => {
    renderWithProviders(<HomePage />, {
      preloadedState: { sync: { ...baseSyncState, player: null } } as any,
    });
    expect(screen.queryByTestId('home-banner')).toBeNull();
    await waitFor(() => expect(api.getCraftingWorkshops).toHaveBeenCalled());
  });

  it('does not render the banner carousel when there are no active banners', async () => {
    renderWithProviders(<HomePage />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          player: { id: 'u1', username: 'tester', keeperLevel: 1, keeperXp: 0 },
          homeBanners: [],
        },
      } as any,
    });
    expect(screen.queryByTestId('home-banner')).toBeNull();
    await waitFor(() => expect(api.getCraftingWorkshops).toHaveBeenCalled());
  });

  it('renders a single banner without page dots', async () => {
    renderWithProviders(<HomePage />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          player: { id: 'u1', username: 'tester', keeperLevel: 1, keeperXp: 0 },
          homeBanners: [makeBanner()],
        },
      } as any,
    });
    expect(await screen.findByText(/VOID CONVERGENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/SEASON ENDS IN/i)).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('renders page dots when multiple banners are active', async () => {
    renderWithProviders(<HomePage />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          player: { id: 'u1', username: 'tester', keeperLevel: 1, keeperXp: 0 },
          homeBanners: [
            makeBanner({ id: 'b1', title: 'First', priority: 100 }),
            makeBanner({ id: 'b2', title: 'Second', priority: 50, ctaLabel: 'GO' }),
          ],
        },
      } as any,
    });
    expect(await screen.findByText(/FIRST/i)).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('hides expired banners using endsAt', async () => {
    renderWithProviders(<HomePage />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          player: { id: 'u1', username: 'tester', keeperLevel: 1, keeperXp: 0 },
          homeBanners: [
            makeBanner({ endsAt: new Date(Date.now() - 1000).toISOString() }),
          ],
        },
      } as any,
    });
    expect(screen.queryByTestId('home-banner')).toBeNull();
    await waitFor(() => expect(api.getCraftingWorkshops).toHaveBeenCalled());
  });
});
