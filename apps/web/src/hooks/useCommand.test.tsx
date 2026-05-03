import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ReactNode } from 'react';
import { makeTestStore } from '../test/render';
import { useCommand } from './useCommand';

vi.mock('../services/api', () => ({
  api: {
    sendCommand: vi.fn(),
  },
}));

import { api } from '../services/api';

function wrapperFor(store: ReturnType<typeof makeTestStore>) {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
}

describe('useCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches returned patches into the sync store', async () => {
    const store = makeTestStore({
      sync: { status: 'connected', cursor: 'c0', items: {}, currencyBalances: {} },
    } as any);

    (api.sendCommand as any).mockResolvedValue({
      patches: [
        { op: 'upsert', entity: 'item', id: 'item_1', data: { id: 'item_1', name: 'Sword' } },
      ],
      ui: [],
      cursor: { delta: 'c1' },
    });

    const { result } = renderHook(() => useCommand(), { wrapper: wrapperFor(store) });

    await act(async () => {
      const res = await result.current.execute('TestCommand', { foo: 1 });
      expect(res.cursor.delta).toBe('c1');
    });

    expect(api.sendCommand).toHaveBeenCalledTimes(1);
    const call = (api.sendCommand as any).mock.calls[0][0];
    expect(call.type).toBe('TestCommand');
    expect(call.payload).toEqual({ foo: 1 });
    // Idempotency key shape: `${commandType}-${epochMillis}-${counter}`.
    expect(call.idempotencyKey).toMatch(/^TestCommand-\d{10,}-\d+$/);

    const state = store.getState();
    expect(state.sync.cursor).toBe('c1');
    expect(state.sync.items.item_1).toEqual({ id: 'item_1', name: 'Sword' });
  });

  it('generates a unique idempotency key per execute and honors an explicit key', async () => {
    const store = makeTestStore({ sync: {} } as any);
    (api.sendCommand as any).mockResolvedValue({ patches: [], ui: [], cursor: { delta: 'c0' } });

    const { result } = renderHook(() => useCommand(), { wrapper: wrapperFor(store) });

    await act(async () => { await result.current.execute('CmdA'); });
    await act(async () => { await result.current.execute('CmdA'); });
    await act(async () => { await result.current.execute('CmdA', {}, 'explicit-key-123'); });

    const calls = (api.sendCommand as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toHaveLength(3);
    expect(calls[0].idempotencyKey).not.toBe(calls[1].idempotencyKey);
    expect(calls[2].idempotencyKey).toBe('explicit-key-123');
  });

  it('forwards UI intents to the onUiIntent callback', async () => {
    const store = makeTestStore({ sync: { status: 'connected' } } as any);
    const intents: any[] = [];

    const modalIntent = {
      type: 'modal' as const,
      spec: { version: 1, id: 'm1', dismiss: { backdrop: true, x: true, escape: true }, header: { title: 'Hi' }, body: [], buttons: [] },
    };
    (api.sendCommand as any).mockResolvedValue({
      patches: [],
      ui: [modalIntent, { type: 'toast', tone: 'success', message: 'ok' }],
      cursor: { delta: 'c2' },
    });

    const { result } = renderHook(
      () => useCommand({ onUiIntent: (i) => intents.push(i) }),
      { wrapper: wrapperFor(store) },
    );

    await act(async () => {
      await result.current.execute('Foo');
    });

    expect(intents).toHaveLength(2);
    expect(intents[0].type).toBe('modal');
    expect(intents[1].type).toBe('toast');
  });

  it('rejects concurrent executes with an in-progress error', async () => {
    const store = makeTestStore({ sync: {} } as any);
    let release: (v: any) => void;
    (api.sendCommand as any).mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );

    const { result } = renderHook(() => useCommand(), { wrapper: wrapperFor(store) });

    let firstPromise: Promise<any>;
    act(() => {
      firstPromise = result.current.execute('SlowCommand');
    });

    await expect(result.current.execute('OtherCommand')).rejects.toThrow(/already in progress/i);

    await act(async () => {
      release!({ patches: [], ui: [], cursor: { delta: 'c0' } });
      await firstPromise;
    });
  });
});
