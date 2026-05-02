import type { SyncEngine } from './SyncEngine';

/**
 * Module-level handle to the active SyncEngine, set by `useSyncEngine`.
 * Lets non-component code (e.g. the connection status banner's Retry
 * button) trigger a manual reconnect without prop-drilling the engine
 * down through the React tree or kicking a full page reload.
 */
let current: SyncEngine | null = null;

export function setSyncEngine(engine: SyncEngine | null): void {
  current = engine;
}

export const syncEngine = {
  start(): void {
    current?.start();
  },
};
