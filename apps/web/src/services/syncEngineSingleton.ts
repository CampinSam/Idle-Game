import type { SyncEngine, GlobalPowerChangeHandler } from './SyncEngine';

/**
 * Module-level handle to the active SyncEngine, set by `useSyncEngine`.
 * Lets non-component code (e.g. the connection status banner's Retry
 * button) trigger a manual reconnect without prop-drilling the engine
 * down through the React tree or kicking a full page reload.
 *
 * Handlers registered via `onGlobalPowerChange` before the engine exists
 * are held in `pendingGlobalPowerHandlers` and forwarded automatically
 * as soon as `setSyncEngine` is called with a live engine. This makes
 * toast subscriptions resilient to late engine initialization (the common
 * path where AuthGate mounts during the initializing → authenticated transition).
 */
let current: SyncEngine | null = null;

// Pending handlers registered before any engine was available.
const pendingGlobalPowerHandlers = new Set<GlobalPowerChangeHandler>();
// Map from pending handler → its active unsubscribe fn (set once engine arrives).
const activeUnsubs = new Map<GlobalPowerChangeHandler, () => void>();

export function setSyncEngine(engine: SyncEngine | null): void {
  if (!engine) {
    // Tear down active subscriptions but keep handlers in pending set so they
    // resubscribe when the next engine is created.
    for (const [handler, unsub] of activeUnsubs) {
      unsub();
      activeUnsubs.delete(handler);
    }
    current = null;
    return;
  }

  current = engine;

  // Forward all pending handlers to the new engine.
  for (const handler of pendingGlobalPowerHandlers) {
    const unsub = engine.onGlobalPowerChange(handler);
    activeUnsubs.set(handler, unsub);
  }
}

export const syncEngine = {
  start(): void {
    current?.start();
  },
  onGlobalPowerChange(handler: GlobalPowerChangeHandler): () => void {
    pendingGlobalPowerHandlers.add(handler);

    if (current) {
      const unsub = current.onGlobalPowerChange(handler);
      activeUnsubs.set(handler, unsub);
    }

    return () => {
      pendingGlobalPowerHandlers.delete(handler);
      const unsub = activeUnsubs.get(handler);
      if (unsub) {
        unsub();
        activeUnsubs.delete(handler);
      }
    };
  },
};
