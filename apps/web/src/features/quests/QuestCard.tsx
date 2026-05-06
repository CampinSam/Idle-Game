import { memo, useState, useCallback } from 'react';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import ItemQty from '../../components/ItemQty';
import { Tag } from '../../components/Tag';

interface QuestCardProps {
  quest: any;
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
    <div className={`quest-card ${status}`}>
      <div className="quest-card-header">
        <span className="quest-card-name">{def.name || 'Quest'}</span>
        <Tag tagKey={`quest-${status}`} />
      </div>

      <div className="quest-objectives">
        {objectives.map((obj: any, i: number) => {
          const prog = progress[i] ?? { current: 0, target: obj.target ?? 1, completed: false };
          const pct = prog.target > 0 ? Math.min(100, (prog.current / prog.target) * 100) : 0;
          return (
            <div key={i} className="quest-objective-row">
              <div className="quest-objective-info">
                <span className="quest-objective-label">{obj.description || obj.eventType || `Objective ${i + 1}`}</span>
                <span className="quest-objective-progress-text">{prog.current} / {prog.target}</span>
              </div>
              <div className="quest-progress-bar">
                <div
                  className={`quest-progress-bar-fill ${prog.completed ? 'done' : 'active'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="quest-card-footer">
        <div className="quest-reward-chips">
          {visibleRewards.map((r: any, i: number) => {
            // Quest-level iconKey override applies only when the quest hands
            // out a single reward — otherwise per-reward icons stay distinct.
            const iconSrc = (rewards.length === 1 && def.iconKey)
              ? def.iconKey
              : (r.currencyId ?? r.itemDefId ?? r.type);
            return (
              <span key={i} className="quest-reward-chip">
                <ItemQty src={iconSrc} amount={r.amount} size={14} />
              </span>
            );
          })}
          {overflowCount > 0 && (
            <span className="quest-reward-overflow">+{overflowCount} more</span>
          )}
        </div>

        {status === 'completed' && (
          <button
            className="quest-claim-btn ready"
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
