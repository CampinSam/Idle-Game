import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSyncCheckIns, useSyncGifts } from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { useModal } from '../../context/ModalContext';
import { RewardTrack } from './RewardTrack';
import { RewardClaimButton } from './RewardClaimButton';
import './CheckIn.css';

function getWindowDurationMs(frequency: any): number {
  const type = frequency?.type ?? 'daily';
  const interval = frequency?.interval ?? 1;
  if (type === 'daily') return 24 * 60 * 60 * 1000;
  if (type === 'every_x_days') return interval * 24 * 60 * 60 * 1000;
  if (type === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  if (type === 'monthly') return 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function getWindowStart(frequency: any, now: Date): Date {
  const type = frequency?.type ?? 'daily';
  const interval = frequency?.interval ?? 1;
  if (type === 'daily') {
    const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d;
  }
  if (type === 'every_x_days') {
    const windowMs = interval * 24 * 60 * 60 * 1000;
    return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  }
  if (type === 'weekly') {
    const d = new Date(now); d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    return d;
  }
  if (type === 'monthly') {
    const d = new Date(now); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d;
  }
  const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d;
}

function formatCountdown(ms: number): string | null {
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DailyRewardContainer() {
  const checkins = useSyncCheckIns();
  const gifts = useSyncGifts();
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });
  const [claimingDay, setClaimingDay] = useState<number | null>(null);
  const [countdown, setCountdown] = useState('');

  const instance = checkins[0] as any;
  const def = instance?.checkInDef;

  const cycleLength = def?.cycleLength ?? 7;
  const frequency = def?.frequency ?? { type: 'daily' };
  const streak = instance?.streak ?? 0;

  const claimableGiftsByDay = useMemo(() => {
    if (!instance || !def) return {};
    const map: Record<number, any> = {};
    for (const g of gifts) {
      if ((g as any).sourceType !== 'checkin' || (g as any).sourceId !== def.id || (g as any).status !== 'UNCLAIMED') continue;
      const ctx = (g as any).snapshot?.contextData?.checkin;
      const day = ctx && typeof ctx.day === 'number' ? ctx.day : streak % cycleLength;
      map[day] = g;
    }
    return map;
  }, [instance, def, gifts, streak, cycleLength]);

  const hasClaimable = Object.keys(claimableGiftsByDay).length > 0;

  const claimedToday = useMemo(() => {
    if (!instance?.lastClaimedAt) return false;
    const lastClaimed = new Date(instance.lastClaimedAt);
    const now = new Date();
    const windowStart = getWindowStart(frequency, now);
    return lastClaimed >= windowStart && !hasClaimable;
  }, [instance, frequency, hasClaimable]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const windowStart = getWindowStart(frequency, now);
      const windowMs = getWindowDurationMs(frequency);
      const nextWindow = new Date(windowStart.getTime() + windowMs);
      const remaining = nextWindow.getTime() - now.getTime();
      setCountdown(formatCountdown(remaining) ?? '');
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [frequency]);

  const handleClaimDay = useCallback(async (dayIndex: number) => {
    const gift = claimableGiftsByDay[dayIndex];
    if (!gift || claimingDay !== null) return;
    setClaimingDay(dayIndex);
    try {
      await execute('ClaimGift', { giftId: (gift as any).id });
    } catch (err) {
      console.error('[DailyRewardContainer] Claim failed:', err);
    } finally {
      setClaimingDay(null);
    }
  }, [claimableGiftsByDay, claimingDay, execute]);

  if (!instance || !def) return null;

  return (
    <div className="checkin-container">
      {countdown && (
        <div className="checkin-header">
          <span className="checkin-timer">Resets in {countdown}</span>
        </div>
      )}
      <RewardTrack
        cycleLength={cycleLength}
        streak={streak}
        claimableDays={claimableGiftsByDay}
        onClaimDay={handleClaimDay}
        claimingDay={claimingDay}
      />
      <RewardClaimButton
        claimedToday={claimedToday}
        nextWindowLabel={!hasClaimable ? countdown : null}
      />
    </div>
  );
}
