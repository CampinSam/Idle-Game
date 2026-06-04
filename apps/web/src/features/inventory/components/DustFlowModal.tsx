import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppSelector } from '../../../store';
import { useCommand } from '../../../hooks/useCommand';
import { useModal } from '../../../context/ModalContext';
import { api } from '../../../services/api';
import GameIcon from '../../../components/GameIcon';
import ItemQty from '../../../components/ItemQty';

export interface DustFlowModalProps {
  isOpen: boolean;
  item: any | null;
  activeJob?: any | null;
  onClose: () => void;
}

type Phase = 'confirm' | 'submitting' | 'skipping' | 'done' | 'error';

const TIERS_IN_ORDER = ['common', 'uncommon', 'scare', 'rare', 'epic', 'mythic', 'legendary'];

function getDustingData(item: any): any | null {
  return item?.dustingData ?? item?.definition?.dustingData ?? null;
}

function getFirstSuccessTier(tiers: Record<string, any>): { tierKey: string; rewards: any[] } | null {
  for (const key of TIERS_IN_ORDER) {
    const block = tiers?.[key];
    if (block && Array.isArray(block.rewards) && block.rewards.length > 0) {
      return { tierKey: key, rewards: block.rewards };
    }
  }
  return null;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'Instantaneous';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function RewardPreviewLine({ reward }: { reward: any }) {
  const itemDefs = useAppSelector((s) => (s.game as any).itemDefs ?? []);
  const currencyDefs = useAppSelector((s) => (s.game as any).currencyDefs ?? []);

  const { iconKey, name, min, max } = useMemo(() => {
    if (reward.type === 'item') {
      const def = itemDefs.find((d: any) => d.id === reward.key);
      return {
        iconKey: def?.iconKey ?? reward.key,
        name: def?.name ?? reward.key,
        min: reward.min ?? 1,
        max: reward.max ?? reward.min ?? 1,
      };
    }
    if (reward.type === 'currency') {
      const def = currencyDefs.find((d: any) => d.id === reward.key);
      return {
        iconKey: def?.iconKey ?? reward.key,
        name: def?.name ?? reward.key,
        min: reward.min ?? 1,
        max: reward.max ?? reward.min ?? 1,
      };
    }
    return { iconKey: null, name: reward.type, min: 1, max: 1 };
  }, [reward, itemDefs, currencyDefs]);

  const amountStr = min === max ? String(min) : `${min}–${max}`;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-purple-500/10 border border-purple-500/20">
      {iconKey && <GameIcon src={iconKey} size={20} />}
      <span className="text-[13px] font-semibold text-[#e2e8f0]">{amountStr}× {name}</span>
      {reward.odds != null && reward.odds < 100 && (
        <span className="ml-auto text-[11px] text-slate-400">{reward.odds}%</span>
      )}
    </div>
  );
}

function SkipCostDisplay({ skipCost }: { skipCost: { type: string; id: string; amount: number } }) {
  const currencyDefs = useAppSelector((s) => (s.game as any).currencyDefs ?? []);
  const itemDefs = useAppSelector((s) => (s.game as any).itemDefs ?? []);

  const { iconKey, name } = useMemo(() => {
    if (skipCost.type === 'currency') {
      const def = currencyDefs.find((d: any) => d.id === skipCost.id);
      return { iconKey: def?.iconKey ?? skipCost.id, name: def?.name ?? skipCost.id };
    }
    if (skipCost.type === 'item') {
      const def = itemDefs.find((d: any) => d.id === skipCost.id);
      return { iconKey: def?.iconKey ?? skipCost.id, name: def?.name ?? skipCost.id };
    }
    return { iconKey: skipCost.id, name: skipCost.id };
  }, [skipCost, currencyDefs, itemDefs]);

  return (
    <div className="flex items-center gap-1.5">
      <ItemQty src={iconKey} amount={skipCost.amount} size={14} />
      <span className="text-[12px] text-slate-300">{name}</span>
    </div>
  );
}

