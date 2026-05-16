interface ActiveJob {
  id: string;
  startTick?: number;
  durationTicks?: number;
  status: string;
}

export function useJobReadinessTimers(_jobs: ActiveJob[]) {
}
