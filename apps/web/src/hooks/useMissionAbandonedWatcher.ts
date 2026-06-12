import { useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { audioEngine } from '../services/AudioEngine';
import { useNotifications } from '../context/NotificationContext';
import { useModal } from '../context/ModalContext';
import { api } from '../services/api';

/**
 * Watches sync.jobs for MissionJob transitions to `abandoned`.
 *
 * When the tick processor ends a multi-phase mission via the `end_job` path
 * (phase failure with no retry), the job moves directly to `abandoned` without
 * any user interaction.  This hook detects that transition and immediately:
 *   1. Plays the mission-fail SFX
 *   2. Shows a failure toast
 *   3. Auto-fetches and pushes the mission result modal
 *
 * Bootstrap guard: the initial snapshot seeds status without firing anything,
 * so historical abandoned missions never produce stale notifications on login.
 */
export function useMissionAbandonedWatcher() {
  const jobs = useAppSelector((s) => s.sync.jobs);
  const syncStatus = useAppSelector((s) => s.sync.status);
  const { addLocalToast } = useNotifications();
  const { pushModal } = useModal();

  const knownStatuses = useRef<Map<string, string>>(new Map());
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (syncStatus !== 'connected') return;

    const current = new Map<string, { status: string; job: any }>();
    for (const [id, job] of Object.entries(jobs)) {
      if ((job as any)?.type === 'MissionJob') {
        current.set(id, { status: (job as any).status ?? '', job });
      }
    }

    if (!bootstrappedRef.current) {
      for (const [id, info] of current) {
        knownStatuses.current.set(id, info.status);
      }
      bootstrappedRef.current = true;
      return;
    }

    for (const [id, info] of current) {
      const prevStatus = knownStatuses.current.get(id);
      if (
        info.status === 'abandoned' &&
        prevStatus !== 'abandoned' &&
        prevStatus !== undefined
      ) {
        const name =
          (info.job as any).name ||
          String((info.job as any).defId ?? '').replace(/_/g, ' ') ||
          'Mission';
        audioEngine.play('sfx.mission.fail');
        addLocalToast({
          title: '💀 Mission Failed',
          body: `${name} ended in failure.`,
          icon: '💀',
          accentColor: '#ef4444',
          durationMs: 8000,
        });
        api
          .getModalSpec({ jobId: id })
          .then((spec: any) => {
            if (spec?.version === 1) pushModal(spec);
          })
          .catch(() => {});
      }
    }

    for (const [id, info] of current) {
      knownStatuses.current.set(id, info.status);
    }
    for (const id of knownStatuses.current.keys()) {
      if (!current.has(id)) knownStatuses.current.delete(id);
    }
  }, [jobs, syncStatus, addLocalToast, pushModal]);
}
