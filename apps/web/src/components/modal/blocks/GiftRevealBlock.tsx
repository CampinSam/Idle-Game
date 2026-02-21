import type { ModalBlockGiftReveal } from '@derp/shared';
import AssetImage from '../AssetImage';
import RewardsListBlock from './RewardsListBlock';

export default function GiftRevealBlock({ gift, rewards }: ModalBlockGiftReveal) {
  return (
    <div className="gm-gift-reveal">
      <div className="gm-gift-icon-wrap">
        {gift.image ? (
          <AssetImage asset={gift.image} style={{ width: 64, height: 64, borderRadius: 12 }} />
        ) : (
          <span className="gm-gift-icon-fallback">🎁</span>
        )}
      </div>
      <div className="gm-gift-title">{gift.title}</div>
      {rewards && rewards.length > 0 && (
        <RewardsListBlock items={rewards} title="Contents" />
      )}
    </div>
  );
}
