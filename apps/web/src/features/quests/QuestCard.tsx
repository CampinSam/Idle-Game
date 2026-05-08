import { memo, useState, useCallback } from 'react';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import ItemQty from '../../components/ItemQty';
import { Tag } from '../../components/Tag';
import { resolveSystemRewardIcon } from '../../utils/iconResolver';

interface QuestCardProps {
  quest: any;
}

function questCardClass(status: string): string {
  const base =
    'bg-gradient-to-br from-[#1a1640] to-[#221a50] border rounded-[14px] p-3.5 ' +
    'flex flex-col gap-2.5 motion-safe:animate-[card-enter_0.2s_ease-out_both]';
  if (status === 'completed') return `${base} border-[rgba(34,197,94,0.35)]`;
  if (status === 'claimed') return `${base} border-[rgba(139,92,246,0.2)] opacity-[0.55]`;
  return `${base} border-[rgba(139,92,246,0.2)]`;
}

function QuestCardInner({ quest }: QuestCardProps) {
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });
  const [claiming, setClaiming] = useState(false);

  const def = quest.questDef ?? {};
  const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
  const progress: any[] = Array.isArray(quest.progress) ? quest.progress : [];
  const rewardSpec = def.rewardSpec ?? {};

  const rewards: any[] = (() => {
    if (rewardSpec.type === 'currency' && rewardSpec.currencyId) {
      return [{ type: 'currency', currencyId: rewardSpec.currencyId, amount: rewardSpec.amount ?? 1 }];
    }
    if (rewardSpec.type === 'item' && rewardSpec.itemDefId) {
      return [{ type: 'item', itemDefId: rewardSpec.itemDefId, amount: rewardSpec.qty ?? 1 }];
    }
    if (resolveSystemRewardIcon(rewardSpec.type)) {
      return [{ type: rewardSpec.type, amount: rewardSpec.amount ?? rewardSpec.qty ?? 1 }];
    }
    if (rewardSpec.type === 'bundle' && Array.isArray(rewardSpec.entries)) {
      return rewardSpec.entries.map((e: any) => ({
        type: e.type,
        currencyId: e.currencyId,
        itemDefId: e.itemDefId,
        amount: e.amount ?? e.qty ?? 1,
      }));
    }
    return [];
  })();
  const status: string = quest.status ?? 'active';

  const handleClaim = useCallback(async () => {
    if (claiming || status !== 'completed') return;
    setClaiming(true);
    try {
      await execute('ClaimQuestReward', { questInstanceId: quest.id });
      audioEngine.play('sfx.reward.quest_complete');
      audioEngine.play('sfx.economy.currency_earn');
    } catch (err) {
      console.error('[QuestCard] Claim failed:', err);
    } finally {
      setClaiming(false);
    }
  }, [claiming, status, quest.id, execute]);

  const visibleRewards = rewards.slice(0, 3);
  const overflowCount = rewards.length - 3;

  return (
    <div className={questCardClass(status)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-[#e2d9ff]">{def.name || 'Quest'}</span>
        <Tag tagKey={`quest-${status}`} />
      </div>

      <div className="flex flex-col gap-1.5">
        {objectives.map((obj: any, i: number) => {
          const prog = progress[i] ?? { current: 0, target: obj.target ?? 1, completed: false };
          const pct = prog.target > 0 ? Math.min(100, (prog.current / prog.target) * 100) : 0;
          return (
            <div key={i} className="flex flex-col gap-[3px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">
                  {obj.description || obj.eventType || `Objective ${i + 1}`}
                </span>
                <span className="text-[11px] font-bold text-[#c4b5fd]">{prog.current} / {prog.target}</span>
              </div>
              <div className="h-1.5 bg-black/30 rounded-[3px] overflow-hidden">
                <div
                  className={`h-full rounded-[3px] transition-[width] duration-300 ${
                    prog.completed
                      ? 'bg-gradient-to-r from-[#22c55e] to-[#4ade80]'
                      : 'bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa]'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {visibleRewards.map((r: any, i: number) => {
            const iconSrc = (rewards.length === 1 && def.iconKey)
              ? def.iconKey
              : (r.currencyId ?? r.itemDefId ?? resolveSystemRewardIcon(r.type) ?? r.type);
            return (
              <span
                key={i}
                className="flex items-center gap-[3px] text-[11px] font-bold text-[#e2d9f3] bg-black/30 border border-[rgba(139,92,246,0.15)] rounded-2xl py-0.5 pl-1 pr-2"
              >
                <ItemQty src={iconSrc} amount={r.amount} size={14} />
              </span>
            );
          })}
          {overflowCount > 0 && (
            <span className="text-[11px] font-bold text-text-secondary">+{overflowCount} more</span>
          )}
        </div>

        {status === 'completed' && (
          <button
            className="px-4 py-1.5 text-xs font-bold rounded-lg border-0 cursor-pointer transition-all duration-200 whitespace-nowrap flex-shrink-0 bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-white shadow-[0_0_10px_rgba(34,197,94,0.4)] active:scale-[0.93] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleClaim}
            disabled={claiming}
          >
            {claiming ? 'Claiming...' : 'Claim'}
          </button>
        )}
      </div>
    </div>
  );
}

export const QuestCard = memo(QuestCardInner);
