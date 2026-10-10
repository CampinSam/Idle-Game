import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { DataSourceDefinition } from '@derp/shared';

export interface ScreenDataContextValue {
  getData: (id: string) => unknown;
  isLoading: (id: string) => boolean;
  refetchSource: (id: string) => void;
}

export const ScreenDataContext = createContext<ScreenDataContextValue>({
  getData: () => undefined,
  isLoading: () => false,
  refetchSource: () => {},
});

export function useScreenData(id: string): unknown {
  return useContext(ScreenDataContext).getData(id);
}

export function useScreenDataLoading(id: string): boolean {
  return useContext(ScreenDataContext).isLoading(id);
}

const CACHE = new Map<string, { data: unknown; expiresAt: number }>();

function cacheKey(source: DataSourceDefinition): string {
  return `${source.id}:${source.endpoint ?? ''}`;
}

export function useDataSources(
  dataSources: DataSourceDefinition[] | undefined,
): ScreenDataContextValue {
  const [dataMap, setDataMap] = useState<Record<string, unknown>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [refetchKeys, setRefetchKeys] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!dataSources?.length) return;

    dataSources
      .filter((s) => s.sourceType !== 'api')
      .forEach((s) => {
        console.warn(
          `[ScreenDataContext] sourceType "${s.sourceType}" for "${s.id}" is not supported client-side — skipping`,
        );
      });

    const apiSources = dataSources.filter((s) => s.sourceType === 'api');

    apiSources.forEach((source) => {
      const key = cacheKey(source);
      const cached = CACHE.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        setDataMap((prev) => ({ ...prev, [source.id]: cached.data }));
        return;
      }

      if (!source.endpoint) {
        console.warn(`[ScreenDataContext] api source "${source.id}" has no endpoint — skipping`);
        return;
      }

      setLoadingMap((prev) => ({ ...prev, [source.id]: true }));

      api
        .get<unknown>(source.endpoint)
        .then((data) => {
          const ttl = (source.cacheTtlSeconds ?? 30) * 1000;
          CACHE.set(key, { data, expiresAt: Date.now() + ttl });
          setDataMap((prev) => ({ ...prev, [source.id]: data }));
          setLoadingMap((prev) => ({ ...prev, [source.id]: false }));
        })
        .catch((err: unknown) => {
          console.warn(`[ScreenDataContext] Failed to fetch source "${source.id}":`, err);
          setLoadingMap((prev) => ({ ...prev, [source.id]: false }));
          if (source.fallbackValue !== undefined) {
            setDataMap((prev) => ({ ...prev, [source.id]: source.fallbackValue }));
          }
        });
    });
  }, [dataSources, refetchKeys]);

  const refetchSource = (id: string) => {
    const source = dataSources?.find((s) => s.id === id);
    if (source) CACHE.delete(cacheKey(source));
    setRefetchKeys((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };

  return {
    getData: (id) => dataMap[id],
    isLoading: (id) => loadingMap[id] ?? false,
    refetchSource,
  };
}
