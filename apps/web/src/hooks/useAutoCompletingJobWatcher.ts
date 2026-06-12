import { useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { audioEngine } from '../services/AudioEngine';
import { useNotifications } from '../context/NotificationContext';

/**
 * Per-type configuration for a server-side auto-completing job.
 *
 * Auto-completing jobs never show a "Complete" button — the tick processor
 * resolves them and pushes a delta with `status: "completed"`. This hook
 * detects that transition and fires a toast + audio cue for each configured
 * type.
 *
 * Example (BuildingJob):
 * ```ts
 * {
 *   jobType: 'BuildingJob',
 *   toastTitle: '🏗️ Construction Complete!',
 *   toastIcon: '🏗️',
 *   accentColor: '#f97316',
 *   sfxKey: 'sfx.building.complete',
 *   resolveName: (job) => job.name ?? job.defId?.replace(/_/g, ' ') ?? '',
 *   toastBody: (name) => name ? `${name} has finished upgrading.` : 'A building has finished upgrading.',
 * }
 * ```
 */
export interface AutoCompletingJobConfig {
  /** The `type` string on the job record (e.g. `'BuildingJob'`). */
  jobType: string;
  /** Toast heading shown to the player. */
  toastTitle: string;
  /** Icon rendered inside the toast (emoji or short string). */
  toastIcon: string;
  /** Accent / highlight colour for the toast strip (hex). */
  accentColor: string;
  /** Audio engine key to play on completion. */
  sfxKey: string;
  /** How long the toast stays visible (ms). Defaults to 6000. */
  durationMs?: number;
  /**
   * Resolve a human-readable label for the completed job.
   * Receives the raw job record from the sync store.
   * When omitted the toast body falls back to the generic message.
   */
  resolveName?: (job: any) => string;
  /**
   * Build the toast body string from the resolved name.
   * When omitted a default body is used.
   */
  toastBody?: (name: string) => string;
}

/**
 * Watches `sync.jobs` for entries that transition to `status: "completed"` via
 * an SSE delta and fires a configured toast + audio cue for each matched type.
 *
 * Bootstrap guard: statuses are seeded from the first `connected` snapshot so
 * historical completions never produce stale toasts on login.
 *
 * @param configs - Stable array of per-type watcher configs. Wrap in `useMemo`
 *   inside the calling component to avoid unnecessary effect re-runs.
 */
export function useAutoCompletingJobWatcher(configs: AutoCompletingJobConfig[]) {
  const jobs = useAppSelector((s) => s.sync.jobs);
  const syncStatus = useAppSelector((s) => s.sync.status);
  const { addLocalToast } = useNotifications();

  // id → last-known status (across all watched types).
  const knownStatuses = useRef<Map<string, string>>(new Map());
  const bootstrappedRef = useRef(false);

  // Keep a stable ref to configs so the effect can read the latest version
  // without needing configs in its dependency array (configs may be a new array
  // reference each render if the caller didn't memoize).
  const configsRef = useRef(configs);
  configsRef.current = configs;

  useEffect(() => {
    if (syncStatus !== 'connected') return;

    const watchedTypes = new Set(configsRef.current.map((c) => c.jobType));

    // Collect current entries for all watched job types.
    const current = new Map<string, { status: string; job: any; jobType: string }>();
    for (const [id, job] of Object.entries(jobs)) {
      const jobType = (job as any)?.type as string | undefined;
      if (jobType && watchedTypes.has(jobType)) {
        current.set(id, {
          status: (job as any).status ?? '',
          job,
          jobType,
        });
      }
    }

    if (!bootstrappedRef.current) {
      // First connected snapshot — seed without firing any toasts.
      for (const [id, info] of current) {
        knownStatuses.current.set(id, info.status);
      }
      bootstrappedRef.current = true;
      return;
    }

    // Detect fresh transitions to "completed".
    for (const [id, info] of current) {
      const prevStatus = knownStatuses.current.get(id);
      if (info.status === 'completed' && prevStatus !== 'completed') {
        const cfg = configsRef.current.find((c) => c.jobType === info.jobType);
        if (!cfg) continue;

        const name = cfg.resolveName ? (cfg.resolveName(info.job) ?? '') : '';
        const body = cfg.toastBody
          ? cfg.toastBody(name)
          : name
          ? `${name} has completed.`
          : 'A job has completed.';

        audioEngine.play(cfg.sfxKey);
        addLocalToast({
          title: cfg.toastTitle,
          body,
          icon: cfg.toastIcon,
          accentColor: cfg.accentColor,
          durationMs: cfg.durationMs ?? 6000,
        });
      }
    }

    // Update known statuses for all watched jobs.
    for (const [id, info] of current) {
      knownStatuses.current.set(id, info.status);
    }

    // Prune entries for jobs that no longer exist (deleted after completion).
    for (const id of knownStatuses.current.keys()) {
      if (!current.has(id)) {
        knownStatuses.current.delete(id);
      }
    }
  }, [jobs, syncStatus, addLocalToast]);
}
