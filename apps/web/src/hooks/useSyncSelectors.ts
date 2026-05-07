import { useMemo } from 'react';
import { useAppSelector } from '../store';

export function useSyncPlayer() {
  return useAppSelector((s) => s.sync.player);
}

export function useSyncEntities() {
  const table = useAppSelector((s) => s.sync.entities);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncLocations() {
  const table = useAppSelector((s) => s.sync.locations);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncBuildings() {
  const table = useAppSelector((s) => s.sync.buildings);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncRooms() {
  const table = useAppSelector((s) => s.sync.rooms);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncItems() {
  const table = useAppSelector((s) => s.sync.items);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncJobs() {
  const table = useAppSelector((s) => s.sync.jobs);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncNotifications() {
  const table = useAppSelector((s) => s.sync.notifications);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncMissions() {
  const table = useAppSelector((s) => s.sync.missions);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncCurrencyBalances() {
  return useAppSelector((s) => s.sync.currencyBalances);
}

export function useSyncStatus() {
  return useAppSelector((s) => s.sync.status);
}

export function useSyncActiveMissions() {
  const jobs = useSyncJobs();
  return useMemo(
    () => jobs.filter((j: any) => j.type === 'MissionJob' && (j.status === 'active' || j.status === 'ready_notified')),
    [jobs],
  );
}

export function useAllActiveJobs() {
  const jobs = useSyncJobs();
  const locations = useSyncLocations();
  return useMemo(() => {
    const activeStatuses = new Set(['active', 'ready_notified']);
    const missionAndCraftingJobs = jobs
      .filter((j: any) => activeStatuses.has(j.status) && (j.type === 'MissionJob' || j.type === 'CraftingJob'))
      .map((j: any) => ({
        ...j,
        name: (j.defId || '').replace(/_/g, ' '),
      }));
    const buildingJobs = (locations as any[]).flatMap((op: any) =>
      (op.buildings || [])
        .filter((b: any) => b.status === 'building' && b.jobId && b.startTick != null)
        .map((b: any) => ({
          id: b.jobId,
          type: 'BuildingJob',
          status: 'active',
          startTick: b.startTick,
          durationTicks: b.durationTicks,
          name: (b.buildingDefId || '').replace(/_/g, ' '),
        }))
    );
    return [...missionAndCraftingJobs, ...buildingJobs];
  }, [jobs, locations]);
}

export function useSyncMissionHistory() {
  const jobs = useSyncJobs();
  return useMemo(
    () => jobs
      .filter((j: any) => j.type === 'MissionJob' && (j.status === 'completed' || j.status === 'failed'))
      .sort((a: any, b: any) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 20),
    [jobs],
  );
}

export function useSyncActiveCraftingJobs() {
  const jobs = useSyncJobs();
  return useMemo(
    () => jobs.filter((j: any) => j.type === 'CraftingJob' && (j.status === 'active' || j.status === 'ready_notified')),
    [jobs],
  );
}

export function useSyncQuests() {
  const table = useAppSelector((s) => s.sync.quests);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncAchievements() {
  const table = useAppSelector((s) => s.sync.achievements);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncCheckIns() {
  const table = useAppSelector((s) => s.sync.checkins);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncGifts() {
  const table = useAppSelector((s) => s.sync.gifts);
  return useMemo(() => Object.values(table), [table]);
}

export function useTagDefs() {
  return useAppSelector((s) => s.sync.tagDefs);
}

export function useTagDef(key: string | undefined | null) {
  return useAppSelector((s) => (key ? s.sync.tagDefs[key] : undefined));
}

export function useVisualEffectDefs() {
  return useAppSelector((s) => s.sync.visualEffectDefs);
}

export function useVisualEffectDef(key: string | undefined | null) {
  return useAppSelector((s) => (key ? s.sync.visualEffectDefs[key] : undefined));
}

export function useSystemIconDefs() {
  return useAppSelector((s) => s.sync.systemIconDefs);
}

export function useSyncActiveEffects() {
  const table = useAppSelector((s) => s.sync.activeEffects);
  return useMemo(() => Object.values(table), [table]);
}

/**
 * Returns the active homescreen banners, freshly filtered against the
 * current wall-clock time so banners whose `endsAt` has slipped into the
 * past disappear without waiting for a re-bootstrap. Re-evaluates whenever
 * the server-supplied list or the `nowMs` argument changes; pass a value
 * derived from a tick / interval if you want the filter to refresh live.
 */
export function useHomeBanners(nowMs?: number) {
  const banners = useAppSelector((s) => s.sync.homeBanners);
  return useMemo(() => {
    const now = nowMs ?? Date.now();
    return banners.filter((b: any) => {
      if (b.startsAt && new Date(b.startsAt).getTime() > now) return false;
      if (b.endsAt && new Date(b.endsAt).getTime() <= now) return false;
      return true;
    });
  }, [banners, nowMs]);
}