export default function DustFlowModal({ isOpen, item, activeJob, onClose }: DustFlowModalProps) {
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });

  const [phase, setPhase] = useState<Phase>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [instantRewards, setInstantRewards] = useState<any[] | null>(null);

  const dustingData = useMemo(() => getDustingData(item), [item]);

  const maxQty: number = item?.quantity ?? item?.definition?.quantity ?? 1;
  const isStackable: boolean = item?.stackable ?? item?.definition?.stackable ?? false;

  const timerCfg = dustingData?.timer ?? null;
  const timerScaling: string = dustingData?.timerScaling ?? 'flat';
  const isInstant: boolean = dustingData?.instant === true;
  const baseDuration: number = isInstant ? 0 : (timerCfg?.duration ?? 0);
  const totalDuration: number = (timerScaling === 'per_unit' && !isInstant)
    ? baseDuration * quantity
    : baseDuration;

  const firstSuccessTier = useMemo(() => {
    if (!dustingData?.tiers) return null;
    return getFirstSuccessTier(dustingData.tiers);
  }, [dustingData]);

  const skipCostEntries: Array<{ type: string; id: string; amount: number }> =
    Array.isArray(timerCfg?.skip_cost) ? timerCfg.skip_cost : [];
  const canSkip = !!activeJob && !!timerCfg?.skipable && skipCostEntries.length > 0;
  const primarySkipCost = skipCostEntries[0] ?? null;

  useEffect(() => {
    if (!isOpen) {
      setPhase('confirm');
      setError(null);
      setQuantity(1);
      setInstantRewards(null);
    }
  }, [isOpen, item?.instanceId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'submitting' && phase !== 'skipping') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, phase, onClose]);

  const handleConfirm = useCallback(async () => {
    if (!item || phase === 'submitting') return;
    setError(null);
    setPhase('submitting');
    try {
      const response = await execute('StartDusting', {
        itemInstanceId: item.instanceId ?? item.id,
        quantity,
      });
      const meta = (response as any)?.meta;
      if (meta?.instantRewards) {
        setInstantRewards(meta.instantRewards);
        setPhase('done');
      } else {
        onClose();
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Could not start dusting. Please try again.';
      setError(typeof message === 'string' ? message : 'Could not start dusting.');
      setPhase('error');
    }
  }, [item, phase, quantity, execute, onClose]);

  const handleSkip = useCallback(async () => {
    if (!activeJob || phase === 'skipping') return;
    setError(null);
    setPhase('skipping');
    try {
      await api.skipJob(activeJob.id);
      onClose();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Could not skip dusting. Please try again.';
      setError(typeof message === 'string' ? message : 'Could not skip dusting.');
      setPhase('error');
    }
  }, [activeJob, phase, onClose]);

  if (!isOpen || !item || !dustingData) return null;

  const itemName: string = item.name ?? item.definition?.name ?? 'Item';
  const itemIcon: string | null = item.iconKey ?? item.definition?.iconKey ?? null;
  const isResultOrError = phase === 'done' || phase === 'error';
  const isBusy = phase === 'submitting' || phase === 'skipping';

  return (
    <div
      className="modal-overlay"
      onMouseDown={() => !isBusy && onClose()}
      role="presentation"
    >
      <div
        className="modal-box max-w-[420px]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={phase === 'done' ? 'Dusting Started' : 'Dust Item'}
      >
        {!isBusy && (
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        )}

        <div className="px-6 pt-[22px] pb-[14px] text-center shrink-0 flex flex-col items-center gap-2">
          {itemIcon && (
            <div className="w-16 h-16 rounded-[14px] bg-orange-500/[0.18] border border-orange-500/30 flex items-center justify-center p-1">
              <GameIcon src={itemIcon} size={56} />
            </div>
          )}
          <h2 className="text-sm font-extrabold tracking-[1px] m-0 text-slate-400 uppercase [font-family:'Exo_2',system-ui,sans-serif]">
            {phase === 'done' ? (isInstant ? 'Dusted!' : 'Dusting Started') : phase === 'error' ? 'Dusting Failed' : 'Dust Item'}
          </h2>
          <p className="text-lg font-extrabold m-0 text-[#e2e8f0] [font-family:'Exo_2',system-ui,sans-serif]">{itemName}</p>
        </div>

        <div className="flex-1 min-h-0 px-5 pt-1 pb-4 overflow-y-auto">
          {phase === 'confirm' && (
            <div className="flex flex-col gap-3">
              {canSkip && (
                <div className="flex flex-col gap-1.5 px-3 py-3 rounded-[10px] bg-amber-500/[0.10] border border-amber-500/30">
                  <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-amber-400 m-0">Active Job</p>
                  <p className="text-[12px] text-slate-300 m-0">
                    A dusting job is in progress. Pay to finish it instantly.
                  </p>
                  {primarySkipCost && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400">Skip cost:</span>
                      <SkipCostDisplay skipCost={primarySkipCost} />
                    </div>
                  )}
                </div>
              )}

              {!canSkip && (
                <>
                  {isStackable && maxQty > 1 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-slate-400 m-0">Quantity</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="w-8 h-8 rounded-lg bg-slate-700/50 border border-slate-600/50 text-slate-300 text-lg font-bold flex items-center justify-center hover:bg-slate-600/50 transition-colors"
                          onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        >−</button>
                        <input
                          type="number"
                          min={1}
                          max={maxQty}
                          value={quantity}
                          onChange={(e) => {
                            const v = Math.min(maxQty, Math.max(1, Math.floor(Number(e.target.value) || 1)));
                            setQuantity(v);
                          }}
                          className="w-16 text-center bg-[#0f0f2e] border border-slate-600/50 rounded-lg text-[#e2e8f0] text-sm py-1 outline-none"
                        />
                        <button
                          type="button"
                          className="w-8 h-8 rounded-lg bg-slate-700/50 border border-slate-600/50 text-slate-300 text-lg font-bold flex items-center justify-center hover:bg-slate-600/50 transition-colors"
                          onClick={() => setQuantity(q => Math.min(maxQty, q + 1))}
                        >+</button>
                        <span className="text-[11px] text-slate-400 ml-1">/ {maxQty}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-slate-400 m-0">Duration</p>
                    <div className="px-3 py-2 rounded-[8px] bg-slate-700/30 border border-slate-600/30 text-[13px] font-semibold text-[#e2e8f0]">
                      {isInstant ? 'Instantaneous' : formatDuration(totalDuration)}
                      {!isInstant && timerScaling === 'per_unit' && quantity > 1 && (
                        <span className="text-[11px] text-slate-400 ml-2">({formatDuration(baseDuration)} × {quantity})</span>
                      )}
                    </div>
                  </div>

                  {firstSuccessTier && firstSuccessTier.rewards.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-slate-400 m-0">
                        You'll receive (at minimum)
                      </p>
                      {firstSuccessTier.rewards.slice(0, 5).map((r: any, i: number) => (
                        <RewardPreviewLine key={i} reward={r} />
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 text-center m-0 mt-1">
                    {quantity} × <strong className="text-slate-400">{itemName}</strong> will be consumed.
                  </p>
                </>
              )}
            </div>
          )}

          {(phase === 'submitting' || phase === 'skipping') && (
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-slate-400 text-[13px]">
              <div className="w-8 h-8 rounded-full border-[3px] border-orange-500/20 border-t-orange-400 animate-spin" />
              <p>{phase === 'skipping' ? 'Skipping dusting…' : 'Starting dusting…'}</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col gap-2">
              {isInstant && instantRewards && instantRewards.length > 0 ? (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-slate-400 m-0">Rewards</p>
                  {instantRewards.map((r: any, i: number) => (
                    <div key={i} className="px-3 py-2 rounded-[8px] bg-green-500/[0.12] border border-green-500/35 text-[#bbf7d0] text-[13px] font-semibold flex items-center gap-2">
                      {r.key && <GameIcon src={r.key} size={18} />}
                      <span>{r.amount != null ? `${r.amount}× ` : ''}{r.key ?? r.type}</span>
                    </div>
                  ))}
                </>
              ) : isInstant ? (
                <div className="px-3 py-2 rounded-[8px] bg-slate-400/[0.08] border border-slate-400/[0.18] text-[13px] text-slate-400 italic text-center">
                  No rewards this time.
                </div>
              ) : (
                <div className="px-3 py-3 rounded-[8px] bg-blue-500/10 border border-blue-500/25 text-[#93c5fd] text-[13px] text-center leading-relaxed">
                  Dusting in progress. Check your active jobs to collect when ready.
                </div>
              )}
            </div>
          )}

          {phase === 'error' && error && (
            <div className="mt-2 px-[14px] py-3 rounded-[10px] bg-red-500/[0.12] border border-red-500/40 text-[#fca5a5] text-[13px] leading-[1.4]" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {phase === 'confirm' && canSkip && (
            <>
              <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="modal-btn modal-btn--apply" onClick={handleSkip}>
                Skip (Instant Finish)
              </button>
            </>
          )}
          {phase === 'confirm' && !canSkip && (
            <>
              <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="modal-btn modal-btn--apply" onClick={handleConfirm}>
                Dust {quantity > 1 ? `×${quantity}` : ''}
              </button>
            </>
          )}
          {isBusy && (
            <button type="button" className="modal-btn modal-btn--apply" disabled>
              {phase === 'skipping' ? 'Skipping…' : 'Starting…'}
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
