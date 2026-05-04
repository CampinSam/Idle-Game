import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  fetchMissionDefs,
  fetchMissionCategoryDefs,
} from '../../store/gameSlice';
import { useCommand } from '../../hooks/useCommand';
import { audioEngine } from '../../services/AudioEngine';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncActiveMissions,
  useSyncMissionHistory,
  useSyncStatus,
} from '../../hooks/useSyncSelectors';
import { useModal } from '../../context/ModalContext';
import { useCollectJob } from '../../hooks/useCollectJob';
import { api } from '../../services/api';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../tick';
import { getDifficultyDisplay, ANTI_WHALE_CAPS, mergeDisplayStyles, overlayToCss, textStyleToCss, type DisplayStyle } from '@derp/shared';
import GameIcon from '../../components/GameIcon';
import { EntityCard, EntityList } from '../entities/components';
import { getEntityMP } from '../entities/utils';
import { resolveAssetUrl } from '../../utils/iconResolver';
import './MissionsPage.css';

const DEFAULT_DISPLAY = { borderColor: '#3B82F6', backgroundImage: '/images/mission-quick.png', cardBackground: '#1a1a2e' };

function getCategoryIcon(categoryName: string): string {
  const n = (categoryName || '').toLowerCase();
  if (n.includes('prologue') || n.includes('story')) return '📜';
  if (n.includes('quick') || n.includes('fast')) return '⚡';
  if (n.includes('outpost') || n.includes('base')) return '🏰';
  if (n.includes('elite') || n.includes('hard')) return '💀';
  if (n.includes('daily')) return '📅';
  return '⚔️';
}

interface ReqStatusEntry {
  type: string;
  met: boolean;
  label?: string;
  [key: string]: unknown;
}

function bgImageCss(value: string | null | undefined): string {
  const url = resolveAssetUrl(value);
  return url ? `url(${url})` : 'none';
}

function resolveDisplay(def: any, categoryDefs: any[]) {
  const missionDisplay = def.display || {};
  const catDef = categoryDefs.find((c: any) => c.id === def.missionCategoryDefId);
  const catDisplay = catDef?.displayDef || {};

  const style: DisplayStyle = mergeDisplayStyles(
    catDisplay.style as DisplayStyle | undefined,
    missionDisplay.style as DisplayStyle | undefined,
  );

  return {
    borderColor: missionDisplay.borderColor || catDisplay.borderColor || DEFAULT_DISPLAY.borderColor,
    backgroundImage: missionDisplay.backgroundImage || catDisplay.backgroundImage || DEFAULT_DISPLAY.backgroundImage,
    cardBackground: missionDisplay.cardBackground || catDisplay.cardBackground || DEFAULT_DISPLAY.cardBackground,
    style,
  };
}

function resolveCategoryDisplay(catDef: any) {
  const d = catDef?.displayDef || {};
  return {
    borderColor: d.borderColor || DEFAULT_DISPLAY.borderColor,
    backgroundImage: d.backgroundImage || DEFAULT_DISPLAY.backgroundImage,
    cardBackground: d.cardBackground || DEFAULT_DISPLAY.cardBackground,
    style: (d.style || {}) as DisplayStyle,
  };
}

function displayCssVars(
  display: { style?: DisplayStyle },
  opts?: { hero?: boolean },
): { vars: Record<string, string>; titleStyle: React.CSSProperties } {
  // Body typography is intentionally exposed only via CSS custom properties
  // (consumed by targeted text classes like .mp-card-rewards, .md-description)
  // rather than spread onto the card container, so it does not bleed into
  // unrelated descendants like buttons, badges, or chevrons.
  const style = display.style || {};
  const overlay = overlayToCss(style.overlay);
  const bg = style.background || {};
  const body = style.body || {};
  const vars: Record<string, string> = {};
  if (overlay) {
    if (opts?.hero) vars['--md-hero-overlay'] = overlay;
    else vars['--card-overlay'] = overlay;
  }
  if (bg.position) vars['--card-bg-position'] = bg.position;
  if (bg.size) vars['--card-bg-size'] = bg.size;
  if (bg.repeat) vars['--card-bg-repeat'] = bg.repeat;
  if (body.color) vars['--card-body-color'] = body.color;
  if (body.fontFamily) vars['--card-body-font-family'] = body.fontFamily;
  if (body.fontSize) vars['--card-body-font-size'] = String(body.fontSize);
  if (body.fontWeight !== undefined && body.fontWeight !== '') vars['--card-body-font-weight'] = String(body.fontWeight);
  if (body.lineHeight) vars['--card-body-line-height'] = String(body.lineHeight);
  return {
    vars,
    titleStyle: textStyleToCss(style.title) as React.CSSProperties,
  };
}

