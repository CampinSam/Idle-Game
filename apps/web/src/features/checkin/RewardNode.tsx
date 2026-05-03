import { memo } from 'react';
import GameIcon from '../../components/GameIcon';

export type NodeState = 'claimed' | 'claimable' | 'current' | 'locked';

interface RewardNodeProps {
  day: number;
  state: NodeState;
  isMilestone: boolean;
  iconKey?: string | null;
  onClaim?: () => void;
  claiming?: boolean;
}

function RewardNodeInner({ day, state, isMilestone, iconKey, onClaim, claiming }: RewardNodeProps) {
  const classes = [
    'reward-node',
    state,
    isMilestone ? 'reward-node-milestone' : '',
  ].filter(Boolean).join(' ');

  const handleClick = () => {
    if (state === 'claimable' && !claiming && onClaim) {
      onClaim();
    }
  };

  // When the day has a real reward icon (admin-set or auto-derived from the
  // linked gift's contents), render that icon instead of the generic bow.
  // Fall back to emoji only when there's nothing resolvable.
  const iconNode = claiming
    ? <span className="reward-node-icon">⏳</span>
    : iconKey
      ? (
        <span className="reward-node-icon reward-node-icon-img">
          <GameIcon src={iconKey} size={isMilestone ? 32 : 26} />
        </span>
      )
      : <span className="reward-node-icon">{isMilestone ? '🎁' : '🎀'}</span>;

  return (
    <div className={classes} onClick={handleClick} role={state === 'claimable' ? 'button' : undefined}>
      {state === 'claimed' && <span className="reward-node-check">✓</span>}
      <span className="reward-node-day">Day {day + 1}</span>
      {iconNode}
    </div>
  );
}

export const RewardNode = memo(RewardNodeInner);
