import React, { Component, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../../context/ModalContext';
import { useSyncPlayer } from '../../hooks/useSyncSelectors';
import type {
  GameDefinitionRow,
  ScreenCompositionDefinition,
  ScreenSectionDefinition,
  ScreenLayoutConfig,
} from '@derp/shared';
import { COMPONENT_REGISTRY } from './componentRegistry';
import { ScreenDataContext, useDataSources } from './ScreenDataContext';
import {
  evaluateVisibilityGroup,
  buildVisibilityContext,
  type ClientVisibilityContext,
} from './visibilityEvaluator';
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
      `[ScreenCompositionRenderer] Section "${this.props.sectionId}" failed:`,
      err.message,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
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
  visibilityCtx: ClientVisibilityContext;
}) {
  if (!evaluateVisibilityGroup(section.visibility, visibilityCtx)) return null;

  const Comp = COMPONENT_REGISTRY[section.component as string];

  const handleAction = (key: string) => {
    const action = section.actions?.[key];
    if (!action) {
      console.warn('[ScreenCompositionRenderer] No action for key:', key, 'in section:', section.id);
      return;
    }
    executeAction(action, actionCtx).catch((err) =>
      console.error('[ScreenCompositionRenderer] Action failed:', err),
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

function VerticalFeedLayout({
  sections,
  actionCtx,
  visibilityCtx,
}: {
  sections: ScreenSectionDefinition[];
  actionCtx: ActionHandlerContext;
  visibilityCtx: ClientVisibilityContext;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      ))}
    </div>
  );
}

function TabbedFeedLayout({
  layout,
  sections,
  actionCtx,
  visibilityCtx,
}: {
  layout: ScreenLayoutConfig;
  sections: ScreenSectionDefinition[];
  actionCtx: ActionHandlerContext;
  visibilityCtx: ClientVisibilityContext;
}) {
  const tabs = layout.tabs ?? [];
  const visibleTabs = tabs.filter((t) =>
    evaluateVisibilityGroup(t.visibility, visibilityCtx),
  );
  const defaultTabId =
    visibleTabs.find((t) => t.default)?.id ?? visibleTabs[0]?.id ?? '';
  const [activeTabId, setActiveTabId] = useState(defaultTabId);

  const sectionsBySlot = useMemo(() => {
    const map: Record<string, ScreenSectionDefinition[]> = {};
    sections.forEach((s) => {
      const slot = s.slot ?? visibleTabs[0]?.id ?? 'default';
      if (!map[slot]) map[slot] = [];
      map[slot].push(s);
    });
    return map;
  }, [sections, visibleTabs]);

  const activeTab = activeTabId || defaultTabId;
  const activeSections = sectionsBySlot[activeTab] ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {visibleTabs.length > 0 && (
        <div className="flex bg-bg-card border-b border-white/10 flex-shrink-0">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex-1 py-3 px-2 text-xs font-bold tracking-wider transition-colors ${
                activeTab === tab.id
                  ? 'text-text-primary border-b-2 border-derp-purple'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.icon ? `${tab.icon} ` : ''}{tab.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col flex-1 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
        {activeSections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            actionCtx={actionCtx}
            visibilityCtx={visibilityCtx}
          />
        ))}
      </div>
    </div>
  );
}

function ModalStackLayout({
  sections,
  actionCtx,
  visibilityCtx,
}: {
  sections: ScreenSectionDefinition[];
  actionCtx: ActionHandlerContext;
  visibilityCtx: ClientVisibilityContext;
}) {
  return (
    <div className="flex flex-col items-center justify-start flex-1 min-h-0 overflow-y-auto p-4 gap-3 bg-black/40 backdrop-blur-sm [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
      {sections.map((section) => (
        <div key={section.id} className="w-full max-w-md">
          <SectionRenderer
            section={section}
            actionCtx={actionCtx}
            visibilityCtx={visibilityCtx}
          />
        </div>
      ))}
    </div>
  );
}

const FIXED_NAMED_SLOTS = ['header', 'main', 'footer'];

function FixedStructureLayout({
  sections,
  actionCtx,
  visibilityCtx,
}: {
  sections: ScreenSectionDefinition[];
  actionCtx: ActionHandlerContext;
  visibilityCtx: ClientVisibilityContext;
}) {
  const bySlot = useMemo(() => {
    const map: Record<string, ScreenSectionDefinition[]> = {};
    sections.forEach((s) => {
      const slot = s.slot ?? 'main';
      if (!map[slot]) map[slot] = [];
      map[slot].push(s);
    });
    return map;
  }, [sections]);

  const renderSlot = (slotId: string) =>
    (bySlot[slotId] ?? []).map((s) => (
      <SectionRenderer
        key={s.id}
        section={s}
        actionCtx={actionCtx}
        visibilityCtx={visibilityCtx}
      />
    ));

  const extraSlots = Object.keys(bySlot).filter(
    (k) => !FIXED_NAMED_SLOTS.includes(k),
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
      {renderSlot('header')}
      <div className="flex-1">{renderSlot('main')}</div>
      {extraSlots.map((slot) => (
        <React.Fragment key={slot}>{renderSlot(slot)}</React.Fragment>
      ))}
      {renderSlot('footer')}
    </div>
  );
}

