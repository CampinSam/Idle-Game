import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';

vi.mock('../../services/api', () => ({
  api: {
    getCraftingWorkshops: vi.fn().mockResolvedValue([]),
    getCraftingRecipes: vi.fn().mockResolvedValue([]),
    getModalSpec: vi.fn().mockResolvedValue(null),
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
  tickBroadcast: null,
  lastError: null,
};

describe('HomePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the loading skeleton when bootstrap has not produced a player yet', async () => {
    renderWithProviders(<HomePage />, {
      preloadedState: { sync: { ...baseSyncState, player: null } } as any,
    });
    // Skeleton renders without throwing — there should be no season banner text.
    expect(screen.queryByText(/SEASON ENDS IN/i)).toBeNull();
    // Wait for the queued getCraftingWorkshops effect to settle so its setState
    // doesn't fire after the test completes (which would log an act() warning
    // and could mask real timing bugs).
    await waitFor(() => expect(api.getCraftingWorkshops).toHaveBeenCalled());
  });

  it('does not render the season banner when no season is active', async () => {
    renderWithProviders(<HomePage />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          player: { id: 'u1', username: 'tester', keeperLevel: 1, keeperXp: 0 },
          activeSeason: null,
        },
      } as any,
    });
    expect(screen.queryByText(/SEASON ENDS IN/i)).toBeNull();
    await waitFor(() => expect(api.getCraftingWorkshops).toHaveBeenCalled());
  });

  it('renders the season banner with the active season name', async () => {
    renderWithProviders(<HomePage />, {
      preloadedState: {
        sync: {
          ...baseSyncState,
          player: { id: 'u1', username: 'tester', keeperLevel: 1, keeperXp: 0 },
          activeSeason: {
            id: 'season_1',
            name: 'Void Convergence',
            endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000 * 3).toISOString(),
            config: { tagline: 'Beware the void.' },
          },
        },
      } as any,
    });
    expect(await screen.findByText(/VOID CONVERGENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/SEASON ENDS IN/i)).toBeInTheDocument();
  });
});
