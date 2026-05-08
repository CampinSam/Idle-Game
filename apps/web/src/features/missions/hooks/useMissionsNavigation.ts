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
    try { return sessionStorage.getItem('missions_activity_collapsed') === '1'; }
    catch { return false; }
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

  useEffect(() => {
    if (!showEntityPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (target === document.documentElement || target === document.body) return;
      if (e.clientX > document.documentElement.clientWidth) return;
      if (e.clientY > document.documentElement.clientHeight) return;
      if (target instanceof HTMLElement) {
        const rect = target.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        if (offsetX > target.clientWidth || offsetY > target.clientHeight) return;
      }
      const insidePicker = entityPickerRef.current?.contains(target);
      if (!insidePicker) {
        setShowEntityPicker(false);
        setActiveSlotIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEntityPicker]);

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
