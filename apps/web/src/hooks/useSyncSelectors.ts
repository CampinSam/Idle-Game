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

export function useSyncActiveCraftingJobs() {
  const jobs = useSyncJobs();
  return useMemo(
    () => jobs.filter((j: any) => j.type === 'CraftingJob' && (j.status === 'active' || j.status === 'ready_notified')),
    [jobs],
  );
}
