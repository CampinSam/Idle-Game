import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import type { GameDefinitionRow } from '@derp/shared';

interface ScreenCompositionResult {
  definition: GameDefinitionRow | null;
  loading: boolean;
  refresh: () => void;
}

export function useScreenComposition(screenKey: string): ScreenCompositionResult {
  const [definition, setDefinition] = useState<GameDefinitionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .getScreenComposition(screenKey)
      .then((def) => {
        if (!cancelled) {
          setDefinition(def);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = String((err as any)?.message ?? '').toLowerCase();
          const is404 = msg.includes('404') || msg.includes('not found');
          if (!is404) {
            console.warn('[useScreenComposition] Fetch error for screen', screenKey, err);
          }
          setDefinition(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [screenKey, rev]);

  const refresh = useCallback(() => setRev((n) => n + 1), []);

  return { definition, loading, refresh };
}
