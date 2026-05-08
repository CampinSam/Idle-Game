import { memo } from 'react';

interface RewardClaimButtonProps {
  claimedToday: boolean;
  nextWindowLabel: string | null;
}

function RewardClaimButtonInner({ claimedToday, nextWindowLabel }: RewardClaimButtonProps) {
  const base = 'flex items-center justify-center px-3 py-1.5 rounded-lg text-[13px] font-semibold';

  if (claimedToday) {
    return (
      <div className={`${base} text-[#4ade80] bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)]`}>
        ✓ Claimed today
      </div>
    );
  }

  if (nextWindowLabel) {
    return (
      <div className={`${base} text-[#a78bfa] bg-[rgba(139,92,246,0.06)] border border-[rgba(139,92,246,0.15)]`}>
        Next reward: {nextWindowLabel}
      </div>
    );
  }

  return null;
}

export const RewardClaimButton = memo(RewardClaimButtonInner);
