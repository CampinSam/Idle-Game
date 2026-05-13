import { useState, useMemo, useCallback } from 'react';
import { useSyncGifts } from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { audioEngine } from '../../services/AudioEngine';
import DailyRewardContainer from '../checkin/DailyRewardContainer';
import QuestList from '../quests/QuestList';
import GameIcon from '../../components/GameIcon';
import { deriveIconFromRewardSpec } from '../../utils/iconResolver';

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

const PAGE_CLASS =
  'flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto ' +
  '[-webkit-overflow-scrolling:touch] overscroll-contain gap-4';

const CARD_CLASS =
  'bg-gradient-to-br from-[#1a1640] to-[#221a50] border border-[rgba(139,92,246,0.25)] ' +
  'rounded-2xl p-3.5 flex flex-col gap-3 motion-safe:animate-[card-enter_0.2s_ease-out_both]';

const CARD_TITLE_CLASS = "font-['Cinzel',serif] text-base font-bold text-[#e2d9ff]";

const CLAIM_BTN_CLASS =
  'px-4 py-1.5 text-xs font-bold rounded-lg border-0 cursor-pointer whitespace-nowrap flex-shrink-0 ' +
  'bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-white ' +
  'shadow-[0_0_10px_rgba(34,197,94,0.4)] transition-all active:scale-95 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

function pickGiftIcon(g: SyncGift): string | null {
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
    <div className={CARD_CLASS}>
      <span className={CARD_TITLE_CLASS}>Pending Gifts</span>
      <div className="flex flex-col gap-2">
        {pendingGifts.map((g) => {
          const pres = g.snapshot?.presentation;
          const title = pres?.title || 'Gift';
          const body = pres?.body || '';
          const isClaiming = claimingId === g.id;
          const hasError = errorId === g.id;
          const icon = pickGiftIcon(g);
          return (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 px-3.5 py-3 bg-black/20 border border-[rgba(139,92,246,0.15)] rounded-xl"
            >
              {icon && (
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[rgba(139,92,246,0.12)] rounded-lg p-1">
                  <GameIcon src={icon} size={40} />
                </div>
              )}
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm font-bold text-[#e2d9ff]">{title}</span>
                {body && (
                  <span className="text-xs text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
                    {body}
                  </span>
                )}
                {hasError && (
                  <span className="text-[#f87171] text-[0.8rem] mt-1">
                    Claim failed — please try again.
                  </span>
                )}
              </div>
              <button
                className={CLAIM_BTN_CLASS}
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
    <div className={PAGE_CLASS}>
      <div className={CARD_CLASS}>
        <span className={CARD_TITLE_CLASS}>Check-In Rewards</span>
        <DailyRewardContainer />
      </div>
      <PendingGiftsCard />
      <div className={CARD_CLASS}>
        <span className={CARD_TITLE_CLASS}>Quests</span>
        <QuestList />
      </div>
    </div>
  );
}
