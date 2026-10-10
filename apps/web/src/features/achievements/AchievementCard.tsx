import { memo, useState, useCallback } from 'react';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import { Tag } from '../../components/Tag';

interface AchievementCardProps {
  achievement: any;
}

function describePermanentEffect(spec: any): string | null {
  if (!spec || !spec.effectDefId) return null;
  const value = spec.value;
  if (typeof value === 'number' && value !== 0) {
    return `Permanent: ${value > 0 ? '+' : ''}${value}${
      spec.valueMode === 'percent_add' ? '%' : ''
    }`;
  }
  if (spec.stats && typeof spec.stats === 'object') {
    const parts = Object.entries(spec.stats).map(
      ([k, v]) => `${v as number > 0 ? '+' : ''}${v} ${k}`,
    );
    return `Permanent: ${parts.join(', ')}`;
  }
  return 'Permanent bonus';
}

function cardClass(status: string): string {
  const base = 'bg-[rgba(20,22,28,0.85)] border rounded-[10px] p-3.5 transition-[border-color,transform] duration-200';
  if (status === 'completed') return `${base} border-[rgba(255,215,0,0.5)] shadow-[0_0_12px_rgba(255,215,0,0.15)]`;
  if (status === 'claimed') return `${base} border-[rgba(100,200,100,0.4)] opacity-[0.85]`;
  if (status === 'not_started') return `${base} border-[rgba(255,255,255,0.04)] opacity-[0.6]`;
  return `${base} border-[rgba(255,255,255,0.08)]`;
}

function AchievementCardInner({ achievement }: AchievementCardProps) {
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });
  const [claiming, setClaiming] = useState(false);

  const def = achievement.questDef ?? {};
  const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
  const progress: any[] = Array.isArray(achievement.progress) ? achievement.progress : [];
  const status: string = achievement.status ?? 'active';
  const tier: number = def.tier ?? 1;
  const permanentDesc = describePermanentEffect(def.permanentEffectSpec);
  const isDone = status === 'completed' || status === 'claimed';
  const isNotStarted = status === 'not_started';

  const handleClaim = useCallback(async () => {
    if (claiming || status !== 'completed') return;
    setClaiming(true);
    try {
      await execute('ClaimAchievementReward', { achievementInstanceId: achievement.id });
      audioEngine.play('sfx.reward.quest_complete');
      audioEngine.play('sfx.economy.currency_earn');
    } catch (err) {
      console.error('[AchievementCard] Claim failed:', err);
    } finally {
      setClaiming(false);
    }
  }, [claiming, status, achievement.id, execute]);

  return (
    <div className={cardClass(status)}>
      <div className="flex justify-between items-start gap-2.5 mb-1.5">
        <div className="flex flex-col gap-0.5">
          <Tag tagKey={`ach-tier-${tier}`} />
          <span className="text-[1.05rem] font-semibold text-[#f0f0f0]">{def.name || 'Achievement'}</span>
        </div>
        <Tag tagKey={`ach-status-${status}`} />
      </div>

      {def.description && (
        <div className="text-[0.85rem] text-[#b0b0b0] mb-2.5 leading-[1.4]">{def.description}</div>
      )}

      {!isNotStarted && (
        <div className="flex flex-col gap-2 mb-2">
          {objectives.map((obj: any, i: number) => {
            const prog = progress[i] ?? { current: 0, target: obj?.target ?? 1, completed: false };
            const target = prog.target ?? obj?.target ?? 1;
            const pct = target > 0 ? Math.min(100, (prog.current / target) * 100) : 0;
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between text-[0.8rem] text-[#c0c0c0]">
                  <span>{obj?.description || obj?.eventType || `Objective ${i + 1}`}</span>
                  <span className="font-semibold text-[#e0e0e0]">{prog.current} / {target}</span>
                </div>
                <div className="h-1.5 bg-black/40 rounded-[3px] overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-300 ${
                      isDone
                        ? 'bg-gradient-to-r from-[#ffd76a] to-[#ff9c40]'
                        : 'bg-gradient-to-r from-[#4a90e2] to-[#6bb6ff]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {permanentDesc && (status === 'claimed' || status === 'completed') && (
        <Tag
          tagKey="permanent-bonus"
          size="lg"
          icon={<span className="text-[#ffd76a] text-[0.95rem]">★</span>}
          label={permanentDesc}
        />
      )}

      {status === 'completed' && (
        <button
          className="w-full mt-2.5 px-4 py-2.5 bg-gradient-to-br from-[#ffd76a] to-[#ff9c40] text-[#1a1a1a] border-0 rounded-lg font-bold text-[0.95rem] cursor-pointer transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(255,215,0,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={claiming}
          onClick={handleClaim}
        >
          {claiming ? 'Claiming...' : 'Claim Reward'}
        </button>
      )}
    </div>
  );
}

export const AchievementCard = memo(AchievementCardInner);
