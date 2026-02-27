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
      const storage = (op as any).storage || {};
      const effectiveRates: Record<string, number> = storage.effectiveProductionRates || {};
      const storedAmounts: Record<string, number> = storage.stored || {};

      const generators = computeGeneratorProduction(op);
      const rawSummaries = aggregateByResource(op, generators);
      const lastAccrued = Number((op as any).lastAccruedTick || 0);

      const resourceTimers = new Map<string, TickTimer>();
      const resourceSummaries: ResourceSummary[] = rawSummaries.map((res) => {
        const serverRate = effectiveRates[res.outputRefId];
        const serverStored = storedAmounts[res.outputRefId];

        const totalRatePerHour = serverRate !== undefined ? serverRate : res.totalRatePerHour;
        const currentAmount = serverStored !== undefined ? serverStored : res.currentAmount;

        return { ...res, totalRatePerHour, currentAmount };
      });

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
