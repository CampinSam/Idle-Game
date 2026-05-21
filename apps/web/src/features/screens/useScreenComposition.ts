import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import type { GameDefinitionRow } from '@derp/shared';

interface ScreenCompositionResult {
  definition: GameDefinitionRow | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useScreenComposition(screenKey: string): ScreenCompositionResult {
  const [definition, setDefinition] = useState<GameDefinitionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getScreenComposition(screenKey)
      .then((def) => {
        if (cancelled) return;
        if (!def || typeof def !== 'object') {
          setDefinition(null);
        } else {
          setDefinition(def);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = String((err as any)?.message ?? '').toLowerCase();
        const is404 = msg.includes('404') || msg.includes('not found');
        if (!is404) {
          const wrappedErr = err instanceof Error ? err : new Error(String(err));
          console.warn('[useScreenComposition] Fetch error for screen', screenKey, wrappedErr);
          setError(wrappedErr);
        }
        setDefinition(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [screenKey, rev]);

  const refresh = useCallback(() => setRev((n) => n + 1), []);

  return { definition, loading, error, refresh };
}
