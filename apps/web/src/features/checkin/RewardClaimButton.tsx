import { memo } from 'react';

interface RewardClaimButtonProps {
  claimedToday: boolean;
  nextWindowLabel: string | null;
}

function RewardClaimButtonInner({ claimedToday, nextWindowLabel }: RewardClaimButtonProps) {
  if (claimedToday) {
    return (
      <div className="reward-claim-footer claimed-state">
        ✓ Claimed today
      </div>
    );
  }

  if (nextWindowLabel) {
    return (
      <div className="reward-claim-footer waiting-state">
        Next reward: {nextWindowLabel}
      </div>
    );
  }

  return null;
}

export const RewardClaimButton = memo(RewardClaimButtonInner);
