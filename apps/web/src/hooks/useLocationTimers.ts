import { useMemo } from 'react';
import { useAppSelector } from '../store';
import { useNow } from './useNow';
import {
  computeGeneratorProduction,
  aggregateByResource,
  ResourceSummary,
} from '../utils/locationProduction';

export interface LocationTimerData {
  resourceSummaries: ResourceSummary[];
}

export function useLocationTimers(): Map<string, LocationTimerData> {
  const locations = useAppSelector((s) => Object.values(s.sync.locations));
  const now = useNow(1000);

  return useMemo(() => {
    const map = new Map<string, LocationTimerData>();

    for (const op of locations) {
      const storage = (op as any).storage || {};
      const effectiveRates: Record<string, number> = storage.effectiveProductionRates || {};
      const storedAmounts: Record<string, number> = storage.stored || {};
      const capacities: Record<string, number> = storage.capacity || {};
      const lastSettledAt: string | null = storage.lastSettledAt ?? null;

      const elapsedSeconds = lastSettledAt
        ? Math.max(0, (now - Date.parse(lastSettledAt)) / 1000)
        : 0;

      const buildings: any[] = (op as any).buildings || [];

      const resourceTypeMap = new Map<string, string>();
      for (const b of buildings) {
        if (b.outputRefId && b.outputRefId !== 'null' && b.outputType) {
          resourceTypeMap.set(b.outputRefId, b.outputType);
        }
      }

      const generators = computeGeneratorProduction(op);

      let resourceSummaries: ResourceSummary[];

      if (Object.keys(effectiveRates).length > 0) {
        resourceSummaries = Object.entries(effectiveRates).map(([resourceId, rate]) => {
          const outputType = resourceTypeMap.get(resourceId) ?? 'CURRENCY';
          const key = `${outputType}:${resourceId}`;
          const stored = storedAmounts[resourceId] ?? 0;
          const capacity = capacities[resourceId] ?? 0;
          const accrued = (rate / 3600) * elapsedSeconds;
          const currentAmount = Math.min(stored + accrued, capacity);
          const buildingGenerators = generators.filter((g) => g.outputRefId === resourceId);

          return {
            key,
            outputType,
            outputRefId: resourceId,
            totalRatePerHour: rate,
            currentAmount,
            capacity,
            generators: buildingGenerators,
          };
        });
      } else {
        const rawSummaries = aggregateByResource(op, generators);
        resourceSummaries = rawSummaries;
      }

      map.set(op.id, { resourceSummaries });
    }

    return map;
  }, [locations, now]);
}
