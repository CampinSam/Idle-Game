import { createContext, useContext, useMemo } from 'react';
import type { ContentDocumentContext, SurfaceContextOverrideRule } from '@derp/shared';
import { useAppSelector } from '../../store';

export interface SurfaceContextValue {
  context: ContentDocumentContext;
  data: Record<string, any>;
}

const SurfaceCtx = createContext<SurfaceContextValue>({
  context: {},
  data: {},
});

interface SurfaceContextProviderProps {
  baseContext?: ContentDocumentContext;
  overrideRules?: SurfaceContextOverrideRule[];
  data?: Record<string, any>;
  children: React.ReactNode;
}

export function SurfaceContextProvider({
  baseContext = {},
  overrideRules = [],
  data = {},
  children,
}: SurfaceContextProviderProps) {
  const jobs = useAppSelector((s) => s.sync.jobs);

  const merged = useMemo<ContentDocumentContext>(() => {
    let ctx: ContentDocumentContext = { ...baseContext };
    for (const rule of overrideRules) {
      const job = rule.jobId ? jobs[rule.jobId] : null;
      let triggered = false;
      if (rule.on === 'job.completed' && job?.status === 'completed') triggered = true;
      if (rule.on === 'job.failed' && job?.status === 'failed') triggered = true;
      if (rule.on === 'job.ready' && (job?.status === 'ready' || job?.status === 'ready_notified' || job?.status === 'completed')) triggered = true;
      if (triggered) ctx = { ...ctx, ...rule.apply };
    }
    return ctx;
  }, [baseContext, overrideRules, jobs]);

  const value = useMemo<SurfaceContextValue>(
    () => ({ context: merged, data }),
    [merged, data],
  );

  return <SurfaceCtx.Provider value={value}>{children}</SurfaceCtx.Provider>;
}

export function useSurfaceContext(): SurfaceContextValue {
  return useContext(SurfaceCtx);
}
