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
      const storedAmounts: Record<string, number> = storage.stored || {};
      const capacities: Record<string, number> = storage.capacity || {};
      const lastSettledAt: string | null = storage.lastSettledAt ?? null;

      const elapsedSeconds = lastSettledAt
        ? Math.max(0, (now - Date.parse(lastSettledAt)) / 1000)
        : 0;

      const consumptionRates: Record<string, number> = storage.consumptionRates || {};
      const generators = computeGeneratorProduction(op);
      const rawSummaries = aggregateByResource(op, generators, consumptionRates);

      const resourceSummaries: ResourceSummary[] = rawSummaries.map((summary) => {
        const stored = storedAmounts[summary.outputRefId] ?? 0;
        const capacity = capacities[summary.outputRefId] ?? summary.capacity;
        const accrued = (summary.netRatePerHour / 3600) * elapsedSeconds;
        const raw = stored + accrued;
        const currentAmount = capacity > 0
          ? Math.min(Math.max(raw, 0), capacity)
          : Math.max(raw, 0);

        return {
          ...summary,
          currentAmount,
          capacity,
        };
      });

      map.set(op.id, { resourceSummaries });
    }

    return map;
  }, [locations, now]);
}
