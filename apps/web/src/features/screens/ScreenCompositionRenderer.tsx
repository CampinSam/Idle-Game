import React, { Component, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../../context/ModalContext';
import { useSyncPlayer } from '../../hooks/useSyncSelectors';
import type { GameDefinitionRow, ScreenCompositionDefinition, ScreenSectionDefinition } from '@derp/shared';
import { COMPONENT_REGISTRY } from './componentRegistry';
import { ScreenDataContext, useDataSources } from './ScreenDataContext';
import { evaluateVisibilityGroup, buildVisibilityContext } from './visibilityEvaluator';
import { executeAction, type ActionHandlerContext } from './actionHandlers';

class SectionErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: React.ReactNode; sectionId: string },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error(
      `[ScreenCompositionRenderer] Section "${this.props.sectionId}" render failed:`,
      err.message,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

function SectionRenderer({
  section,
  actionCtx,
  visibilityCtx,
}: {
  section: ScreenSectionDefinition;
  actionCtx: ActionHandlerContext;
  visibilityCtx: ReturnType<typeof buildVisibilityContext>;
}) {
  if (!evaluateVisibilityGroup(section.visibility, visibilityCtx)) return null;

  const Comp = COMPONENT_REGISTRY[section.component as string];

  const handleAction = (key: string) => {
    const action = section.actions?.[key];
    if (!action) {
      console.warn('[ScreenCompositionRenderer] No action found for key:', key, 'in section:', section.id);
      return;
    }
    executeAction(action, actionCtx).catch((err) =>
      console.error('[ScreenCompositionRenderer] Action execution failed:', err),
    );
  };

  const fallbackNode = (() => {
    if (!section.fallback?.component) return null;
    const FB = COMPONENT_REGISTRY[section.fallback.component as string];
    if (!FB) return null;
    return <FB section={section} onAction={handleAction} />;
  })();

  if (!Comp) {
    if (import.meta.env.PROD) return null;
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 mb-4 text-center text-xs text-text-secondary">
        [{section.component}]
      </div>
    );
  }

  return (
    <SectionErrorBoundary sectionId={section.id} fallback={fallbackNode}>
      <Comp section={section} onAction={handleAction} />
    </SectionErrorBoundary>
  );
}

export function ScreenCompositionRenderer({
  definition,
}: {
  definition: GameDefinitionRow;
}) {
  const composition = definition.data as ScreenCompositionDefinition;
  const { sections, dataSources } = composition;

  const navigate = useNavigate();
  const { pushModal, dismissModal } = useModal();
  const player = useSyncPlayer();

  const actionCtx = useMemo<ActionHandlerContext>(
    () => ({ navigate, pushModal, dismissModal }),
    [navigate, pushModal, dismissModal],
  );

  const visibilityCtx = useMemo(
    () => buildVisibilityContext(player),
    [player],
  );

  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.priority - b.priority),
    [sections],
  );

  const dataCtxValue = useDataSources(dataSources);

  return (
    <ScreenDataContext.Provider value={dataCtxValue}>
      <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
        {sortedSections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            actionCtx={actionCtx}
            visibilityCtx={visibilityCtx}
          />
        ))}
      </div>
    </ScreenDataContext.Provider>
  );
}