function HeroStackLayout({
  layout,
  sections,
  actionCtx,
  visibilityCtx,
}: {
  layout: ScreenLayoutConfig;
  sections: ScreenSectionDefinition[];
  actionCtx: ActionHandlerContext;
  visibilityCtx: ClientVisibilityContext;
}) {
  const heroSections = sections.filter((s) => s.slot === 'hero');
  const mainSections = sections.filter((s) => s.slot !== 'hero');
  const bgImage = (layout as any).backgroundImage as string | undefined;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
      <div
        className="relative min-h-[40vh] overflow-hidden flex-shrink-0"
        style={bgImage ? { backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {heroSections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            actionCtx={actionCtx}
            visibilityCtx={visibilityCtx}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0f0d1a] to-transparent pointer-events-none" />
      </div>
      {mainSections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      ))}
    </div>
  );
}

function GridFeedLayout({
  sections,
  actionCtx,
  visibilityCtx,
}: {
  sections: ScreenSectionDefinition[];
  actionCtx: ActionHandlerContext;
  visibilityCtx: ClientVisibilityContext;
}) {
  const headerSections = sections.filter((s) => s.slot === 'header');
  const footerSections = sections.filter((s) => s.slot === 'footer');
  const gridSections = sections.filter((s) => s.slot !== 'header' && s.slot !== 'footer');

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
      {headerSections.map((s) => (
        <SectionRenderer key={s.id} section={s} actionCtx={actionCtx} visibilityCtx={visibilityCtx} />
      ))}
      <div className="grid grid-cols-2 gap-3">
        {gridSections.map((s) => (
          <div
            key={s.id}
            className={(s.props?.span === 2 || s.slot === 'full') ? 'col-span-2' : ''}
          >
            <SectionRenderer section={s} actionCtx={actionCtx} visibilityCtx={visibilityCtx} />
          </div>
        ))}
      </div>
      {footerSections.map((s) => (
        <SectionRenderer key={s.id} section={s} actionCtx={actionCtx} visibilityCtx={visibilityCtx} />
      ))}
    </div>
  );
}

function CarouselFeedLayout({
  sections,
  actionCtx,
  visibilityCtx,
}: {
  sections: ScreenSectionDefinition[];
  actionCtx: ActionHandlerContext;
  visibilityCtx: ClientVisibilityContext;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
      {sections.map((section) => {
        if (!evaluateVisibilityGroup(section.visibility, visibilityCtx)) return null;
        return (
          <div key={section.id}>
            <div className="overflow-x-auto flex gap-3 pb-2 [-webkit-overflow-scrolling:touch]">
              <SectionRenderer
                section={section}
                actionCtx={actionCtx}
                visibilityCtx={visibilityCtx}
              />
            </div>
            {!!section.props?.pageIndicator && (
              <div className="flex justify-center gap-1.5 pb-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white/60' : 'bg-white/20'}`}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LayoutWrapper({
  layout,
  sections,
  actionCtx,
  visibilityCtx,
}: {
  layout: ScreenLayoutConfig;
  sections: ScreenSectionDefinition[];
  actionCtx: ActionHandlerContext;
  visibilityCtx: ClientVisibilityContext;
}) {
  const sorted = useMemo(
    () => [...sections].sort((a, b) => a.priority - b.priority),
    [sections],
  );

  switch (layout.layoutType) {
    case 'hero_stack':
      return (
        <HeroStackLayout
          layout={layout}
          sections={sorted}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      );
    case 'grid_feed':
      return (
        <GridFeedLayout
          sections={sorted}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      );
    case 'carousel_feed':
      return (
        <CarouselFeedLayout
          sections={sorted}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      );
    case 'tabbed_feed':
      return (
        <TabbedFeedLayout
          layout={layout}
          sections={sorted}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      );
    case 'fixed_structure':
      return (
        <FixedStructureLayout
          sections={sorted}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      );
    case 'modal_stack':
      return (
        <ModalStackLayout
          sections={sorted}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      );
    case 'vertical_feed':
    case 'grid':
    case 'split_panel':
    case 'wizard':
    default:
      return (
        <VerticalFeedLayout
          sections={sorted}
          actionCtx={actionCtx}
          visibilityCtx={visibilityCtx}
        />
      );
  }
}

export function ScreenCompositionRenderer({
  definition,
}: {
  definition: GameDefinitionRow;
}) {
  const composition = definition.data as ScreenCompositionDefinition;
  const { sections, dataSources, layout } = composition;

  const navigate = useNavigate();
  const { pushModal, dismissModal } = useModal();
  const player = useSyncPlayer();

  const actionCtx = useMemo<ActionHandlerContext>(
    () => ({ navigate, pushModal, dismissModal }),
    [navigate, pushModal, dismissModal],
  );

  const walletState = useMemo(
    () => ({
      isConnected: !!(player?.walletAddress),
      count: player?.walletAddress ? 1 : 0,
    }),
    [player?.walletAddress],
  );

  const visibilityCtx = useMemo(
    () => buildVisibilityContext(player, walletState),
    [player, walletState],
  );

  const dataCtxValue = useDataSources(dataSources);

  return (
    <ScreenDataContext.Provider value={dataCtxValue}>
      <LayoutWrapper
        layout={layout}
        sections={sections}
        actionCtx={actionCtx}
        visibilityCtx={visibilityCtx}
      />
    </ScreenDataContext.Provider>
  );
}
