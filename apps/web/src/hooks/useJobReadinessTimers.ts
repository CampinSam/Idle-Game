import { useEffect, useRef, useCallback } from 'react';
import { useTickEngine } from '../tick/TickEngine';
import { api } from '../services/api';
import { useNotifications } from '../context/NotificationContext';

interface ActiveJob {
  id: string;
  startTick?: number;
  durationTicks?: number;
  status: string;
}

export function useJobReadinessTimers(jobs: ActiveJob[]) {
  const { snapshot } = useTickEngine();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const notifiedRef = useRef<Set<string>>(new Set());
  const { refresh } = useNotifications();

  const onJobReady = useCallback((jobId: string) => {
    notifiedRef.current.add(jobId);
    api.markJobsNotified([jobId]).then(() => {
      refresh();
    }).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (!snapshot || snapshot.tickRate <= 0) return;

    const currentTimers = timersRef.current;
    const serverTimeMs = new Date(snapshot.serverTime).getTime();
    const nowMs = Date.now();
    const wallElapsedSec = (nowMs - serverTimeMs) / 1000;
    const nowTick = snapshot.currentTick + wallElapsedSec * snapshot.tickRate;

    const activeJobIds = new Set(jobs.map((j) => j.id));
    for (const [id, timer] of currentTimers.entries()) {
      if (!activeJobIds.has(id)) {
        clearTimeout(timer);
        currentTimers.delete(id);
      }
    }

    for (const job of jobs) {
      if (job.status !== 'active') continue;
      if (job.startTick == null || job.durationTicks == null) continue;
      if (currentTimers.has(job.id)) continue;
      if (notifiedRef.current.has(job.id)) continue;

      const targetTick = job.startTick + job.durationTicks;
      const remainingTicks = targetTick - nowTick;

      if (remainingTicks <= 0) {
        onJobReady(job.id);
        continue;
      }

      const remainingMs = (remainingTicks / snapshot.tickRate) * 1000;
      const delay = Math.max(remainingMs + 500, 1000);

      const timeoutId = setTimeout(() => {
        currentTimers.delete(job.id);
        onJobReady(job.id);
      }, delay);

      currentTimers.set(job.id, timeoutId);
    }
  }, [jobs, snapshot, onJobReady]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);
}
