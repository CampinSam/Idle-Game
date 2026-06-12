import { useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { audioEngine } from '../services/AudioEngine';
import { useNotifications } from '../context/NotificationContext';

/**
 * Watches `sync.jobs` for BuildingJob entries that transition to
 * `status: "completed"` via an SSE delta (server-side auto-completion
 * on the tick processor).
 *
 * When the tick fires and `completeBuilding` runs, the server pushes:
 *   { op: 'upsert', entity: 'job', id, data: { type: 'BuildingJob', status: 'completed', ... } }
 *
 * This hook detects that transition and:
 *   1. Plays `sfx.building.complete` via the audio engine.
 *   2. Shows a local toast ("Construction Complete!") via `addLocalToast`.
 *
 * Bootstrap guard: we seed known statuses from the first `connected` snapshot
 * so historical completed jobs don't fire stale toasts on login.
 */
export function useBuildingCompletionWatcher() {
  const jobs = useAppSelector((s) => s.sync.jobs);
  const buildings = useAppSelector((s) => s.sync.buildings);
  const syncStatus = useAppSelector((s) => s.sync.status);
  const { addLocalToast } = useNotifications();

  // id → last-known status for BuildingJobs.
  // Seeded on first 'connected' so bootstrap completions don't fire.
  const knownStatuses = useRef<Map<string, string>>(new Map());
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (syncStatus !== 'connected') return;

    // Build the current set of BuildingJob statuses.
    const current = new Map<string, { status: string; buildingId?: string; defId?: string }>();
    for (const [id, job] of Object.entries(jobs)) {
      if ((job as any)?.type === 'BuildingJob') {
        current.set(id, {
          status: (job as any).status ?? '',
          buildingId: (job as any).data?.buildingId,
          defId: (job as any).defId,
        });
      }
    }

    if (!bootstrappedRef.current) {
      // First connected snapshot — seed without firing.
      for (const [id, info] of current) {
        knownStatuses.current.set(id, info.status);
      }
      bootstrappedRef.current = true;
      return;
    }

    // Detect transitions to "completed".
    for (const [id, info] of current) {
      const prevStatus = knownStatuses.current.get(id);
      if (info.status === 'completed' && prevStatus !== 'completed') {
        // Resolve a human-readable building name.
        let buildingName = '';
        if (info.buildingId && buildings[info.buildingId]) {
          buildingName = (buildings[info.buildingId] as any).name ?? '';
        }
        if (!buildingName && info.defId) {
          buildingName = info.defId.replace(/_/g, ' ');
        }

        audioEngine.play('sfx.building.complete');
        addLocalToast({
          title: '🏗️ Construction Complete!',
          body: buildingName
            ? `${buildingName} has finished upgrading.`
            : 'A building has finished upgrading.',
          icon: '🏗️',
          accentColor: '#f97316',
          durationMs: 6000,
        });
      }
    }

    // Update known statuses (both new jobs and status changes).
    for (const [id, info] of current) {
      knownStatuses.current.set(id, info.status);
    }

    // Prune jobs that no longer exist in the store (deleted after completion).
    for (const id of knownStatuses.current.keys()) {
      if (!current.has(id)) {
        knownStatuses.current.delete(id);
      }
    }
  }, [jobs, buildings, syncStatus, addLocalToast]);
}
