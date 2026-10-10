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
  const handleClick = () => {
    if (state === 'claimable' && !claiming && onClaim) {
      onClaim();
    }
  };

  const nodeClass = [
    'reward-node',
    'flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl border-2 bg-[rgba(15,10,35,0.6)] min-w-[56px] cursor-default transition-all duration-200 relative',
    state,
    state === 'locked'    ? 'opacity-45 border-[rgba(100,80,160,0.15)]' : '',
    state === 'claimed'   ? 'border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.08)]' : '',
    state === 'claimable' ? 'border-[#a78bfa] bg-[rgba(139,92,246,0.12)] cursor-pointer [animation:node-pulse_2s_ease-in-out_infinite] shadow-[0_0_12px_rgba(139,92,246,0.3)] active:scale-[0.93]' : '',
    state === 'current'   ? 'border-[rgba(139,92,246,0.5)] bg-[rgba(139,92,246,0.06)]' : '',
    isMilestone           ? 'min-w-[64px] border-2' : '',
  ].filter(Boolean).join(' ');

  const dayLabelClass = [
    'reward-node-day',
    'text-[10px] font-bold tracking-[0.5px] uppercase',
    state === 'claimed'   ? 'text-[#4ade80]' : '',
    state === 'claimable' ? 'text-[#c4b5fd]' : '',
    state !== 'claimed' && state !== 'claimable' ? 'text-[color:var(--text-secondary,#9ca3af)]' : '',
  ].filter(Boolean).join(' ');

  const iconNode = claiming
    ? <span className="reward-node-icon text-[22px] leading-none">⏳</span>
    : iconKey
      ? (
        <span className="reward-node-icon inline-flex items-center justify-center">
          <GameIcon src={iconKey} size={isMilestone ? 32 : 26} />
        </span>
      )
      : <span className="reward-node-icon text-[22px] leading-none">{isMilestone ? '🎁' : '🎀'}</span>;

  return (
    <div className={nodeClass} onClick={handleClick} role={state === 'claimable' ? 'button' : undefined}>
      {state === 'claimed' && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#22c55e] flex items-center justify-center text-[10px] text-white shadow-[0_0_6px_rgba(34,197,94,0.5)]">
          ✓
        </span>
      )}
      <span className={dayLabelClass}>Day {day + 1}</span>
      {iconNode}
    </div>
  );
}

export const RewardNode = memo(RewardNodeInner);
