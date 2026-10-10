import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface UseMissionsNavigationResult {
  categoryStack: string[];
  setCategoryStack: React.Dispatch<React.SetStateAction<string[]>>;
  selectedMission: string | null;
  setSelectedMission: React.Dispatch<React.SetStateAction<string | null>>;
  selectedEntities: string[];
  setSelectedEntities: React.Dispatch<React.SetStateAction<string[]>>;
  showEntityPicker: boolean;
  setShowEntityPicker: React.Dispatch<React.SetStateAction<boolean>>;
  activeSlotIndex: number | null;
  setActiveSlotIndex: React.Dispatch<React.SetStateAction<number | null>>;
  activityCollapsed: boolean;
  setActivityCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  entityPickerRef: React.RefObject<HTMLDivElement>;
  resetSelection: () => void;
  pushCategory: (catId: string) => void;
  popCategory: () => void;
  selectMission: (missionId: string) => void;
  selectInlineMission: (catId: string, missionId: string) => void;
  backToCategories: () => void;
}

export function useMissionsNavigation(opts: {
  missionDefs: any[];
  missionCategoryDefs: any[];
  allCategories: Array<{ id: string; inlineOnly: boolean }>;
}): UseMissionsNavigationResult {
  const { missionDefs, missionCategoryDefs, allCategories } = opts;
  const [searchParams, setSearchParams] = useSearchParams();

  const [categoryStack, setCategoryStack] = useState<string[]>(() => {
    try {
      const s = sessionStorage.getItem('missions_nav_stack');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const entityPickerRef = useRef<HTMLDivElement>(null);

  const [activityCollapsed, setActivityCollapsed] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem('missions_activity_collapsed');
      return stored === null ? true : stored === '1';
    }
    catch { return true; }
  });

  useEffect(() => {
    try { sessionStorage.setItem('missions_nav_stack', JSON.stringify(categoryStack)); }
    catch {}
  }, [categoryStack]);

  useEffect(() => {
    try { sessionStorage.setItem('missions_activity_collapsed', activityCollapsed ? '1' : '0'); }
    catch {}
  }, [activityCollapsed]);

  useEffect(() => {
    if (!missionCategoryDefs.length) return;
    const topId = categoryStack[categoryStack.length - 1];
    if (!topId) return;
    const topDef = missionCategoryDefs.find((c: any) => c.id === topId);
    if (topDef?.inlineOnly && !selectedMission) {
      setCategoryStack(prev => prev.slice(0, -1));
    }
  }, [categoryStack, missionCategoryDefs, selectedMission]);

  const repeatMissionDefId = searchParams.get('repeat');
  useEffect(() => {
    if (!repeatMissionDefId || missionDefs.length === 0) return;
    const def = missionDefs.find((d: any) => d.id === repeatMissionDefId);
    if (!def) return;
    const catId = def.missionCategoryDefId;
    if (catId) setCategoryStack([catId]);
    setSelectedMission(def.id);
    setSelectedEntities([]);
    setSearchParams({}, { replace: true });
  }, [repeatMissionDefId, missionDefs, setSearchParams]);

  const resetSelection = () => {
    setSelectedMission(null);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const pushCategory = (catId: string) => {
    const target = allCategories.find(c => c.id === catId);
    if (target?.inlineOnly) return;
    setCategoryStack(prev => [...prev, catId]);
    resetSelection();
  };

  const popCategory = () => {
    setCategoryStack(prev => prev.slice(0, -1));
    resetSelection();
  };

  const selectMission = (missionId: string) => {
    setSelectedMission(missionId);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const selectInlineMission = (catId: string, missionId: string) => {
    setCategoryStack(prev => prev[prev.length - 1] === catId ? prev : [...prev, catId]);
    setSelectedMission(missionId);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const backToCategories = () => {
    setCategoryStack([]);
    resetSelection();
  };

  return {
    categoryStack,
    setCategoryStack,
    selectedMission,
    setSelectedMission,
    selectedEntities,
    setSelectedEntities,
    showEntityPicker,
    setShowEntityPicker,
    activeSlotIndex,
    setActiveSlotIndex,
    activityCollapsed,
    setActivityCollapsed,
    entityPickerRef,
    resetSelection,
    pushCategory,
    popCategory,
    selectMission,
    selectInlineMission,
    backToCategories,
  };
}
