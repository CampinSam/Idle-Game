import { useState, useMemo, useCallback } from 'react';
import { useSyncGifts } from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import DailyRewardContainer from '../checkin/DailyRewardContainer';
import QuestList from '../quests/QuestList';
import './RewardsPage.css';

interface SyncGift {
  id: string;
  status: string;
  sourceType?: string;
  snapshot?: {
    presentation?: {
      title?: string;
      body?: string;
    };
  };
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

  const pendingGifts = useMemo(
    () => gifts.filter((g) => g.status === 'UNCLAIMED' && g.sourceType !== 'checkin'),
    [gifts],
  );

  const handleClaim = useCallback(async (giftId: string) => {
    if (claimingId) return;
    setClaimingId(giftId);
    try {
      await execute('ClaimGift', { giftId });
    } catch (err) {
      console.error('[PendingGiftsCard] Claim failed:', err);
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
          return (
            <div key={g.id} className="pending-gift-row">
              <div className="pending-gift-info">
                <span className="pending-gift-title">{title}</span>
                {body && <span className="pending-gift-body">{body}</span>}
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
        <span className="rewards-card-title">Daily Check-In</span>
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
