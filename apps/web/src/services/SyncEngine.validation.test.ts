import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTestStore } from '../test/render';

vi.mock('./api', () => ({
  api: {
    bootstrap: vi.fn(),
    fetchDelta: vi.fn(),
    getToken: vi.fn(() => 'test-token'),
  },
}));

import { api } from './api';
import { SyncEngine } from './SyncEngine';

class FakeEventSource {
  static latest: FakeEventSource | null = null;
  listeners = new Map<string, (event: Event) => void>();
  closed = false;
  onerror: ((event: Event) => void) | null = null;

  constructor(_url: string) {
    FakeEventSource.latest = this;
  }

  addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(name, listener as (event: Event) => void);
  }

  close() {
    this.closed = true;
  }

  emit(name: string, data: unknown) {
    this.listeners.get(name)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe('SyncEngine SSE validation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    FakeEventSource.latest = null;
  });

  it('rejects an incompatible event, keeps the cursor, logs the field, and reconnects', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.bootstrap).mockResolvedValue({
      serverTime: 1_700_000_000_000,
      snapshot: { player: null, state: {} },
      cursor: { delta: '12' },
    });
    const store = makeTestStore();
    const engine = new SyncEngine(store as any);

    await engine.start();
    const source = FakeEventSource.latest!;
    source.emit('hello', { userId: 'u1', serverTime: 1_700_000_000_000 });
    source.emit('tick.sync', {
      currentTick: 3,
      tickRate: 1,
      serverTime: 'not-an-ISO-date',
      boosts: [],
    });

    expect(store.getState().sync.cursor).toBe('12');
    expect(store.getState().sync.tickBroadcast).toBeNull();
    expect(store.getState().sync.status).toBe('reconnecting');
    expect(store.getState().sync.lastError).toContain('tick.sync.data.serverTime');
    expect(source.closed).toBe(true);
    expect(api.fetchDelta).not.toHaveBeenCalled();

    engine.stop();
  });
});