function meetsNonTeamRequirements(def: any): boolean {
  const status = def.requirementStatus;
  if (Array.isArray(status) && status.length > 0) {
    return status.every((r: any) => r.met);
  }
  const reqs = def.requirements;
  if (Array.isArray(reqs) && reqs.some((r: any) => r.type !== 'team_size')) {
    return false;
  }
  return true;
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs ? `${m}m ${rs}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const rm = Math.floor((s % 3600) / 60);
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function getReqValue(reqs: any[], type: string, defaultValue: any = 0, operator?: string): any {
  if (!Array.isArray(reqs)) return defaultValue;
  if (operator) {
    const found = reqs.find((r: any) => r.type === type && (r.operator ?? 'gte') === operator);
    return found ? found.value : defaultValue;
  }
  const found = reqs.find((r: any) => r.type === type);
  return found ? found.value : defaultValue;
}

function getReqArray(requirements: any, type: string): any[] {
  if (!Array.isArray(requirements)) return [];
  const entry = requirements.find((r: any) => r.type === type);
  return Array.isArray(entry?.value) ? entry.value : [];
}

function formatTimeShort(ms: number) {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function renderTags(tags: any[]) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  return (
    <div className="mp-tags">
      {tags.map((tag: any, i: number) => (
        <span key={i} className="mp-tag" style={{ background: (tag.color || '#3B82F6'), color: '#FFFFFF' }}>
          {tag.text}
        </span>
      ))}
    </div>
  );
}

function MissionsPageSkeleton() {
  return (
    <div className="missions-page page-transition-wrapper">
      <div className="missions-wrapper-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ width: '100%', height: 110, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MissionsPage() {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { execute } = useCommand();
  const { pushModal } = useModal();
  const { collectJob } = useCollectJob();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const syncStatus = useSyncStatus();
  const now = Date.now();

  const openModalSpec = useCallback(async (params: { jobId?: string }) => {
    try {
      const spec = await api.getModalSpec(params);
      if (spec?.version === 1) {
        pushModal(spec);
      }
    } catch (err) {
      console.error('[MissionsPage] Failed to fetch modal spec:', err);
    }
  }, [pushModal]);
  const { missionDefs, missionCategoryDefs } = useAppSelector((s) => s.game);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const inventoryItems = useAppSelector((s) => s.sync.items);
  const missionHistory = useSyncMissionHistory();
  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const activeMissions = useSyncActiveMissions();
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
  const [error, setError] = useState('');
  const entityPickerRef = useRef<HTMLDivElement>(null);
  const teamGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(fetchMissionDefs());
    dispatch(fetchMissionCategoryDefs());
  }, [dispatch]);

  useEffect(() => {
    try { sessionStorage.setItem('missions_nav_stack', JSON.stringify(categoryStack)); }
    catch {}
  }, [categoryStack]);

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
      // Ignore clicks on the page/document scrollbar — those land on <html>
      // or <body> and would otherwise dismiss the picker before the user
      // can scroll down to it.
      if (target === document.documentElement || target === document.body) return;
      // Ignore clicks beyond the document's clientWidth/Height (vertical or
      // horizontal page scrollbar tracks).
      if (e.clientX > document.documentElement.clientWidth) return;
      if (e.clientY > document.documentElement.clientHeight) return;
      // Ignore clicks on any scrollable inner container's scrollbar.
      // clientWidth/Height excludes the scrollbar gutter, so if the click
      // lands beyond the target's content area, it's on the scrollbar itself.
      if (target instanceof HTMLElement) {
        const rect = target.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        if (offsetX > target.clientWidth || offsetY > target.clientHeight) return;
      }
      const insidePicker = entityPickerRef.current?.contains(target);
      const insideTeamGrid = teamGridRef.current?.contains(target);
      if (!insidePicker && !insideTeamGrid) {
        setShowEntityPicker(false);
        setActiveSlotIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEntityPicker]);

  const selectedDef = missionDefs.find((d: any) => d.id === selectedMission);

  const currentCategoryId = categoryStack[categoryStack.length - 1] ?? null;

  const allCategories = useMemo(() => {
    const catMap = new Map<string, { id: string; name: string; parentId: string | null; display: any; tags: any[]; sortOrder: number; locked: boolean; enabled: boolean; count: number; hasChildren: boolean; inlineOnly: boolean }>();

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

  const visibleCategories = useMemo(() => {
    return allCategories.filter(c => c.parentId === currentCategoryId);
  }, [allCategories, currentCategoryId]);

  const currentCat = allCategories.find(c => c.id === currentCategoryId) ?? null;
  const currentCatHasChildren = currentCategoryId
    ? allCategories.some(c => c.parentId === currentCategoryId)
    : false;

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

  const teamMP = useMemo(() => {
    return selectedEntities.reduce((sum, id) => {
      const entity = entities.find((b: any) => b.id === id);
      return sum + (entity ? getEntityMP(entity) : 0);
    }, 0);
  }, [selectedEntities, entities]);

  const successChance = useMemo(() => {
    if (!selectedDef || selectedEntities.length === 0) return 0;
    const difficulty = selectedDef.difficulty || 100;
    const minChance = selectedDef.minSuccessChance ?? 0;
    const maxChance = selectedDef.maxSuccessChance ?? 100;
    const raw = teamMP / (teamMP + difficulty);
    return Math.round(Math.min(Math.max(raw * 100, minChance), maxChance));
  }, [teamMP, selectedDef, selectedEntities]);

  const [completingId, setCompletingId] = useState<string | null>(null);

  if (syncStatus === 'disconnected') return <MissionsPageSkeleton />;

  const idleEntities = entities.filter((b: any) => b.status === 'idle');

  const removeEntityFromSlot = (index: number) => {
    setSelectedEntities((prev) => prev.filter((_, i) => i !== index));
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const openSlot = (index: number) => {
    setActiveSlotIndex(index);
    setShowEntityPicker(true);
  };

  const selectEntityForSlot = (entityId: string) => {
    setSelectedEntities((prev) => {
      const next = [...prev];
      if (activeSlotIndex !== null && activeSlotIndex < next.length) {
        next[activeSlotIndex] = entityId;
      } else {
        next.push(entityId);
      }
      return next;
    });
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const pushCategory = (catId: string) => {
    const target = allCategories.find(c => c.id === catId);
    if (target?.inlineOnly) return;
    setCategoryStack(prev => [...prev, catId]);
    setSelectedMission(null);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const popCategory = () => {
    setCategoryStack(prev => prev.slice(0, -1));
    setSelectedMission(null);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const handleSelectMission = (missionId: string) => {
    setSelectedMission(missionId);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const handleSelectInlineMission = (catId: string, missionId: string) => {
    setCategoryStack(prev => prev[prev.length - 1] === catId ? prev : [...prev, catId]);
    setSelectedMission(missionId);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const handleBackToCategories = () => {
    setCategoryStack([]);
    setSelectedMission(null);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
  };

  const handleBackFromMissionDetail = () => {
    setSelectedMission(null);
    setSelectedEntities([]);
    setShowEntityPicker(false);
    setActiveSlotIndex(null);
    if (currentCat?.inlineOnly) {
      setCategoryStack(prev => prev.slice(0, -1));
    }
  };

  const categoryMissions = currentCategoryId
    ? missionDefs
        .filter((d: any) => d.missionCategoryDefId === currentCategoryId)
        .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];
  const catDisplay = currentCat?.display || DEFAULT_DISPLAY;

  const handleStart = async () => {
    if (!selectedMission) return;
    setError('');
    try {
      await execute('StartMission', { defId: selectedMission, entityIds: selectedEntities });
      audioEngine.play('sfx.mission.start');
      handleBackToCategories();
    } catch (e: any) {
      audioEngine.play('ui.error');
      setError(e.message || 'Failed to start mission');
    }
  };

  const handleComplete = async (missionId: string) => {
    setError('');
    setCompletingId(missionId);
    try {
      await collectJob(missionId);
    } catch (e: any) {
      setError(e.message || 'Failed to complete mission');
    } finally {
      setCompletingId(null);
    }
  };

  const renderSlots = () => {
    const maxSlots = ANTI_WHALE_CAPS.maxActiveMissions(profile?.keeperLevel ?? 1);
    const emptyCount = Math.max(0, maxSlots - activeMissions.length);
    return (
      <div className="mp-activity-box mp-slots-box">
        <h3 className="mp-activity-title">MISSION SLOTS</h3>
        <div className="mp-activity-group">
          {activeMissions.map((m: any) => {
            const timer = (m.startTick != null && m.durationTicks != null)
              ? createCountdownTimer({ startTick: m.startTick, durationTicks: m.durationTicks })
              : null;
            const remainingTicks = timer ? timer.getValue(currentTick) : Infinity;
            const remaining = timer && tickRate > 0 ? (remainingTicks / tickRate) * 1000 : Infinity;
            const isReady = remaining <= 0;
            const progress = (m.durationTicks && m.durationTicks > 0)
              ? Math.min(100, Math.max(2, ((m.durationTicks - remainingTicks) / m.durationTicks) * 100))
              : 2;
            return (
              <div key={m.id} className={`mp-activity-item ${isReady ? 'ready' : 'in-progress'}`} onClick={() => openModalSpec({ jobId: m.id })} style={{ cursor: 'pointer' }}>
                <span className="mp-activity-name">{missionDefs.find((d: any) => d.id === m.defId)?.name ?? m.defId ?? 'Unknown Mission'}</span>
                <span className="mp-activity-status" style={{ color: isReady ? '#10B981' : '#F59E0B' }}>
                  {isReady ? '✅ READY' : `⏱ ${formatTimeShort(remaining)}`}
                </span>
                {isReady ? (
                  <button className="mp-activity-collect" onClick={(e) => { e.stopPropagation(); handleComplete(m.id); }} disabled={completingId === m.id}>
                    {completingId === m.id ? '...' : 'COLLECT'}
                  </button>
                ) : (
                  <div className="mp-activity-bar">
                    <div className="mp-activity-bar-fill" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <div key={`open-slot-${i}`} className="mp-slot-empty">
              <span className="mp-slot-empty-icon">＋</span>
              <span className="mp-slot-empty-label">Mission Available</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderActivity = () => {
    if (missionHistory.length === 0) return null;
    return (
      <div className="mp-activity-box">
        <h3 className="mp-activity-title">MISSION ACTIVITY</h3>
        <div className="mp-activity-group">
          {missionHistory.slice(0, 5).map((m: any) => (
            <div key={m.id} className={`mp-activity-item ${m.status}`} onClick={() => openModalSpec({ jobId: m.id })} style={{ cursor: 'pointer' }}>
              <span className="mp-activity-name">{missionDefs.find((d: any) => d.id === m.defId)?.name ?? m.defId ?? 'Unknown Mission'}</span>
              <span className={`mp-activity-status ${m.status}`}>
                {m.status === 'completed' ? '✅' : '❌'}
              </span>
              {(m.results?.rewards || m.result?.rewards) && (
                <span className="mp-activity-rewards">{((m.results?.rewards || m.result?.rewards) as any[]).map((r: any) => `+${r.amount} ${r.name || r.key || r.type}`).join(', ')}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (currentCategoryId && !selectedMission) {
    if (currentCatHasChildren) {
      return (
        <div className="missions-page page-transition-wrapper">
          {renderSlots()}
          <div className="mp-list-wrapper" style={{ borderColor: catDisplay.borderColor }}>
            <div className="mp-list-header">
              <button className="mp-back-pill" onClick={popCategory}>← Back</button>
              <h2 className="mp-list-label">{currentCat?.name || 'Categories'}</h2>
              {currentCat && renderTags(currentCat.tags)}
            </div>
            <div className="mp-categories">
              {visibleCategories.map((cat) => {
                const display = cat.display;
                const { vars, titleStyle } = displayCssVars(display);
                const unavailable = cat.locked || !cat.enabled;
                const inlineMissions = getInlineMissions(cat.id);
                const navigable = !cat.inlineOnly;
                return (
                  <div
                    key={cat.id}
                    className={`mp-mission-card ${cat.locked ? 'mp-locked' : ''} ${!cat.enabled ? 'mp-disabled' : ''} ${cat.inlineOnly ? 'mp-inline-only' : ''}`}
                    style={{
                      backgroundColor: display.cardBackground || DEFAULT_DISPLAY.cardBackground,
                      '--card-bg-image': bgImageCss(display.backgroundImage),
                      borderColor: display.borderColor,
                      cursor: navigable && !unavailable ? undefined : 'default',
                      ...vars,
                    } as React.CSSProperties}
                    onClick={() => navigable && !unavailable && pushCategory(cat.id)}
                  >
                    <div className="mp-card-content">
                      <div className="mp-card-header">
                        <h3 className="mp-card-title" style={titleStyle}>{cat.name}</h3>
                        {cat.hasChildren && navigable && <span className="mp-cat-chevron">›</span>}
                      </div>
                      {cat.tags.length > 0 && renderTags(cat.tags)}
                      {cat.locked && <div className="mp-lock-reason">🔒 Requirements not met</div>}
                      {!cat.enabled && !cat.locked && <div className="mp-disabled-reason">🚫 Currently Unavailable</div>}
                      {!unavailable && inlineMissions.length > 0 && (
                        <div className="mp-inline-missions" onClick={e => e.stopPropagation()}>
                          {inlineMissions.map((def: any) => {
                            const inlineCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(def.cost) ? def.cost : [];
                            const canAffordInline = inlineCost.every(entry => {
                              const have = entry.type === 'currency'
                                ? (currencyBalances[entry.id] ?? 0)
                                : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id).reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
                              return have >= entry.amount;
                            });
                            return (
                              <button
                                key={def.id}
                                className={`mp-inline-pill${!canAffordInline ? ' mp-inline-pill--unaffordable' : ''}`}
                                disabled={!canAffordInline}
                                title={!canAffordInline ? "Can't afford this mission" : undefined}
                                onClick={() => handleSelectInlineMission(cat.id, def.id)}
                              >{getInlineLabel(def)}</button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {renderActivity()}
        </div>
      );
    }

    return (
      <div className="missions-page page-transition-wrapper">
        {renderSlots()}
        <div className="mp-list-wrapper" style={{ borderColor: catDisplay.borderColor }}>
          <div className="mp-list-header">
            <button className="mp-back-pill" onClick={popCategory}>← Back</button>
            <h2 className="mp-list-label">{currentCat?.name || 'Missions'}</h2>
            {currentCat && renderTags(currentCat.tags)}
          </div>
          <div className="mp-list-missions">
            {categoryMissions.map((def: any) => {
              const locked = !meetsNonTeamRequirements(def);
              const missionEnabled = def.enabled ?? true;
              const unavailable = locked || !missionEnabled;
              const diffInfo = getDifficultyDisplay(def.difficulty);
              const display = resolveDisplay(def, missionCategoryDefs);
              const { vars, titleStyle } = displayCssVars(display);
              const missionTags = def.tags || [];
              const listCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(def.cost) ? def.cost : [];
              const getListHave = (entry: { type: string; id: string }) =>
                entry.type === 'currency'
                  ? (currencyBalances[entry.id] ?? 0)
                  : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id).reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
              return (
                <div
                  key={def.id}
                  className={`mp-mission-card mp-inner-card ${locked ? 'mp-locked' : ''} ${!missionEnabled ? 'mp-disabled' : ''}`}
                  style={{
                    backgroundColor: display.cardBackground || DEFAULT_DISPLAY.cardBackground,
                    '--card-bg-image': bgImageCss(display.backgroundImage),
                    borderColor: display.borderColor,
                    ...vars,
                  } as React.CSSProperties}
                  onClick={() => !unavailable && handleSelectMission(def.id)}
                >
                  <div className="mp-card-content">
                    <div className="mp-card-header">
                      <h3 className="mp-card-title" style={titleStyle}>{def.name}</h3>
                      <span className="mp-card-duration" style={{ background: diffInfo.color, color: '#FFFFFF' }}>{diffInfo.label}</span>
                    </div>
                    {missionTags.length > 0 && renderTags(missionTags)}
                    {listCost.length > 0 && (
                      <div className="mp-card-cost-chips">
                        {listCost.map((entry, i) => {
                          const have = getListHave(entry);
                          const canAffordEntry = have >= entry.amount;
                          return (
                            <span key={i} className={`md-cost-entry${canAffordEntry ? '' : ' md-cost-unaffordable'}`}>
                              <GameIcon src={entry.id} size={14} />
                              <span>{entry.amount.toLocaleString()}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {locked && (
                      <div className="mp-lock-reason">
                        🔒 {getReqValue(def.requirements, 'keeper_level') > 0
                          ? `Requires Keeper Lv ${getReqValue(def.requirements, 'keeper_level')}`
                          : 'Requirements not met'}
                      </div>
                    )}
                    {!missionEnabled && !locked && (
                      <div className="mp-disabled-reason">🚫 Currently Unavailable</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {renderActivity()}
      </div>
    );
  }

  if (currentCategoryId && selectedMission && selectedDef && currentCat) {
    const diffInfo = getDifficultyDisplay(selectedDef.difficulty);
    const display = resolveDisplay(selectedDef, missionCategoryDefs);
    const missionTags = selectedDef.tags || [];

    const missionCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(selectedDef.cost) ? selectedDef.cost : [];
    const getHaveForEntry = (entry: { type: string; id: string }) =>
      entry.type === 'currency'
        ? (currencyBalances[entry.id] ?? 0)
        : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id).reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
    const canAffordMission = missionCost.every(e => getHaveForEntry(e) >= e.amount);

    const heroCss = displayCssVars(display, { hero: true });

    const teamMin = getReqValue(selectedDef.requirements, 'team_size', 1, 'gte');
    const teamMax = getReqValue(selectedDef.requirements, 'team_size', 1, 'lte');
    const keeperLvl = getReqValue(selectedDef.requirements, 'keeper_level');
    const duration = selectedDef.timer?.duration ?? 0;
    const difficulty = selectedDef.difficulty || 100;

    const powerRatio = teamMP > 0 ? Math.min(1, teamMP / (teamMP + difficulty)) : 0;

    const teamMeetsMin = selectedEntities.length >= teamMin;
    const teamMeetsMax = selectedEntities.length <= teamMax;
    const canStart = teamMeetsMin && teamMeetsMax && canAffordMission && selectedEntities.length > 0;

    const grade = successChance >= 90 ? 'A' : successChance >= 75 ? 'B' : successChance >= 55 ? 'C' : successChance >= 35 ? 'D' : 'F';
    const gradeColor = successChance >= 75 ? '#10B981' : successChance >= 55 ? '#F59E0B' : '#EF4444';
    const successColor = successChance >= 70 ? '#10B981' : successChance >= 40 ? '#F59E0B' : '#EF4444';

    const reqStatus: ReqStatusEntry[] = Array.isArray(selectedDef.requirementStatus) ? selectedDef.requirementStatus : [];

    const catIcon = getCategoryIcon(currentCat.name);

    const traitReqs = Array.isArray(selectedDef.requirements)
      ? selectedDef.requirements.filter((r: { type: string }) => r.type === 'trait')
      : [];
    const recommendedNote = traitReqs.length > 0
      ? ` · ${traitReqs.map((r: { key?: string; value?: number }) => `${r.key ?? 'trait'} ${r.value ?? 1}+`).join(', ')} preferred`
      : null;

    const costSubtitleParts: string[] = [];
    if (missionCost.length > 0) {
      costSubtitleParts.push(`Cost: ${missionCost.map((e) => e.amount.toLocaleString()).join('+')} `);
    }
    costSubtitleParts.push(`Duration: ${formatDuration(duration)}`);
    const costSubtitle = costSubtitleParts.join('• ');

    const handleAutoAssign = () => {
      const auto = idleEntities.slice(0, teamMax).map((b: any) => b.id);
      setSelectedEntities(auto);
      setShowEntityPicker(false);
      setActiveSlotIndex(null);
      setTimeout(() => teamGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    };

    return (
      <div className="missions-page md-inline page-transition-wrapper">
        <div key={selectedMission} className="md-unified-card" style={{ borderColor: display.borderColor, ...heroCss.vars } as React.CSSProperties}>

          <div className="md-hero" style={{ backgroundImage: bgImageCss(display.backgroundImage) }}>
            <button className="mp-back-pill md-hero-back-pos" onClick={handleBackFromMissionDetail}>← Back</button>
            <div className="md-hero-gradient" />
            <div className="md-hero-content">
              <h1 className="md-title" style={heroCss.titleStyle}>
                <span className="md-title-icon">{catIcon}</span>
                {selectedDef.name}
              </h1>
              <div className="md-badges">
                <span className="md-badge md-badge-tier">{diffInfo.tier}</span>
                <span className="md-badge md-badge-diff" style={{ background: diffInfo.color }}>{diffInfo.label}</span>
                <span className="md-badge md-badge-dur">⏱ {formatDuration(duration)}</span>
                {missionTags.map((tag: any, i: number) => (
                  <span key={i} className="md-badge" style={{ background: tag.color || '#3B82F6' }}>{tag.text}</span>
                ))}
              </div>
            </div>
            <div className="md-recommended-strip">
              👥 RECOMMENDED: {teamMax} {teamMax === 1 ? 'Entity' : 'Entities'}
              {keeperLvl > 0 && <span className="md-rec-extra"> · Keeper Lv {keeperLvl}+</span>}
              {recommendedNote && <span className="md-rec-extra">{recommendedNote}</span>}
            </div>
          </div>

          <div className="md-body">
            {selectedDef.description && (
              <p className="md-description">{selectedDef.description}</p>
            )}

            <div className="md-two-col">
              <div className="md-panel">
                <div className="md-panel-title">Potential Rewards</div>
                <div className="md-rewards-grid">
                  {selectedDef.rewardPreview && selectedDef.rewardPreview.length > 0
                    ? selectedDef.rewardPreview.map((line: string, i: number) => (
                        <div key={i} className="md-reward-item">
                          <div className="md-reward-item-icon">🎁</div>
                          <div className="md-reward-item-label">{line}</div>
                        </div>
                      ))
                    : <span className="md-panel-empty">No reward data</span>
                  }
                </div>
              </div>

              <div className="md-panel">
                <div className="md-panel-title">Team Power vs Difficulty</div>
                <div className="md-power-vs">
                  <div className="md-power-numbers">
                    <div className="md-power-side md-power-mp">
                      <span className="md-power-val">{teamMP}</span>
                      <span className="md-power-lbl">MP</span>
                    </div>
                    <div className="md-power-sep">vs</div>
                    <div className="md-power-side md-power-d">
                      <span className="md-power-val">{difficulty}</span>
                      <span className="md-power-lbl">D</span>
                    </div>
                  </div>
                  <div className="md-power-bar-wrap">
                    <div className="md-power-bar-mp" style={{ width: `${powerRatio * 100}%` }} />
                    <div className="md-power-bar-d" style={{ width: `${(1 - powerRatio) * 100}%` }} />
                  </div>
                  <div className="md-success-row">
                    <span className="md-success-label-sm">SUCCESS CHANCE</span>
                    <span className="md-success-pct-sm" style={{ color: successColor }}>{successChance}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="md-two-col md-two-col--team">
              <div className="md-panel md-panel--team" ref={teamGridRef}>
                <div className="md-panel-title-row">
                  <span className="md-panel-title">Select Your Team</span>
                  <span className="md-team-count">{selectedEntities.length}/{teamMax}</span>
                </div>
                <div className="md-team-grid">
                  {selectedEntities.map((entityId, slotIndex) => {
                    const entity = entities.find((b: any) => b.id === entityId);
                    if (!entity) return null;
                    const isActive = activeSlotIndex === slotIndex;
                    return (
                      <EntityCard
                        key={entity.id}
                        entity={entity}
                        useCase="mission"
                        active={isActive}
                        onClick={() => openSlot(slotIndex)}
                        onRemove={() => removeEntityFromSlot(slotIndex)}
                      />
                    );
                  })}
                  {selectedEntities.length < teamMax && (
                    <div
                      className={`md-empty-slot ${activeSlotIndex === selectedEntities.length ? 'md-empty-slot--active' : ''}`}
                      onClick={() => openSlot(selectedEntities.length)}
                    >
                      <div className="md-empty-slot__top">
                        <span className="md-empty-slot__plus">＋</span>
                      </div>
                      <div className="md-empty-slot__bot">
                        <span className="md-empty-slot__label">Add Entity</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="md-panel md-panel--readiness">
                <div className="md-panel-title">Mission Readiness</div>
                <div className="md-readiness-grade" style={{ color: gradeColor }}>
                  <span className="md-grade-letter">{grade}</span>
                  <span className="md-grade-pct">{successChance}%</span>
                </div>
                <div className="md-readiness-rows">
                  <div className="md-readiness-row">
                    <span className="md-readiness-icon">{teamMeetsMin && teamMeetsMax ? '✅' : teamMeetsMax && !teamMeetsMin ? '⚠️' : '❌'}</span>
                    <span className="md-readiness-name">Team Size</span>
                    <span className="md-readiness-val">{selectedEntities.length}/{teamMax}</span>
                  </div>
                  <div className="md-readiness-row">
                    <span className="md-readiness-icon">{canAffordMission ? '✅' : '❌'}</span>
                    <span className="md-readiness-name">Can Afford</span>
                    <span className="md-readiness-val">{canAffordMission ? 'Yes' : 'No'}</span>
                  </div>
                  {keeperLvl > 0 && (
                    <div className="md-readiness-row">
                      <span className="md-readiness-icon">🛡️</span>
                      <span className="md-readiness-name">Keeper Lv</span>
                      <span className="md-readiness-val">{keeperLvl}+</span>
                    </div>
                  )}
                  <div className="md-readiness-row">
                    <span className="md-readiness-icon">{successChance >= 70 ? '✅' : successChance >= 40 ? '⚠️' : '❌'}</span>
                    <span className="md-readiness-name">Power Ratio</span>
                    <span className="md-readiness-val" style={{ color: successColor }}>
                      {successChance >= 70 ? 'Good' : successChance >= 40 ? 'Marginal' : 'Low'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {showEntityPicker && (
              <div ref={entityPickerRef} className="md-entity-picker">
                <h4 className="md-picker-label">Select an Entity</h4>
                <EntityList
                  entities={idleEntities}
                  mode="picker"
                  useCase="mission"
                  selectedIds={selectedEntities.filter((_id, i) => i !== activeSlotIndex)}
                  disabledIds={selectedEntities.filter((_id, i) => i !== activeSlotIndex)}
                  activeId={activeSlotIndex !== null ? selectedEntities[activeSlotIndex] : null}
                  onSelect={(entity) => selectEntityForSlot(entity.id)}
                  emptyMessage="No idle entities."
                />
              </div>
            )}

            <div className="md-two-col">
              <div className="md-panel">
                <div className="md-panel-title">Requirements</div>
                <div className="md-req-list">
                  {reqStatus.length > 0
                    ? reqStatus.map((r, i) => {
                        const isTrait = r.type === 'trait';
                        const state: 'met' | 'warn' | 'fail' = r.met ? 'met' : isTrait ? 'warn' : 'fail';
                        const icon = state === 'met' ? '✅' : state === 'warn' ? '⚠️' : '❌';
                        const cls = `md-req-row ${state === 'met' ? 'md-req-met' : state === 'warn' ? 'md-req-warn' : 'md-req-fail'}`;
                        return (
                          <div key={i} className={cls}>
                            <span className="md-req-icon">{icon}</span>
                            <span className="md-req-name">{r.label || r.type}</span>
                          </div>
                        );
                      })
                    : (
                      <>
                        {teamMin > 1 && (
                          <div className="md-req-row md-req-neutral">
                            <span className="md-req-icon">👥</span>
                            <span className="md-req-name">Team: {teamMin}–{teamMax} entities</span>
                          </div>
                        )}
                        {keeperLvl > 0 && (
                          <div className="md-req-row md-req-neutral">
                            <span className="md-req-icon">🛡️</span>
                            <span className="md-req-name">Keeper Lv {keeperLvl}+</span>
                          </div>
                        )}
                        {teamMin <= 1 && keeperLvl === 0 && (
                          <span className="md-panel-empty">No special requirements</span>
                        )}
                      </>
                    )
                  }
                </div>
              </div>

              <div className="md-panel">
                <div className="md-panel-title">Mission Details</div>
                <div className="md-details-list">
                  <div className="md-detail-row">
                    <span className="md-detail-lbl">Category</span>
                    <span className="md-detail-val">{currentCat.name}</span>
                  </div>
                  <div className="md-detail-row">
                    <span className="md-detail-lbl">Difficulty</span>
                    <span className="md-detail-val" style={{ color: diffInfo.color }}>{diffInfo.tier} · {difficulty}</span>
                  </div>
                  <div className="md-detail-row">
                    <span className="md-detail-lbl">Duration</span>
                    <span className="md-detail-val">{formatDuration(duration)}</span>
                  </div>
                  <div className="md-detail-row">
                    <span className="md-detail-lbl">Team Size</span>
                    <span className="md-detail-val">{teamMin === teamMax ? teamMax : `${teamMin}–${teamMax}`}</span>
                  </div>
                  {missionCost.length > 0 && (
                    <div className="md-detail-row">
                      <span className="md-detail-lbl">Cost</span>
                      <span className="md-detail-val">
                        <div className="md-cost-entries">
                          {missionCost.map((entry, i) => {
                            const have = getHaveForEntry(entry);
                            const canAffordEntry = have >= entry.amount;
                            return (
                              <span key={i} className={`md-cost-entry ${canAffordEntry ? '' : 'md-cost-unaffordable'}`}>
                                <GameIcon src={entry.id} size={13} />
                                <span>{entry.amount.toLocaleString()}</span>
                              </span>
                            );
                          })}
                        </div>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && <div className="mp-error" style={{ marginTop: 4 }}>{error}</div>}
          </div>

          <div className="md-launch-bar md-launch-bar--two">
            {idleEntities.length === 0 && selectedEntities.length === 0 ? (
              <div className="md-launch-unavailable">No entities available</div>
            ) : (
              <>
                <button
                  className="md-auto-btn"
                  onClick={handleAutoAssign}
                  disabled={idleEntities.length === 0}
                >
                  <span className="md-btn-main">AUTO BUILD TEAM</span>
                  <span className="md-btn-sub">Find the best team</span>
                </button>
                {selectedEntities.length > 0 && (
                  <button
                    className="md-start-btn"
                    disabled={!canStart}
                    onClick={handleStart}
                  >
                    <span className="md-btn-main">START MISSION ⚡</span>
                    <span className="md-btn-sub">{costSubtitle}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="missions-page page-transition-wrapper">
      {error && <div className="mp-error">{error}</div>}

      {renderSlots()}

      <div className="missions-wrapper-card">
        <div className="mp-categories">
        {visibleCategories.map((cat) => {
          const display = cat.display;
          const { vars, titleStyle } = displayCssVars(display);
          const unavailable = cat.locked || !cat.enabled;
          const inlineMissions = getInlineMissions(cat.id);
          const navigable = !cat.inlineOnly;
          return (
            <div
              key={cat.id}
              className={`mp-mission-card ${cat.locked ? 'mp-locked' : ''} ${!cat.enabled ? 'mp-disabled' : ''} ${cat.inlineOnly ? 'mp-inline-only' : ''}`}
              style={{
                backgroundColor: display.cardBackground || DEFAULT_DISPLAY.cardBackground,
                '--card-bg-image': bgImageCss(display.backgroundImage),
                borderColor: display.borderColor,
                cursor: navigable && !unavailable ? undefined : 'default',
                ...vars,
              } as React.CSSProperties}
              onClick={() => navigable && !unavailable && pushCategory(cat.id)}
            >
              <div className="mp-card-content">
                <div className="mp-card-header">
                  <h3 className="mp-card-title" style={titleStyle}>{cat.name}</h3>
                  {cat.hasChildren && navigable && <span className="mp-cat-chevron">›</span>}
                </div>
                {cat.tags.length > 0 && renderTags(cat.tags)}
                {cat.locked && (
                  <div className="mp-lock-reason">🔒 Requirements not met</div>
                )}
                {!cat.enabled && !cat.locked && (
                  <div className="mp-disabled-reason">🚫 Currently Unavailable</div>
                )}
                {!unavailable && inlineMissions.length > 0 && (
                  <div className="mp-inline-missions" onClick={e => e.stopPropagation()}>
                    {inlineMissions.map((def: any) => {
                      const inlineCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(def.cost) ? def.cost : [];
                      const canAffordInline = inlineCost.every(entry => {
                        const have = entry.type === 'currency'
                          ? (currencyBalances[entry.id] ?? 0)
                          : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id).reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
                        return have >= entry.amount;
                      });
                      return (
                        <button
                          key={def.id}
                          className={`mp-inline-pill${!canAffordInline ? ' mp-inline-pill--unaffordable' : ''}`}
                          disabled={!canAffordInline}
                          title={!canAffordInline ? "Can't afford this mission" : undefined}
                          onClick={() => handleSelectInlineMission(cat.id, def.id)}
                        >{getInlineLabel(def)}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {renderActivity()}
    </div>
  );
}
