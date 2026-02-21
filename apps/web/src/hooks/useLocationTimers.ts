import { useMemo } from 'react';
import { useAppSelector } from '../store';
import { useTickRate, createAccumulatorTimer, TickTimer } from '../tick';
import {
  computeGeneratorProduction,
  aggregateByResource,
  ResourceSummary,
} from '../utils/locationProduction';

export interface LocationTimerData {
  resourceTimers: Map<string, TickTimer>;
  resourceSummaries: ResourceSummary[];
}

export function useLocationTimers(): Map<string, LocationTimerData> {
  const locations = useAppSelector((s) => Object.values(s.sync.locations));
  const tickRate = useTickRate();

  return useMemo(() => {
    const map = new Map<string, LocationTimerData>();
    for (const op of locations) {
      const generators = computeGeneratorProduction(op);
      const resourceSummaries = aggregateByResource(op, generators);
      const resourceTimers = new Map<string, TickTimer>();
      const lastAccrued = Number(op.lastAccruedTick || 0);

      for (const res of resourceSummaries) {
        const ratePerTick = res.totalRatePerHour / 3600;
        resourceTimers.set(
          res.key,
          createAccumulatorTimer({
            ratePerTick,
            currentAmount: res.currentAmount,
            lastAccruedTick: lastAccrued,
            capacity: res.capacity,
          }),
        );
      }

      map.set(op.id, { resourceTimers, resourceSummaries });
    }
    return map;
  }, [locations, tickRate]);
}
