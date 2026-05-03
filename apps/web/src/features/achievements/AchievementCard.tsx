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

function AchievementCardInner({ achievement }: AchievementCardProps) {
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });
  const [claiming, setClaiming] = useState(false);

  const def = achievement.achievementDef ?? {};
  const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
  const progress: any[] = Array.isArray(achievement.progress) ? achievement.progress : [];
  const status: string = achievement.status ?? 'active';
  const tier: number = def.tier ?? 1;
  const permanentDesc = describePermanentEffect(def.permanentEffectSpec);

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
    <div className={`achievement-card status-${status} tier-${tier}`}>
      <div className="achievement-card-header">
        <div className="achievement-card-title">
          {/* Tier + status pills now come from the unified Tag catalog so
              their colors / glow effects match the matching item icon
              tier in inventory. */}
          <Tag tagKey={`ach-tier-${tier}`} />
          <span className="achievement-card-name">{def.name || 'Achievement'}</span>
        </div>
        <Tag tagKey={`ach-status-${status}`} />
      </div>

      {def.description && (
        <div className="achievement-card-desc">{def.description}</div>
      )}

      <div className="achievement-objectives">
        {objectives.map((obj: any, i: number) => {
          const prog = progress[i] ?? { current: 0, target: obj?.target ?? 1, completed: false };
          const target = prog.target ?? obj?.target ?? 1;
          const pct = target > 0 ? Math.min(100, (prog.current / target) * 100) : 0;
          return (
            <div key={i} className="achievement-objective-row">
              <div className="achievement-objective-info">
                <span className="achievement-objective-label">
                  {obj?.description || obj?.eventType || `Objective ${i + 1}`}
                </span>
                <span className="achievement-objective-progress-text">
                  {prog.current} / {target}
                </span>
              </div>
              <div className="achievement-progress-bar">
                <div
                  className="achievement-progress-bar-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {permanentDesc && (status === 'claimed' || status === 'completed') && (
        <Tag
          tagKey="permanent-bonus"
          size="lg"
          icon={<span className="achievement-permanent-icon">★</span>}
          label={permanentDesc}
        />
      )}

      {status === 'completed' && (
        <button
          className="achievement-claim-btn"
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
