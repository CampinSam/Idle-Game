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

export function useSyncCheckIns() {
  const table = useAppSelector((s) => s.sync.checkins);
  return useMemo(() => Object.values(table), [table]);
}

export function useSyncActiveEffects() {
  const table = useAppSelector((s) => s.sync.activeEffects);
  return useMemo(() => Object.values(table), [table]);
}
