import { Store } from '@reduxjs/toolkit';
import { api } from './api';
import type { DeltaResponse } from './api';
import { setStatus, setSnapshot, applyPatches, setError, resetSync, setTickBroadcast, setHomeBanners } from '../store/syncSlice';
import type { RootState } from '../store';

const HEARTBEAT_TIMEOUT_MS = 45_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class SyncEngine {
  private store: Store<RootState>;
  private eventSource: EventSource | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private destroyed = false;

  constructor(store: Store<RootState>) {
    this.store = store;
  }

  async start(): Promise<void> {
    if (this.destroyed) return;
    this.store.dispatch(setStatus('bootstrapping'));
    this.store.dispatch(setError(null));

    try {
      const response = await api.bootstrap();
      if (this.destroyed) return;

      this.store.dispatch(setSnapshot(response));
      this.store.dispatch(setStatus('connected'));
      this.openStream();
    } catch (err: any) {
      if (this.destroyed) return;
      console.error('[SyncEngine] Bootstrap failed:', err);
      this.store.dispatch(setError(err.message || 'Bootstrap failed'));
      this.store.dispatch(setStatus('disconnected'));
      this.scheduleReconnect();
    }
  }

  stop(): void {
    this.destroyed = true;
    this.closeStream();
    this.clearReconnect();
    this.store.dispatch(resetSync());
  }

  private openStream(): void {
    if (this.destroyed) return;
    this.closeStream();

    const cursor = this.store.getState().sync.cursor;
    const token = api.getToken();
    if (!token) return;

    const params = new URLSearchParams({ token });
    if (cursor) params.set('cursor', cursor);

    const url = `/api/v1/stream?${params.toString()}`;
    // Note: SSE uses /api/v1 directly since EventSource can't set custom headers
    const es = new EventSource(url);
    this.eventSource = es;

    es.addEventListener('hello', (e) => {
      this.reconnectAttempts = 0;
      this.store.dispatch(setStatus('connected'));
      this.store.dispatch(setError(null));
      this.resetHeartbeat();
    });

    es.addEventListener('ping', () => {
      this.resetHeartbeat();
    });

    es.addEventListener('delta.available', (e) => {
      this.resetHeartbeat();
      this.fetchAndApplyDelta();
    });

    es.addEventListener('tick.rate.updated', (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        this.store.dispatch(setTickBroadcast({
          tickRate: msg.tickRate,
          boosts: msg.boosts ?? [],
          receivedAt: Date.now(),
        }));
      } catch {
        console.warn('[SyncEngine] Failed to parse tick.rate.updated event');
      }
    });

    es.addEventListener('home_banners.updated', (e: MessageEvent) => {
      // Whole-list replacement broadcast emitted by the admin service after
      // any HomeBannerDef create/update/delete. Clients refresh the carousel
      // without waiting for a re-bootstrap.
      try {
        const msg = JSON.parse(e.data);
        if (Array.isArray(msg?.banners)) {
          this.store.dispatch(setHomeBanners(msg.banners));
        }
      } catch {
        console.warn('[SyncEngine] Failed to parse home_banners.updated event');
      }
    });

    es.addEventListener('reset.required', () => {
      console.warn('[SyncEngine] Server requested reset, re-bootstrapping...');
      this.closeStream();
      this.start();
    });

    es.onerror = () => {
      if (this.destroyed) return;
      console.warn('[SyncEngine] SSE connection error');
      this.closeStream();
      this.store.dispatch(setStatus('reconnecting'));
      this.scheduleReconnect();
    };
  }

  private closeStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.clearHeartbeat();
  }

  private resetHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => {
      console.warn('[SyncEngine] Heartbeat timeout, reconnecting...');
      this.closeStream();
      this.store.dispatch(setStatus('reconnecting'));
      this.scheduleReconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    if (this.destroyed) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;

    console.log(`[SyncEngine] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.start();
      }
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async fetchAndApplyDelta(): Promise<void> {
    const cursor = this.store.getState().sync.cursor;
    if (!cursor) return;

    try {
      const res = await api.fetchDelta(cursor);

      if ('resetRequired' in res) {
        console.warn('[SyncEngine] Delta response requires reset, re-bootstrapping...');
        this.closeStream();
        await this.start();
        return;
      }

      const deltaRes = res as DeltaResponse;
      if (deltaRes.patches.length > 0) {
        this.store.dispatch(applyPatches({
          patches: deltaRes.patches,
          cursor: deltaRes.to,
        }));
      } else {
        this.store.dispatch(applyPatches({ patches: [], cursor: deltaRes.to }));
      }
    } catch (err: any) {
      console.error('[SyncEngine] Delta fetch failed:', err);
    }
  }
}
