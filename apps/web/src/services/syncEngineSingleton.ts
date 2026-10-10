import type { SyncEngine, GlobalPowerChangeHandler, BoostChangeHandler, BootstrapUiIntentHandler } from './SyncEngine';

/**
 * Module-level handle to the active SyncEngine, set by `useSyncEngine`.
 * Lets non-component code (e.g. the connection status banner's Retry
 * button) trigger a manual reconnect without prop-drilling the engine
 * down through the React tree or kicking a full page reload.
 *
 * Handlers registered via `onGlobalPowerChange` / `onBoostChange` before
 * the engine exists are held in pending sets and forwarded automatically
 * as soon as `setSyncEngine` is called with a live engine. This makes
 * toast subscriptions resilient to late engine initialization (the common
 * path where AuthGate mounts during the initializing → authenticated transition).
 */
let current: SyncEngine | null = null;

// Pending handlers registered before any engine was available.
const pendingGlobalPowerHandlers = new Set<GlobalPowerChangeHandler>();
const pendingBoostChangeHandlers = new Set<BoostChangeHandler>();
const pendingBootstrapUiIntentHandlers = new Set<BootstrapUiIntentHandler>();
// Map from pending handler → its active unsubscribe fn (set once engine arrives).
const activeUnsubs = new Map<GlobalPowerChangeHandler | BoostChangeHandler | BootstrapUiIntentHandler, () => void>();

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
  for (const handler of pendingBoostChangeHandlers) {
    const unsub = engine.onBoostChange(handler);
    activeUnsubs.set(handler, unsub);
  }
  for (const handler of pendingBootstrapUiIntentHandlers) {
    const unsub = engine.onBootstrapUiIntents(handler);
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
  onBoostChange(handler: BoostChangeHandler): () => void {
    pendingBoostChangeHandlers.add(handler);

    if (current) {
      const unsub = current.onBoostChange(handler);
      activeUnsubs.set(handler, unsub);
    }

    return () => {
      pendingBoostChangeHandlers.delete(handler);
      const unsub = activeUnsubs.get(handler);
      if (unsub) {
        unsub();
        activeUnsubs.delete(handler);
      }
    };
  },
  onBootstrapUiIntents(handler: BootstrapUiIntentHandler): () => void {
    pendingBootstrapUiIntentHandlers.add(handler);

    if (current) {
      const unsub = current.onBootstrapUiIntents(handler);
      activeUnsubs.set(handler, unsub);
    }

    return () => {
      pendingBootstrapUiIntentHandlers.delete(handler);
      const unsub = activeUnsubs.get(handler);
      if (unsub) {
        unsub();
        activeUnsubs.delete(handler);
      }
    };
  },
};
