import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import ItemQty from '../../../components/ItemQty';
import { useAppSelector } from '../../../store';
import { useSyncEntities } from '../../../hooks/useSyncSelectors';
import { useCommand } from '../../../hooks/useCommand';
import { useModal } from '../../../context/ModalContext';
import { useJobPreview } from '../../jobs/useJobPreview';
import { audioEngine } from '../../../services/AudioEngine';
import { api } from '../../../services/api';
import { extractTeamSizeBounds, formatDuration } from './missionUtils';
import { ContentDocumentRenderer } from '../../content-document/ContentDocumentRenderer';
import { Badge } from '../../../components/ui';
import { getDifficultyDisplay } from '@derp/shared';

export interface MissionBuilderProps {
  defId?: string;
  selectedDef?: any;
  currentCat?: any;
  missionCategoryDefs?: any[];
  entities?: any[];
  idleEntities?: any[];
  initialSelectedEntities?: string[];
  currencyBalances?: Record<string, number>;
  inventoryItems?: Record<string, any>;
  error?: string;
  onBack?: () => void;
  onMissionStarted?: () => void;
}

export function MissionBuilder(props: MissionBuilderProps) {
  const { execute } = useCommand();
  return <MissionBuilderSession key={props.defId ?? props.selectedDef?.id ?? ''} {...props} execute={execute} />;
}

