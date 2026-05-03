import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppSelector } from '../../../store';
import { useCommand } from '../../../hooks/useCommand';
import { useModal } from '../../../context/ModalContext';
import { audioEngine } from '../../../services/AudioEngine';
import GameIcon from '../../../components/GameIcon';
import { summarizeEffect, summarizeActiveEffect } from '../utils/summarizeEffect';
import type { EffectDefLite } from '../utils/summarizeEffect';
import './UsePotionFlowModal.css';

export interface UsePotionFlowModalProps {
  isOpen: boolean;
  /** The consumable item (with ...definition spread, like InventoryPage normalises). */
  potion: any | null;
  /** Optional target entity (for entity-targeted potions). */
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

  // Reset whenever opened/closed or potion changes.
  useEffect(() => {
    if (!isOpen) {
      setPhase('confirm');
      setError(null);
      setAppliedActiveIds([]);
    }
  }, [isOpen, potion?.instanceId]);

  // Esc to close (when not mid-apply).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'applying') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, phase, onClose]);

  const consumableEffects = useMemo(() => getPotionEffects(potion), [potion]);

  // Confirm-phase effect lines (built from consumable spec + EffectDefs).
  const confirmLines: ResolvedEffectLine[] = useMemo(() => {
    return consumableEffects.map((spec) => {
      const def = effectDefs[spec.effectDefId];
      return {
        defId: spec.effectDefId,
        text: def ? summarizeEffect(def) : `Unknown effect (${spec.effectDefId})`,
      };
    });
  }, [consumableEffects, effectDefs]);

  // Result-phase effect lines: prefer freshly applied active effects (with real
  // expiresAt), fall back to consumable spec for instant effects.
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

    // Any consumable effects that didn't produce an active effect (i.e. instant
    // effects like XP grants or stat boosts) — render them from the EffectDef.
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

    // Snapshot active effect IDs so we can identify newly added ones afterward.
    const snapshot = new Set(Object.keys(activeEffectsTable));

    const payload: Record<string, any> = { itemInstanceId: potion.instanceId ?? potion.id };
    if (targetEntityId) payload.targetId = targetEntityId;

    try {
      const response = await execute('UseConsumable', payload);
      // Find newly upserted active effects from the response patches so we don't
      // race the redux state.
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

  // Determine target subtitle.
  let subtitle: string | null = null;
  if (targetEntityName) subtitle = `to ${targetEntityName}`;
  else if (targetEntityId) subtitle = 'to selected target';

  return (
    <div
      className="upm-overlay"
      onMouseDown={() => phase !== 'applying' && onClose()}
      role="presentation"
    >
      <div
        className="upm-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={phase === 'result' ? 'Potion Result' : 'Use Potion'}
      >
        {phase !== 'applying' && (
          <button
            className="upm-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        )}

        <div className="upm-header">
          {potionIconKey && (
            <div className="upm-icon-wrap">
              <GameIcon src={potionIconKey} size={56} />
            </div>
          )}
          <h2 className="upm-title">
            {phase === 'result' ? 'Potion Used' : phase === 'error' ? 'Potion Failed' : 'Use Potion'}
          </h2>
          <p className="upm-name">{potionName}</p>
          {subtitle && <p className="upm-subtitle">{subtitle}</p>}
        </div>

        <div className="upm-body">
          {phase === 'confirm' && (
            <>
              {potionDesc && <p className="upm-desc">{potionDesc}</p>}
              <div className="upm-effects">
                <p className="upm-effects-label">Effect{confirmLines.length === 1 ? '' : 's'}</p>
                {confirmLines.length === 0 && (
                  <div className="upm-effect-line upm-effect-line--muted">
                    No effect details available
                  </div>
                )}
                {confirmLines.map((line, idx) => (
                  <div key={`${line.defId}_${idx}`} className="upm-effect-line">
                    {line.text}
                  </div>
                ))}
              </div>
            </>
          )}

          {phase === 'applying' && (
            <div className="upm-applying">
              <div className="upm-spinner" />
              <p>Applying potion…</p>
            </div>
          )}

          {phase === 'result' && (
            <div className="upm-effects">
              <p className="upm-effects-label">Applied</p>
              {resultLines.map((line, idx) => (
                <div key={`${line.defId}_${idx}`} className="upm-effect-line upm-effect-line--success">
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
          )}

          {phase === 'error' && error && (
            <div className="upm-error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="upm-footer">
          {phase === 'confirm' && (
            <>
              <button
                type="button"
                className="upm-btn upm-btn--cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="upm-btn upm-btn--apply"
                onClick={handleApply}
              >
                Use Potion
              </button>
            </>
          )}
          {phase === 'applying' && (
            <button
              type="button"
              className="upm-btn upm-btn--apply"
              disabled
            >
              Applying…
            </button>
          )}
          {isResultOrError && (
            <>
              {phase === 'error' && (
                <button
                  type="button"
                  className="upm-btn upm-btn--cancel"
                  onClick={() => { setError(null); setPhase('confirm'); }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                className="upm-btn upm-btn--apply"
                onClick={onClose}
              >
                {phase === 'error' ? 'Close' : 'Done'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
