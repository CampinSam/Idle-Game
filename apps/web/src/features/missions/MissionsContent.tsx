import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchMissionDefs, fetchMissionCategoryDefs } from '../../store/gameSlice';
import { useModal } from '../../context/ModalContext';
import { useCommand } from '../../hooks/useCommand';
import { api } from '../../services/api';
import {
  useSyncEntities,
  useSyncActiveMissions,
  useSyncMissionHistory,
  useSyncStatus,
  useSyncPlayer,
} from '../../hooks/useSyncSelectors';
import {
  meetsNonTeamRequirements,
  resolveCategoryDisplay,
  renderTags,
} from './components/missionUtils';
import { MissionsPageSkeleton } from './components/MissionsPageSkeleton';
import { MissionShell } from './components/MissionShell';
import { CategoriesGrid } from './components/CategoriesGrid';
import { MissionsList } from './components/MissionsList';
import { MissionBuilder } from './components/MissionBuilder';
import { useMissionsNavigation } from './hooks/useMissionsNavigation';

export default function MissionsContent() {
  const dispatch = useAppDispatch();
  const syncStatus = useSyncStatus();
  const { pushModal } = useModal();

  const { missionDefs, missionCategoryDefs } = useAppSelector((s) => s.game);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const inventoryItems = useAppSelector((s) => s.sync.items);
  const missionHistory = useSyncMissionHistory();
  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const activeMissions = useSyncActiveMissions();

  const { execute } = useCommand();
  const [error, setError] = useState('');

  useEffect(() => {
    dispatch(fetchMissionDefs());
    dispatch(fetchMissionCategoryDefs());
  }, [dispatch]);

  const allCategories = useMemo(() => {
    const catMap = new Map<string, any>();
    for (const catDef of missionCategoryDefs) {
      const defs = missionDefs.filter((d: any) => d.missionCategoryDefId === catDef.id);
      const locked = !meetsNonTeamRequirements(catDef);
      const hasChildren = missionCategoryDefs.some((c: any) => c.parentId === catDef.id);
      catMap.set(catDef.id, {
        id: catDef.id,
        name: catDef.name,
        parentId: catDef.parentId ?? null,
        display: resolveCategoryDisplay(catDef),
        tags: catDef.tags || [],
        sortOrder: catDef.sortOrder ?? 0,
        locked,
        enabled: catDef.enabled ?? true,
        count: defs.length,
        hasChildren,
        inlineOnly: catDef.inlineOnly === true,
      });
    }
    return Array.from(catMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [missionDefs, missionCategoryDefs, profile]);

  const nav = useMissionsNavigation({ missionDefs, missionCategoryDefs, allCategories });
  const {
    categoryStack, selectedMission, selectedEntities, setSelectedEntities,
    showEntityPicker, setShowEntityPicker,
    activityCollapsed, setActivityCollapsed, entityPickerRef,
    pushCategory, popCategory, selectMission, selectInlineMission,
    backToCategories,
  } = nav;

  const selectedDef = missionDefs.find((d: any) => d.id === selectedMission);
  const currentCategoryId = categoryStack[categoryStack.length - 1] ?? null;

  const visibleCategories = useMemo(
    () => allCategories.filter(c => c.parentId === currentCategoryId),
    [allCategories, currentCategoryId],
  );

  const currentCat = allCategories.find(c => c.id === currentCategoryId) ?? null;
  const currentCatHasChildren = currentCategoryId
    ? allCategories.some(c => c.parentId === currentCategoryId)
    : false;

  const categoryMissions = currentCategoryId
    ? missionDefs
        .filter((d: any) => d.missionCategoryDefId === currentCategoryId)
        .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];

  const getInlineMissions = (catId: string) =>
    missionDefs
      .filter((d: any) => d.missionCategoryDefId === catId && d.inline === true)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const getInlineLabel = (def: any): string => {
    if (def.inlineLabel) return def.inlineLabel;
    const dur = def.timer?.duration ?? 0;
    if (dur < 60) return `${dur}s`;
    return `${Math.round(dur / 60)}m`;
  };

  if (syncStatus === 'disconnected') return <MissionsPageSkeleton />;

  const idleEntities = entities.filter((b: any) => b.status === 'idle');

  const handleBackFromMissionDetail = () => {
    nav.resetSelection();
    if (currentCat?.inlineOnly) {
      nav.setCategoryStack(prev => prev.slice(0, -1));
    }
  };

  const handleViewJob = useCallback(async (jobId: string) => {
    try {
      const spec = await api.getModalSpec({ jobId });
      if (spec?.version === 1) pushModal(spec);
    } catch (err) {
      console.error('[MissionsContent] Failed to fetch modal spec:', err);
    }
  }, [pushModal]);

  const handleCompleteJob = useCallback(async (jobId: string) => {
    await execute('CompleteMission', { jobId });
    const spec = await api.getModalSpec({ jobId });
    if (spec?.version === 1) pushModal(spec);
  }, [execute, pushModal]);

  if (currentCategoryId && selectedMission && selectedDef && currentCat) {
    return (
      <MissionBuilder
        selectedDef={selectedDef}
        currentCat={currentCat}
        missionCategoryDefs={missionCategoryDefs}
        entities={entities}
        idleEntities={idleEntities}
        initialSelectedEntities={selectedEntities}
        currencyBalances={currencyBalances}
        inventoryItems={inventoryItems}
        error={error}
        onBack={handleBackFromMissionDetail}
        onMissionStarted={backToCategories}
      />
    );
  }

  const shellProps = {
    activeMissions,
    missionDefs,
    missionHistory,
    profile,
    activityCollapsed,
    onToggleActivity: () => setActivityCollapsed(c => !c),
    onOpenJob: handleViewJob,
    onCompleteJob: handleCompleteJob,
  };

  const catBorder = currentCat?.display?.borderColor;
  const errorBanner = error && (
    <div className="mb-2 px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-xs">
      {error}
    </div>
  );

  const listHeader = (label: string) => (
    <div
      className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg border bg-bg-card"
      style={catBorder ? { borderColor: catBorder } : undefined}
    >
      <button
        onClick={popCategory}
        className="px-3 py-1 rounded-full bg-white/5 border border-white/15 text-white text-[12px] font-bold hover:bg-white/10 cursor-pointer"
      >
        ← Back
      </button>
      <h2 className="m-0 flex-1 font-cinzel text-[15px] font-extrabold tracking-wide uppercase text-text-primary truncate">
        {label}
      </h2>
      {currentCat && renderTags(currentCat.tags)}
    </div>
  );

  const grid = (
    <CategoriesGrid
      visibleCategories={visibleCategories}
      getInlineMissions={getInlineMissions}
      getInlineLabel={getInlineLabel}
      currencyBalances={currencyBalances}
      inventoryItems={inventoryItems}
      onPushCategory={pushCategory}
      onSelectInlineMission={selectInlineMission}
    />
  );

  let middle: React.ReactNode;
  if (currentCategoryId && currentCatHasChildren) {
    middle = <>{listHeader(currentCat?.name || 'Categories')}{grid}</>;
  } else if (currentCategoryId) {
    middle = (
      <>
        {listHeader(currentCat?.name || 'Missions')}
        <MissionsList
          missions={categoryMissions}
          missionCategoryDefs={missionCategoryDefs}
          currencyBalances={currencyBalances}
          inventoryItems={inventoryItems}
          onSelect={selectMission}
        />
      </>
    );
  } else {
    middle = grid;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {errorBanner}
      <MissionShell {...shellProps} middle={middle} />
    </div>
  );
}