function MissionBuilderSession(props: MissionBuilderProps & { execute: ReturnType<typeof useCommand>['execute'] }) {
  const { onMissionStarted, execute, onBack: leavePlanning } = props;
  // A fresh instance per selected mission also protects A → B → A. Back
  // invalidates synchronously, even when the parent has not unmounted yet.
  const active = useRef(true);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const onBack = useMemo(() => leavePlanning ? () => {
    active.current = false;
    leavePlanning();
  } : undefined, [leavePlanning]);
  const { pushModal } = useModal();

  const storeEntities = useSyncEntities();
  const storeMissionDefs = useAppSelector((s) => s.game.missionDefs);
  const storeMissionCategoryDefs = useAppSelector((s) => s.game.missionCategoryDefs);
  const storeCurrencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const storeInventoryItems = useAppSelector((s) => s.sync.items);

  const propsDefId = props.defId ?? props.selectedDef?.id;
  const rawActiveDef = propsDefId
    ? storeMissionDefs.find((d: any) => d.id === propsDefId) ?? props.selectedDef ?? null
    : props.selectedDef ?? null;

  const [selectedEntities, setSelectedEntities] = useState<string[]>(props.initialSelectedEntities ?? []);
  const [planningError, setPlanningError] = useState(props.error ?? '');
  const leadInShownRef = useRef(false);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const syncStatus = useAppSelector(s => s.sync.status);
  const player = useAppSelector(s => s.sync.player);

  const hasLeadIn = !!rawActiveDef?.leadInModalDefId;

  const openLeadIn = useCallback(async () => {
    if (!rawActiveDef) return;
    try {
      const spec = await api.getMissionLeadIn(rawActiveDef.id);
      if (active.current && spec?.version === 1) pushModal(spec);
    } catch (err) {
      console.error('[MissionBuilder] Failed to fetch lead-in modal:', err);
    }
  }, [rawActiveDef, pushModal]);

  useEffect(() => {
    if (!hasLeadIn || !rawActiveDef || leadInShownRef.current) return;
    const sessionKey = `lead-in-shown:${rawActiveDef.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    leadInShownRef.current = true;
    sessionStorage.setItem(sessionKey, '1');
    openLeadIn();
  }, [hasLeadIn, rawActiveDef, openLeadIn]);

  const entities = props.entities ?? storeEntities;
  const idleEntities = useMemo(() => props.idleEntities ?? entities.filter((e: any) => e.status === 'idle'), [props.idleEntities, entities]);
  const currencyBalances = props.currencyBalances ?? storeCurrencyBalances;
  const inventoryItems = props.inventoryItems ?? storeInventoryItems;
  const missionCategoryDefs = props.missionCategoryDefs ?? storeMissionCategoryDefs;
  const currentCat =
    props.currentCat ??
    missionCategoryDefs.find((c: any) => c.id === rawActiveDef?.missionCategoryDefId) ??
    null;

  const availableIds = new Set(idleEntities.map((e: any) => e.id));
  const teamAvailable = selectedEntities.every(id => availableIds.has(id));
  useEffect(() => {
    if (syncStatus !== 'connected') return;
    setSelectedEntities(previous => {
      const next = previous.filter(id => idleEntities.some((e: any) => e.id === id));
      return next.length === previous.length ? previous : next;
    });
  }, [idleEntities, syncStatus]);
  const previewRevision = JSON.stringify({
    definition: rawActiveDef, entities, currencyBalances, inventoryItems, player,
    syncStatus, previewAttempt,
  });
  const { preview, loading: previewLoading, error: previewError } = useJobPreview({
    jobType: 'mission',
    defId: rawActiveDef ? rawActiveDef.id : '',
    entityIds: selectedEntities,
    revision: previewRevision,
  });

  const difficulty = preview?.mission?.difficulty ?? rawActiveDef?.difficulty ?? 100;
  const missionPower = preview?.mission?.missionPower ?? 0;
  const successChance = preview?.mission?.successChance ?? 0;
  const injuryChance = preview?.mission?.injuryChance ?? 0;
  const injuryRate = rawActiveDef?.injuryRate ?? 0;
  const liveSynergy = preview?.mission?.synergy ?? null;
  const powerRatio = missionPower > 0 ? Math.min(1, missionPower / (missionPower + difficulty)) : 0;

  const localBounds = rawActiveDef ? extractTeamSizeBounds(rawActiveDef.requirements) : { min: 1, max: 4 };
  const teamMin = preview?.mission?.teamMin ?? localBounds.min;
  const teamMax = preview?.mission?.teamMax ?? localBounds.max;

  const missionCost: Array<{ type: string; id: string; amount: number }> = useMemo(
    () => Array.isArray(rawActiveDef?.cost) ? rawActiveDef.cost : [], [rawActiveDef],
  );
  const canAffordMission = preview?.canAfford === true;
  const canStart = !!(
    syncStatus === 'connected' && !starting && !previewLoading && !previewError && preview &&
    teamAvailable && selectedEntities.length > 0 &&
    selectedEntities.length >= teamMin && selectedEntities.length <= teamMax &&
    preview.allRequirementsMet && canAffordMission
  );


  const spdTimerMultiplier = preview?.mission?.spdTimerMultiplier ?? 1;
  const spdBonusPct = spdTimerMultiplier < 1 ? Math.round((1 - spdTimerMultiplier) * 100) : 0;

  const handleAutoAssign = () => {
    const auto = idleEntities.slice(0, teamMax).map((e: any) => e.id);
    setSelectedEntities(auto);
  };

  const toggleEntity = useCallback((entityId: string) => {
    setSelectedEntities((prev) => {
      if (prev.includes(entityId)) return prev.filter((id) => id !== entityId);
      if (prev.length >= teamMax) return prev;
      return [...prev, entityId];
    });
  }, [teamMax]);

  const handleStart = async () => {
    if (!active.current || !rawActiveDef || !canStart || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setPlanningError('');
    try {
      const res = await execute('StartMission', { defId: rawActiveDef.id, entityIds: selectedEntities });
      // execute applies authoritative patches regardless of this view's lifetime.
      if (!active.current) return;
      audioEngine.play('sfx.mission.start');
      const newJobPatch = (res?.patches ?? []).find(
        (p: any) => p.op === 'upsert' && p.entity === 'job' && p.data?.defId === rawActiveDef.id,
      );
      if (newJobPatch) {
        try {
          const spec = await api.getModalSpec({ jobId: newJobPatch.id });
          if (!active.current) return;
          if (spec?.version === 1) pushModal(spec);
        } catch (err) {
          console.error('[MissionBuilder] Failed to open mission modal:', err);
        }
      }
      if (active.current) onMissionStarted?.();
    } catch (e: any) {
      if (!active.current) return;
      audioEngine.play('ui.error');
      setPlanningError(e.message || 'Failed to start mission');
      setPreviewAttempt(n => n + 1);
    } finally {
      startingRef.current = false;
      if (active.current) setStarting(false);
    }
  };

  const blockData: Record<string, any> = useMemo(() => ({
    scrollOwner: 'surface',
    def: rawActiveDef,
    currentCat,
    missionCategoryDefs,
    onBack,
    missionPower,
    difficulty,
    successChance,
    injuryChance,
    injuryRate,
    powerRatio,
    synergy: liveSynergy,
    statsLoading: previewLoading && !preview,
    previewRequirements: preview?.requirements ?? [],
    previewLoading,
    missionCost,
    entities,
    selectedEntities,
    teamMax,
    onToggle: toggleEntity,
    rewards: (preview as any)?.rewards ?? [],
    hasLeadIn,
    openLeadIn,
    spdBonusPct,
  }), [
    rawActiveDef, currentCat, missionCategoryDefs, onBack, missionPower, difficulty,
    successChance, injuryChance, injuryRate, powerRatio, liveSynergy, previewLoading,
    preview, missionCost, entities, selectedEntities, teamMax,
    hasLeadIn, openLeadIn, spdBonusPct, toggleEntity,
  ]);

  if (!rawActiveDef || !currentCat) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center">
        <p className="text-text-secondary text-[13px]">Loading mission…</p>
      </div>
    );
  }

  const rawMissionDuration = rawActiveDef?.timer?.duration ?? 0;
  const missionDuration = spdTimerMultiplier < 1
    ? Math.max(1, Math.round(rawMissionDuration * spdTimerMultiplier))
    : rawMissionDuration;
  const diffInfo = getDifficultyDisplay(difficulty);

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden motion-safe:animate-[detail-enter_0.28s_ease-out_both]"
    >
      <div
        className="mission-surface overflow-y-auto touch-pan-y rounded-2xl border flex flex-col relative flex-1 min-h-0" data-scroll-owner="mission"
        style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)' }}
      >
        {/* Sticky header */}
        <div className="flex-shrink-0 flex flex-col gap-1 px-3 pt-2 pb-2 border-b border-[rgba(139,92,246,0.18)]" style={{ background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)' }}>
          {/* Row 1: Back + Title */}
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="flex-shrink-0 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/15 text-white text-[12px] font-bold hover:bg-white/10 cursor-pointer"
              >
                ← Back
              </button>
            )}
            <span className="flex-1 min-w-0 font-cinzel text-[14px] font-extrabold tracking-wide text-white leading-tight">
              {rawActiveDef.name}
            </span>
          </div>
          {/* Row 2: Badges */}
          <div className="flex items-center gap-1 flex-wrap pl-0.5">
            <Badge tone="info" className="!border-[rgba(168,85,247,0.4)] !bg-[rgba(168,85,247,0.3)] !text-[#C084FC] !text-[9px]">{diffInfo.tier}</Badge>
            <Badge tone="neutral" className="!border-transparent !text-white !text-[9px]" style={{ background: diffInfo.color }}>{diffInfo.label}</Badge>
            {rawMissionDuration > 0 && (
              <Badge tone="neutral" className="!bg-[rgba(0,0,0,0.35)] !text-white/80 !border-white/10 !text-[9px]">⏱ {formatDuration(missionDuration)}</Badge>
            )}
            {spdBonusPct > 0 && (
              <Badge tone="success" className="!bg-[rgba(52,211,153,0.15)] !border-[rgba(52,211,153,0.35)] !text-[#34d399] !text-[9px]">⚡ Speed -{spdBonusPct}%</Badge>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 [overflow-anchor:none]">
          <ContentDocumentRenderer
            documentId="mission_planning_document"
            baseContext={{ missionMode: 'planning', teamMode: 'editable', rewardMode: 'preview' }}
            data={blockData}
            className="flex flex-col"
          />
        </div>

        <div className="flex flex-col flex-shrink-0">
          <div role="status" aria-live="polite" className="px-3 text-xs text-text-secondary">
            {syncStatus !== 'connected' ? 'Reconnecting — waiting for current game state.' : previewLoading ? 'Checking mission requirements…' : ''}
          </div>
          {previewError && <div role="alert" className="px-3 text-xs text-red-300">
            {previewError} <button onClick={() => setPreviewAttempt(n => n + 1)}>Retry preview</button>
          </div>}
          {planningError && (
            <div className="px-3 pt-2 mx-3">
              <div role="alert" className="px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-xs">
                {planningError}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 p-2 border-t border-[rgba(139,92,246,0.18)]" style={{ background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)' }}>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleAutoAssign}
                disabled={starting || idleEntities.length === 0}
                className="px-3 py-2 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
              >
                AUTO BUILD TEAM
              </button>
              <button
                disabled={!canStart}
                onClick={handleStart}
                className="flex flex-col items-center justify-center px-3 py-2 rounded-xl text-white border border-[rgba(167,139,250,0.55)] bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <span className="text-[13px] font-extrabold tracking-wide uppercase leading-tight">
                  {starting ? 'STARTING…' : 'START MISSION ⚡'}
                </span>
                <span className="flex items-center gap-1.5 mt-0.5">
                  {missionDuration > 0 && (
                    <span className="text-[10px] font-semibold opacity-60">
                      ⏱ {formatDuration(missionDuration)}
                    </span>
                  )}
                  {missionCost.length > 0 && (
                    <span
                      className={`flex items-center gap-1 ${canAffordMission ? 'opacity-75' : 'opacity-90 [filter:hue-rotate(-30deg)_saturate(2)_brightness(0.9)]'}`}
                    >
                      {missionCost.map((c, i) => (
                        <ItemQty key={i} src={c.id} amount={c.amount} size={11} />
                      ))}
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
