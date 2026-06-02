import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  const { onBack, onMissionStarted } = props;
  const { execute } = useCommand();
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

  const hasLeadIn = !!rawActiveDef?.leadInModalDefId;

  const openLeadIn = useCallback(async () => {
    if (!rawActiveDef) return;
    try {
      const spec = await api.getMissionLeadIn(rawActiveDef.id);
      if (spec?.version === 1) pushModal(spec);
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
  const idleEntities = props.idleEntities ?? entities.filter((e: any) => e.status === 'idle');
  const currencyBalances = props.currencyBalances ?? storeCurrencyBalances;
  const inventoryItems = props.inventoryItems ?? storeInventoryItems;
  const missionCategoryDefs = props.missionCategoryDefs ?? storeMissionCategoryDefs;
  const currentCat =
    props.currentCat ??
    missionCategoryDefs.find((c: any) => c.id === rawActiveDef?.missionCategoryDefId) ??
    null;

  const { preview, loading: previewLoading } = useJobPreview({
    jobType: 'mission',
    defId: rawActiveDef ? rawActiveDef.id : '',
    entityIds: selectedEntities,
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

  const missionCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(rawActiveDef?.cost)
    ? rawActiveDef.cost
    : [];
  const getHaveForEntry = (entry: { type: string; id: string }) =>
    entry.type === 'currency'
      ? (currencyBalances[entry.id] ?? 0)
      : Object.values(inventoryItems)
          .filter((it: any) => it.definitionId === entry.id)
          .reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
  const canAffordMission = preview != null
    ? (preview.canAfford ?? true)
    : missionCost.every((e) => getHaveForEntry(e) >= e.amount);
  const allReqsMet = preview != null ? (preview.allRequirementsMet ?? false) : true;
  const canStart = !!(
    selectedEntities.length > 0 &&
    selectedEntities.length >= teamMin &&
    selectedEntities.length <= teamMax &&
    allReqsMet &&
    canAffordMission
  );

  const previewRequirements = preview?.requirements ?? [];

  const handleAutoAssign = () => {
    const auto = idleEntities.slice(0, teamMax).map((e: any) => e.id);
    setSelectedEntities(auto);
  };

  const toggleEntity = (entityId: string) => {
    setSelectedEntities((prev) => {
      if (prev.includes(entityId)) return prev.filter((id) => id !== entityId);
      if (prev.length >= teamMax) return prev;
      return [...prev, entityId];
    });
  };

  const handleStart = async () => {
    if (!rawActiveDef) return;
    setPlanningError('');
    try {
      const res = await execute('StartMission', { defId: rawActiveDef.id, entityIds: selectedEntities });
      audioEngine.play('sfx.mission.start');
      const newJobPatch = (res?.patches ?? []).find(
        (p: any) => p.op === 'upsert' && p.entity === 'job' && p.data?.defId === rawActiveDef.id,
      );
      if (newJobPatch) {
        try {
          const spec = await api.getModalSpec({ jobId: newJobPatch.id });
          if (spec?.version === 1) pushModal(spec);
        } catch (err) {
          console.error('[MissionBuilder] Failed to open mission modal:', err);
        }
      }
      onMissionStarted?.();
    } catch (e: any) {
      audioEngine.play('ui.error');
      setPlanningError(e.message || 'Failed to start mission');
    }
  };

  const blockData: Record<string, any> = useMemo(() => ({
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
    previewRequirements,
    previewLoading,
    entities,
    selectedEntities,
    teamMax,
    onToggle: toggleEntity,
    rewards: (preview as any)?.rewards ?? [],
    hasLeadIn,
    openLeadIn,
  }), [
    rawActiveDef, currentCat, missionCategoryDefs, onBack, missionPower, difficulty,
    successChance, injuryChance, injuryRate, powerRatio, liveSynergy, previewLoading,
    preview, previewRequirements, entities, selectedEntities, teamMax, hasLeadIn, openLeadIn,
  ]);

  if (!rawActiveDef || !currentCat) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center">
        <p className="text-text-secondary text-[13px]">Loading mission…</p>
      </div>
    );
  }

  const missionDuration = rawActiveDef?.timer?.duration ?? 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 pt-2 motion-safe:animate-[detail-enter_0.28s_ease-out_both]">
      <div
        className="overflow-hidden rounded-2xl border flex flex-col relative flex-1 min-h-0"
        style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'linear-gradient(160deg,#1a1640 0%,#221a50 100%)' }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ContentDocumentRenderer
            documentId="mission_planning_document"
            baseContext={{ missionMode: 'planning', teamMode: 'editable', rewardMode: 'preview' }}
            data={blockData}
            className="flex flex-col gap-3 px-4 pt-3 pb-4"
          />
        </div>

        <div className="flex flex-col">
          {planningError && (
            <div className="px-3 pt-2 mx-3">
              <div className="px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-xs">
                {planningError}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 p-2 border-t border-[rgba(139,92,246,0.18)] bg-black/20">
            <div className="grid grid-cols-2 gap-2">
              {idleEntities.length === 0 && selectedEntities.length === 0 ? (
                <div className="col-span-2 text-center text-[13px] font-bold text-text-secondary py-1">
                  No entities available
                </div>
              ) : (
                <>
                  <button
                    onClick={handleAutoAssign}
                    disabled={idleEntities.length === 0}
                    className="px-3 py-2 rounded-xl text-white border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[13px] font-extrabold tracking-wide uppercase"
                  >
                    AUTO BUILD TEAM
                  </button>
                  {selectedEntities.length > 0 && (
                    <button
                      disabled={!canStart}
                      onClick={handleStart}
                      className="flex flex-col items-center justify-center px-3 py-2 rounded-xl text-white border border-[rgba(167,139,250,0.55)] bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="text-[13px] font-extrabold tracking-wide uppercase leading-tight">
                        START MISSION ⚡
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
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
