import { memo } from 'react';

export type NodeState = 'claimed' | 'claimable' | 'current' | 'locked';

interface RewardNodeProps {
  day: number;
  state: NodeState;
  isMilestone: boolean;
  onClaim?: () => void;
  claiming?: boolean;
}

function RewardNodeInner({ day, state, isMilestone, onClaim, claiming }: RewardNodeProps) {
  const classes = [
    'reward-node',
    state,
    isMilestone ? 'reward-node-milestone' : '',
  ].filter(Boolean).join(' ');

  const icon = state === 'claimed'
    ? '✅'
    : isMilestone
      ? '🎁'
      : '🎀';

  const handleClick = () => {
    if (state === 'claimable' && !claiming && onClaim) {
      onClaim();
    }
  };

  return (
    <div className={classes} onClick={handleClick} role={state === 'claimable' ? 'button' : undefined}>
      {state === 'claimed' && <span className="reward-node-check">✓</span>}
      <span className="reward-node-day">Day {day + 1}</span>
      <span className="reward-node-icon">{claiming ? '⏳' : icon}</span>
    </div>
  );
}

export const RewardNode = memo(RewardNodeInner);
