import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { useModal } from '../../context/ModalContext';

vi.mock('../../services/api', () => ({
  api: {
    sendCommand: vi.fn(),
    getCraftingWorkshops: vi.fn().mockResolvedValue([]),
    setToken: vi.fn(),
  },
}));

vi.mock('../../services/AudioEngine', () => ({
  audioEngine: { play: vi.fn(), setVolume: vi.fn() },
}));

import { api } from '../../services/api';
import InventoryPage from './InventoryPage';

// Probe component that reads the ModalContext queue so the test can assert
// that pushModal(spec) was actually invoked from the onUiIntent handler.
// Mounted as a sibling inside the same ModalProvider tree as InventoryPage.
function ModalProbe() {
  const { currentModal, queueLength } = useModal();
  return (
    <div>
      <span data-testid="modal-queue-length">{queueLength}</span>
      <span data-testid="modal-title">{currentModal?.header?.title ?? ''}</span>
      <span data-testid="modal-kind">{(currentModal as any)?.kind ?? ''}</span>
    </div>
  );
}

const baseSync = {
  status: 'connected',
  cursor: 'c0',
  serverTime: Date.now(),
  player: { id: 'u1', username: 'tester' },
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

describe('InventoryPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders category tabs even when the inventory is empty', () => {
    renderWithProviders(<InventoryPage />, {
      preloadedState: { sync: { ...baseSync } } as any,
    });
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.getByText('Consumables')).toBeInTheDocument();
    expect(screen.getByText('Gear')).toBeInTheDocument();
  });

  it('renders an item from the sync store', () => {
    renderWithProviders(<InventoryPage />, {
      preloadedState: {
        sync: {
          ...baseSync,
          items: {
            item_box: {
              id: 'item_box',
              type: 'LOOTBOX',
              quantity: 1,
              definition: { id: 'def_box', name: 'Mystery Box', type: 'LOOTBOX' },
            },
          },
        },
      } as any,
    });
    expect(screen.getByText('Mystery Box')).toBeInTheDocument();
  });

  it('opens a lootbox via OpenLootBox command and surfaces the modal spec', async () => {
    const modalSpec = {
      version: 1,
      id: 'lootbox-opened-item_box',
      kind: 'lootbox_opened',
      dismiss: { backdrop: true, x: true, escape: true },
      header: { title: 'Mystery Box Opened!' },
      body: [{ type: 'richText', doc: [{ t: 'p', c: [{ t: 'text', v: '1x GEMS' }] }] }],
      buttons: [{ id: 'close', label: 'Collect', variant: 'primary', action: { type: 'CLOSE_MODAL' } }],
    };
    (api.sendCommand as any).mockResolvedValue({
      patches: [{ op: 'delete', entity: 'item', id: 'item_box' }],
      ui: [{ type: 'modal', spec: modalSpec }],
      cursor: { delta: 'c1' },
    });

    renderWithProviders(
      <>
        <InventoryPage />
        <ModalProbe />
      </>,
      {
        preloadedState: {
          sync: {
            ...baseSync,
            items: {
              item_box: {
                id: 'item_box',
                type: 'LOOTBOX',
                quantity: 1,
                definition: { id: 'def_box', name: 'Mystery Box', type: 'LOOTBOX' },
              },
            },
          },
        } as any,
      },
    );

    // No modal queued yet.
    expect(screen.getByTestId('modal-queue-length').textContent).toBe('0');

    // Select first, then Open appears in the detail panel.
    fireEvent.click(screen.getByText('Mystery Box'));
    const openBtn = await screen.findByRole('button', { name: /open/i });
    fireEvent.click(openBtn);

    // Command was issued with the right payload.
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledTimes(1));
    const call = (api.sendCommand as any).mock.calls[0][0];
    expect(call.type).toBe('OpenLootBox');
    expect(call.payload.itemInstanceId).toBe('item_box');

    // The onUiIntent → pushModal wiring should have queued the returned modal spec.
    await waitFor(() =>
      expect(screen.getByTestId('modal-title').textContent).toBe('Mystery Box Opened!'),
    );
    expect(screen.getByTestId('modal-queue-length').textContent).toBe('1');
    expect(screen.getByTestId('modal-kind').textContent).toBe('lootbox_opened');
  });
});
