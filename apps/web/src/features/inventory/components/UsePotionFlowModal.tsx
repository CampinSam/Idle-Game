import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppSelector } from '../../../store';
import { useCommand } from '../../../hooks/useCommand';
import { useModal } from '../../../context/ModalContext';
import { audioEngine } from '../../../services/AudioEngine';
import GameIcon from '../../../components/GameIcon';
import { summarizeEffect, summarizeActiveEffect } from '../utils/summarizeEffect';
import type { EffectDefLite } from '../utils/summarizeEffect';

export interface UsePotionFlowModalProps {
  isOpen: boolean;
  potion: any | null;
  targetEntityId?: string | null;
  targetEntityName?: string | null;
  onClose: () => void;
}

type Phase = 'confirm' | 'applying' | 'result' | 'error';

interface ResolvedEffectLine {
  defId: string;
  text: string;
}

function getPotionEffects(potion: any): Array<{ effectDefId: string; targetType?: string }> {
  const cd = potion?.consumableData ?? potion?.definition?.consumableData;
  if (!cd || !Array.isArray(cd.effects)) return [];
  return cd.effects;
}

export default function UsePotionFlowModal({
  isOpen,
  potion,
  targetEntityId,
  targetEntityName,
  onClose,
}: UsePotionFlowModalProps) {
  const effectDefsList = useAppSelector((s) => s.game.effectDefs);
  const activeEffectsTable = useAppSelector((s) => s.sync.activeEffects);
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });

  const effectDefs: Record<string, EffectDefLite> = useMemo(() => {
    const map: Record<string, EffectDefLite> = {};
    for (const d of effectDefsList || []) map[d.id] = d;
    return map;
  }, [effectDefsList]);

  const [phase, setPhase] = useState<Phase>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [appliedActiveIds, setAppliedActiveIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setPhase('confirm');
      setError(null);
      setAppliedActiveIds([]);
    }
  }, [isOpen, potion?.instanceId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'applying') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, phase, onClose]);

  const consumableEffects = useMemo(() => getPotionEffects(potion), [potion]);

  const confirmLines: ResolvedEffectLine[] = useMemo(() => {
    return consumableEffects.map((spec) => {
      const def = effectDefs[spec.effectDefId];
      return {
        defId: spec.effectDefId,
        text: def ? summarizeEffect(def) : `Unknown effect (${spec.effectDefId})`,
      };
    });
  }, [consumableEffects, effectDefs]);

  const resultLines: ResolvedEffectLine[] = useMemo(() => {
    if (phase !== 'result') return [];
    const lines: ResolvedEffectLine[] = [];
    const appliedSet = new Set(appliedActiveIds);
    const seenDefIds = new Set<string>();

    for (const id of appliedActiveIds) {
      const ae = activeEffectsTable[id];
      if (!ae) continue;
      const def = effectDefs[ae.effectDefId] ?? null;
      lines.push({ defId: ae.effectDefId, text: summarizeActiveEffect(ae, def) });
      seenDefIds.add(ae.effectDefId);
    }

    for (const spec of consumableEffects) {
      if (seenDefIds.has(spec.effectDefId)) continue;
      const def = effectDefs[spec.effectDefId];
      if (!def) continue;
      lines.push({ defId: spec.effectDefId, text: summarizeEffect(def) });
    }

    if (lines.length === 0 && appliedSet.size === 0) {
      lines.push({ defId: '_fallback', text: 'Effect applied.' });
    }
    return lines;
  }, [phase, appliedActiveIds, activeEffectsTable, consumableEffects, effectDefs]);

  const potionName: string = potion?.name ?? potion?.definition?.name ?? 'Potion';
  const potionDesc: string | null = potion?.description ?? potion?.definition?.description ?? null;
  const potionIconKey: string | null =
    potion?.iconKey ?? potion?.definition?.iconKey ?? potion?.icon ?? null;

  const handleApply = useCallback(async () => {
    if (!potion || phase === 'applying') return;
    setError(null);
    setPhase('applying');

    const snapshot = new Set(Object.keys(activeEffectsTable));
    const payload: Record<string, any> = { itemInstanceId: potion.instanceId ?? potion.id };
    if (targetEntityId) payload.targetId = targetEntityId;

    try {
      const response = await execute('UseConsumable', payload);
      const newIds: string[] = [];
      for (const p of response.patches || []) {
        if (p.op === 'upsert' && p.entity === 'activeEffect' && p.data?.id) {
          if (!snapshot.has(p.data.id)) newIds.push(p.data.id);
        }
      }
      setAppliedActiveIds(newIds);
      setPhase('result');
    } catch (err: any) {
      console.error('[UsePotionFlowModal] UseConsumable failed:', err);
      audioEngine.play('ui.error');
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Could not use this potion. Please try again.';
      setError(typeof message === 'string' ? message : 'Could not use this potion.');
      setPhase('error');
    }
  }, [potion, phase, activeEffectsTable, targetEntityId, execute]);

  if (!isOpen || !potion) return null;

  const isResultOrError = phase === 'result' || phase === 'error';

  let subtitle: string | null = null;
  if (targetEntityName) subtitle = `to ${targetEntityName}`;
  else if (targetEntityId) subtitle = 'to selected target';

  return (
    <div
      className="modal-overlay"
      onMouseDown={() => phase !== 'applying' && onClose()}
      role="presentation"
    >
      <div
        className="modal-box max-w-[400px]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={phase === 'result' ? 'Potion Result' : 'Use Potion'}
      >
        {phase !== 'applying' && (
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        )}

        <div className="px-6 pt-[22px] pb-[14px] text-center shrink-0 flex flex-col items-center gap-2">
          {potionIconKey && (
            <div className="w-16 h-16 rounded-[14px] bg-purple-500/[0.18] border border-purple-500/30 flex items-center justify-center p-1">
              <GameIcon src={potionIconKey} size={56} />
            </div>
          )}
          <h2 className="text-sm font-extrabold tracking-[1px] m-0 text-slate-400 uppercase [font-family:'Exo_2',system-ui,sans-serif]">
            {phase === 'result' ? 'Potion Used' : phase === 'error' ? 'Potion Failed' : 'Use Potion'}
          </h2>
          <p className="text-lg font-extrabold m-0 text-[#e2e8f0] [font-family:'Exo_2',system-ui,sans-serif]">{potionName}</p>
          {subtitle && <p className="text-xs text-slate-400 m-0">{subtitle}</p>}
        </div>

        <div className="flex-1 min-h-[80px] px-5 pt-2 pb-4 overflow-y-auto">
          {phase === 'confirm' && (
            <>
              {potionDesc && (
                <p className="text-[13px] text-[#cbd5e1] leading-[1.45] mb-[14px] m-0">{potionDesc}</p>
              )}
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-slate-400 mb-1 m-0">
                  Effect{confirmLines.length === 1 ? '' : 's'}
                </p>
                {confirmLines.length === 0 && (
                  <div className="px-3 py-2.5 rounded-[10px] bg-slate-400/[0.08] border border-slate-400/[0.18] text-[13px] font-medium text-slate-400 italic flex justify-between items-center gap-2">
                    No effect details available
                  </div>
                )}
                {confirmLines.map((line, idx) => (
                  <div key={`${line.defId}_${idx}`} className="px-3 py-2.5 rounded-[10px] bg-purple-500/10 border border-purple-500/20 text-[13px] font-semibold text-[#e2e8f0] flex justify-between items-center gap-2">
                    {line.text}
                  </div>
                ))}
              </div>
            </>
          )}

          {phase === 'applying' && (
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-slate-400 text-[13px]">
              <div className="w-8 h-8 rounded-full border-[3px] border-purple-500/20 border-t-[#a78bfa] animate-spin" />
              <p>Applying potion…</p>
            </div>
          )}

          {phase === 'result' && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-slate-400 mb-1 m-0">Applied</p>
              {resultLines.map((line, idx) => (
                <div key={`${line.defId}_${idx}`} className="px-3 py-2.5 rounded-[10px] bg-green-500/[0.12] border border-green-500/35 text-[#bbf7d0] text-[13px] font-semibold flex justify-between items-center gap-2">
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
          )}

          {phase === 'error' && error && (
            <div className="mt-2 px-[14px] py-3 rounded-[10px] bg-red-500/[0.12] border border-red-500/40 text-[#fca5a5] text-[13px] leading-[1.4]" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {phase === 'confirm' && (
            <>
              <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="modal-btn modal-btn--apply" onClick={handleApply}>
                Use Potion
              </button>
            </>
          )}
          {phase === 'applying' && (
            <button type="button" className="modal-btn modal-btn--apply" disabled>
              Applying…
            </button>
          )}
          {isResultOrError && (
            <>
              {phase === 'error' && (
                <button
                  type="button"
                  className="modal-btn modal-btn--cancel"
                  onClick={() => { setError(null); setPhase('confirm'); }}
                >
                  Back
                </button>
              )}
              <button type="button" className="modal-btn modal-btn--apply" onClick={onClose}>
                {phase === 'error' ? 'Close' : 'Done'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
