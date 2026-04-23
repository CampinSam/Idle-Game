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
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../config/images';
import { GameImage } from '../../components/GameImage';
import { getArchetypeDisplay, getDifficultyDisplay, ANTI_WHALE_CAPS } from '@derp/shared';
import GameIcon from '../../components/GameIcon';
import './MissionsPage.css';

const DEFAULT_DISPLAY = { borderColor: '#3B82F6', backgroundImage: '/images/mission-quick.png', cardBackground: '#1a1a2e' };

function resolveDisplay(def: any, categoryDefs: any[]) {
  const missionDisplay = def.display || {};
  const catDef = categoryDefs.find((c: any) => c.id === def.missionCategoryDefId);
  const catDisplay = catDef?.displayDef || {};

  return {
    borderColor: missionDisplay.borderColor || catDisplay.borderColor || DEFAULT_DISPLAY.borderColor,
    backgroundImage: missionDisplay.backgroundImage || catDisplay.backgroundImage || DEFAULT_DISPLAY.backgroundImage,
    cardBackground: missionDisplay.cardBackground || catDisplay.cardBackground || DEFAULT_DISPLAY.cardBackground,
  };
}

function resolveCategoryDisplay(catDef: any) {
  const d = catDef?.displayDef || {};
  return {
    borderColor: d.borderColor || DEFAULT_DISPLAY.borderColor,
    backgroundImage: d.backgroundImage || DEFAULT_DISPLAY.backgroundImage,
    cardBackground: d.cardBackground || DEFAULT_DISPLAY.cardBackground,
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

function getEntityMP(entity: any) {
  const s = entity.stats || {};
  return (s.atk || s.ATK || 0) * 0.40 + (s.def || s.DEF || 0) * 0.30 + (s.spd || s.SPD || 0) * 0.20 + (s.foc || s.FOC || 0) * 0.10 + (s.lck || s.LCK || 0) * 0.05 + (s.vit || s.VIT || 0) * 0.05;
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
      const target = e.target as Node;
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
    const catMap = new Map<string, { id: string; name: string; parentId: string | null; display: any; tags: any[]; sortOrder: number; locked: boolean; enabled: boolean; count: number; hasChildren: boolean }>();

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
      audioEngine.play('ui.button_click');
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
                const unavailable = cat.locked || !cat.enabled;
                const inlineMissions = getInlineMissions(cat.id);
                return (
                  <div
                    key={cat.id}
                    className={`mp-mission-card ${cat.locked ? 'mp-locked' : ''} ${!cat.enabled ? 'mp-disabled' : ''}`}
                    style={{
                      backgroundColor: display.cardBackground || DEFAULT_DISPLAY.cardBackground,
                      '--card-bg-image': `url(${display.backgroundImage})`,
                      borderColor: display.borderColor,
                    } as React.CSSProperties}
                    onClick={() => !unavailable && pushCategory(cat.id)}
                  >
                    <div className="mp-card-content">
                      <div className="mp-card-header">
                        <h3 className="mp-card-title">{cat.name}</h3>
                        {cat.hasChildren && <span className="mp-cat-chevron">›</span>}
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
                    '--card-bg-image': `url(${display.backgroundImage})`,
                    borderColor: display.borderColor,
                  } as React.CSSProperties}
                  onClick={() => !unavailable && handleSelectMission(def.id)}
                >
                  <div className="mp-card-content">
                    <div className="mp-card-header">
                      <h3 className="mp-card-title">{def.name}</h3>
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

    return (
      <div className="missions-page md-inline page-transition-wrapper">
        <div className="md-unified-card" style={{ borderColor: display.borderColor }}>
        <div className="md-hero" style={{ backgroundImage: `url(${display.backgroundImage})` }}>
          <button className="mp-back-pill md-hero-back-pos" onClick={handleBackFromMissionDetail}>← Back</button>
          <div className="md-hero-gradient" />
          <div className="md-hero-content">
            <h1 className="md-title">{selectedDef.name.toUpperCase()}</h1>
            <div className="md-badges">
              <span className="md-badge md-badge-tier">{diffInfo.tier}</span>
              <span className="md-badge md-badge-diff" style={{ background: diffInfo.color }}>{diffInfo.label}</span>
              {missionTags.map((tag: any, i: number) => (
                <span key={i} className="md-badge" style={{ background: tag.color || '#3B82F6' }}>{tag.text}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="md-body">
          <p className="md-description">{selectedDef.description}</p>

          <div className="md-rewards-section">
            <div className="md-section-header">
              <h3 className="md-section-title">Success Rewards</h3>
            </div>
            <div className="md-reward-pills">
              {selectedDef.rewardPreview && selectedDef.rewardPreview.length > 0
                ? selectedDef.rewardPreview.map((line: string, i: number) => (
                    <div key={i} className="md-reward-pill">
                      <span className="md-reward-val">{line}</span>
                    </div>
                  ))
                : <span style={{ opacity: 0.5 }}>None</span>
              }
            </div>
          </div>

          <div className="md-stats-card">
            <div className="md-stats-header">
              <span className="md-stats-label">Mission Difficulty</span>
              <span className="md-stats-mp">{selectedDef.difficulty}</span>
            </div>
            <div className="md-stat-row">
              <span className="md-stat-icon">⚡</span>
              <span className="md-stat-name">Team MP</span>
              <div className="md-stat-bar-wrap">
                <div className="md-stat-bar" style={{
                  width: `${Math.min(100, (teamMP / (teamMP + (selectedDef.difficulty || 1))) * 100)}%`,
                  background: successChance >= 70 ? '#10B981' : successChance >= 40 ? '#F59E0B' : '#EF4444'
                }} />
              </div>
              <span className="md-stat-val">{Math.round(teamMP)}</span>
            </div>
            <div className="md-stat-row">
              <span className="md-stat-icon">⏱</span>
              <span className="md-stat-name">Duration</span>
              <div className="md-stat-bar-wrap">
                <div className="md-stat-bar" style={{ width: '60%', background: '#3B82F6' }} />
              </div>
              <span className="md-stat-val">{selectedDef.timer?.duration >= 60 ? `${Math.round(selectedDef.timer.duration / 60)}m` : `${selectedDef.timer?.duration ?? 0}s`}</span>
            </div>
            <div className="md-stat-row">
              <span className="md-stat-icon">👥</span>
              <span className="md-stat-name">Team Size{getReqValue(selectedDef.requirements, 'team_size', 1, 'gte') > 1 ? ` (min. ${getReqValue(selectedDef.requirements, 'team_size', 1, 'gte')})` : ''}</span>
              <div className="md-stat-bar-wrap">
                <div className="md-stat-bar" style={{
                  width: `${(selectedEntities.length / getReqValue(selectedDef.requirements, 'team_size', 1, 'lte')) * 100}%`,
                  background: selectedEntities.length >= getReqValue(selectedDef.requirements, 'team_size', 1, 'gte') ? '#10B981' : '#A855F7'
                }} />
              </div>
              <span className="md-stat-val">{selectedEntities.length}/{getReqValue(selectedDef.requirements, 'team_size', 1, 'lte')}</span>
            </div>
            {getReqValue(selectedDef.requirements, 'keeper_level') > 0 && (
              <div className="md-stat-row">
                <span className="md-stat-icon">🛡️</span>
                <span className="md-stat-name">Keeper Level</span>
                <div className="md-stat-bar-wrap">
                  <div className="md-stat-bar" style={{ width: '100%', background: '#F59E0B' }} />
                </div>
                <span className="md-stat-val">Lv {getReqValue(selectedDef.requirements, 'keeper_level')}</span>
              </div>
            )}
          </div>

          <div className="md-success-card">
            <span className="md-success-label">Success Chance</span>
            <div className="md-success-bar-wrap">
              <div className="md-success-bar" style={{
                width: `${successChance}%`,
                background: successChance >= 70 ? 'linear-gradient(90deg, #10B981, #34D399)' :
                  successChance >= 40 ? 'linear-gradient(90deg, #F59E0B, #FBBF24)' :
                  'linear-gradient(90deg, #EF4444, #F87171)'
              }} />
            </div>
            <div className="md-success-right">
              <span className="md-success-pct" style={{
                color: successChance >= 70 ? '#10B981' : successChance >= 40 ? '#F59E0B' : '#EF4444'
              }}>{successChance}%</span>
              <button className="md-auto-assign" onClick={() => {
                const auto = idleEntities.slice(0, getReqValue(selectedDef.requirements, 'team_size', 1, 'lte')).map((b: any) => b.id);
                setSelectedEntities(auto);
                setShowEntityPicker(false);
                setActiveSlotIndex(null);
              }}>AUTO ASSIGN →</button>
            </div>
          </div>

          <div className="md-team-section" ref={teamGridRef}>
            <div className="md-team-section-header">
              <span className="md-team-label">SELECT YOUR TEAM</span>
            </div>
            <div className="md-team-grid">
              {selectedEntities.map((entityId, slotIndex) => {
                const entity = entities.find((b: any) => b.id === entityId);
                if (!entity) return null;
                const mp = Math.round(getEntityMP(entity));
                const archetype = (entity as any).traits?.head || 'Dave';
                const isActive = activeSlotIndex === slotIndex;
                return (
                  <div key={entity.id} className={`md-entity-card ${isActive ? 'md-slot-active' : ''}`} onClick={() => openSlot(slotIndex)}>
                    <div className="md-entity-card-top" style={{ background: getArchetypeDisplay(archetype).gradient }}>
                      <div className="md-entity-remove" onClick={(e) => { e.stopPropagation(); removeEntityFromSlot(slotIndex); }}>✕</div>
                      <span className="md-entity-power-badge">⚡{mp}</span>
                      <GameImage
                        src={getEntityImagePath(entity.id, archetype, entity.imageUrl)}
                        category="entities"
                        alt={(entity as any).name}
                        fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
                        className="md-entity-portrait"
                      />
                    </div>
                    <div className="md-entity-card-bot">
                      <span className="md-entity-id">{(entity as any).name}</span>
                      <span className="md-entity-pscore">MP  {mp}</span>
                    </div>
                  </div>
                );
              })}
              {selectedEntities.length < getReqValue(selectedDef.requirements, 'team_size', 1, 'lte') && (
                <div className="md-entity-card md-empty-slot" onClick={() => openSlot(selectedEntities.length)}>
                  <div className="md-entity-card-top md-empty-top">
                    <span className="md-plus-icon">＋</span>
                  </div>
                  <div className="md-entity-card-bot">
                    <span className="md-entity-id">Add Entity</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {showEntityPicker && (
            <div ref={entityPickerRef} className="md-entity-picker">
              <h4 className="md-picker-label">Select an Entity</h4>
              <div className="md-picker-grid">
                {idleEntities.map((entity: any) => {
                  const archetype = entity.traits?.head || 'Dave';
                  const mp = Math.round(getEntityMP(entity));
                  const isInOtherSlot = selectedEntities.includes(entity.id);
                  const isCurrentSlotEntity = activeSlotIndex !== null && selectedEntities[activeSlotIndex] === entity.id;
                  return (
                    <button
                      key={entity.id}
                      className={`md-select-entity ${isInOtherSlot ? 'selected' : ''} ${isCurrentSlotEntity ? 'current' : ''}`}
                      disabled={isInOtherSlot}
                      onClick={() => {
                        if (!isInOtherSlot) {
                          selectEntityForSlot(entity.id);
                        }
                      }}
                    >
                      <div className="md-select-entity-top" style={{ background: getArchetypeDisplay(archetype).gradient }}>
                        <GameImage
                          src={getEntityImagePath(entity.id, archetype, entity.imageUrl)}
                          category="entities"
                          alt={entity.name}
                          fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
                          className="md-sb-portrait"
                        />
                      </div>
                      <div className="md-select-entity-bot">
                        <span className="md-sb-name">{entity.name}</span>
                        <span className="md-sb-mp">⚡{mp}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div className="mp-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        {missionCost.length > 0 && (
          <div className="md-cost-bar">
            <span className="md-cost-label">Cost to Start</span>
            <div className="md-cost-entries">
              {missionCost.map((entry, i) => {
                const have = getHaveForEntry(entry);
                const canAffordEntry = have >= entry.amount;
                return (
                  <span key={i} className={`md-cost-entry ${canAffordEntry ? '' : 'md-cost-unaffordable'}`}>
                    <GameIcon src={entry.id} size={16} />
                    <span>{entry.amount.toLocaleString()}</span>
                    <span className="md-cost-have">({have.toLocaleString()})</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="md-launch-bar">
          {selectedEntities.length === 0 ? (
            idleEntities.length === 0 ? (
              <div className="md-launch-unavailable">No entities available</div>
            ) : (
              <button
                className="md-launch-btn"
                onClick={() => {
                  const auto = idleEntities.slice(0, getReqValue(selectedDef.requirements, 'team_size', 1, 'lte')).map((b: any) => b.id);
                  setSelectedEntities(auto);
                  setShowEntityPicker(false);
                  setActiveSlotIndex(null);
                  setTimeout(() => teamGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                }}
              >
                AUTO-ASSIGN
              </button>
            )
          ) : (
            <button
              className="md-launch-btn"
              disabled={
                selectedEntities.length < getReqValue(selectedDef.requirements, 'team_size', 1, 'gte') ||
                selectedEntities.length > getReqValue(selectedDef.requirements, 'team_size', 1, 'lte') ||
                !canAffordMission
              }
              onClick={handleStart}
            >
              START MISSION
            </button>
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
          const unavailable = cat.locked || !cat.enabled;
          const inlineMissions = getInlineMissions(cat.id);
          return (
            <div
              key={cat.id}
              className={`mp-mission-card ${cat.locked ? 'mp-locked' : ''} ${!cat.enabled ? 'mp-disabled' : ''}`}
              style={{
                backgroundColor: display.cardBackground || DEFAULT_DISPLAY.cardBackground,
                '--card-bg-image': `url(${display.backgroundImage})`,
                borderColor: display.borderColor,
              } as React.CSSProperties}
              onClick={() => !unavailable && pushCategory(cat.id)}
            >
              <div className="mp-card-content">
                <div className="mp-card-header">
                  <h3 className="mp-card-title">{cat.name}</h3>
                  {cat.hasChildren && <span className="mp-cat-chevron">›</span>}
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
