import { useState, useMemo, useCallback } from 'react';
import { useSyncGifts } from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import DailyRewardContainer from '../checkin/DailyRewardContainer';
import QuestList from '../quests/QuestList';
import GameIcon from '../../components/GameIcon';
import { deriveIconFromRewardSpec } from '../../utils/iconResolver';
import './RewardsPage.css';

interface SyncGift {
  id: string;
  status: string;
  sourceType?: string;
  snapshot?: {
    presentation?: {
      title?: string;
      body?: string;
      iconKey?: string;
    };
    rewardSpec?: any;
  };
}

function pickGiftIcon(g: SyncGift): string | null {
  // Prefer the admin-set presentation icon, then auto-derive from the gift's
  // contents (currency / item / bundle / entity). Falling all the way through
  // means the gift truly has nothing resolvable and the row will skip the
  // icon column.
  const presentationIcon = g.snapshot?.presentation?.iconKey;
  if (presentationIcon && presentationIcon.trim()) return presentationIcon;
  return deriveIconFromRewardSpec(g.snapshot?.rewardSpec);
}

function PendingGiftsCard() {
  const gifts = useSyncGifts() as SyncGift[];
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const pendingGifts = useMemo(
    () => gifts.filter((g) => g.status === 'UNCLAIMED' && g.sourceType !== 'checkin'),
    [gifts],
  );

  const handleClaim = useCallback(async (giftId: string) => {
    if (claimingId) return;
    setClaimingId(giftId);
    setErrorId(null);
    try {
      await execute('ClaimGift', { giftId });
      audioEngine.play('sfx.reward.gift');
      audioEngine.play('sfx.economy.currency_earn');
    } catch (err) {
      console.error('[PendingGiftsCard] Claim failed:', err);
      setErrorId(giftId);
    } finally {
      setClaimingId(null);
    }
  }, [claimingId, execute]);

  if (pendingGifts.length === 0) return null;

  return (
    <div className="rewards-card">
      <span className="rewards-card-title">Pending Gifts</span>
      <div className="pending-gifts-list">
        {pendingGifts.map((g) => {
          const pres = g.snapshot?.presentation;
          const title = pres?.title || 'Gift';
          const body = pres?.body || '';
          const isClaiming = claimingId === g.id;
          const hasError = errorId === g.id;
          const icon = pickGiftIcon(g);
          return (
            <div key={g.id} className="pending-gift-row">
              {icon && (
                <div className="pending-gift-icon">
                  <GameIcon src={icon} size={40} />
                </div>
              )}
              <div className="pending-gift-info">
                <span className="pending-gift-title">{title}</span>
                {body && <span className="pending-gift-body">{body}</span>}
                {hasError && (
                  <span style={{ color: '#f87171', fontSize: '0.8rem', marginTop: 4 }}>
                    Claim failed — please try again.
                  </span>
                )}
              </div>
              <button
                className="pending-gift-claim-btn"
                disabled={isClaiming}
                onClick={() => handleClaim(g.id)}
              >
                {isClaiming ? '...' : 'Claim'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RewardsPage() {
  return (
    <div className="rewards-page">
      <div className="rewards-card">
        <span className="rewards-card-title">Check-In Rewards</span>
        <DailyRewardContainer />
      </div>
      <PendingGiftsCard />
      <div className="rewards-card">
        <span className="rewards-card-title">Quests</span>
        <QuestList />
      </div>
    </div>
  );
}
