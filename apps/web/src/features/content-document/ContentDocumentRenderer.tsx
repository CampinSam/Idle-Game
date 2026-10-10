import { useState, useEffect } from 'react';
import type {
  ContentDocumentDefinition,
  ContentDocumentContext,
  SurfaceContextOverrideRule,
} from '@derp/shared';
import { SurfaceContextProvider } from './SurfaceContext';
import { BLOCK_REGISTRY } from './blockRegistry';
import { api } from '../../services/api';

export interface ContentDocumentRendererProps {
  definition?: ContentDocumentDefinition;
  documentId?: string;
  baseContext?: ContentDocumentContext;
  overrideRules?: SurfaceContextOverrideRule[];
  data?: Record<string, any>;
  className?: string;
}

export function ContentDocumentRenderer({
  definition,
  documentId,
  baseContext = {},
  overrideRules = [],
  data = {},
  className,
}: ContentDocumentRendererProps) {
  const [fetchedDef, setFetchedDef] = useState<ContentDocumentDefinition | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentId || definition) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    api
      .getContentDocument(documentId)
      .then((d) => {
        if (!cancelled) {
          setFetchedDef(d);
          setLoading(false);
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          setFetchError(e.message ?? 'Failed to load document');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, definition]);

  const doc = definition ?? fetchedDef;

  if (!doc) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8 text-[13px] text-text-secondary animate-pulse">
          Loading…
        </div>
      );
    }
    if (fetchError) {
      return (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {fetchError}
        </div>
      );
    }
    return null;
  }

  const effectiveContext: ContentDocumentContext = {
    ...(doc.context ?? {}),
    ...baseContext,
  };

  return (
    <SurfaceContextProvider
      baseContext={effectiveContext}
      overrideRules={overrideRules}
      data={data}
    >
      <div className={className}>
        {doc.blocks.map((block, i) => {
          const Comp = BLOCK_REGISTRY[block.type];
          if (!Comp) return null;
          return <Comp key={`${block.type}-${i}`} block={block} />;
        })}
      </div>
    </SurfaceContextProvider>
  );
}
