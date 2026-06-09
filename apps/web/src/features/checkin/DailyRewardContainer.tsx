import { useState, useMemo, useCallback } from 'react';
import { useSyncCheckIns } from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { useNow } from '../../hooks/useNow';
import { audioEngine } from '../../services/AudioEngine';
import { isInstanceCheckInAvailable } from './checkinUtils';
import CheckInTrack from './CheckInTrack';

export default function DailyRewardContainer() {
  const checkins = useSyncCheckIns() as any[];
  const { execute } = useCommand();
  const nowMs = useNow(60_000);

  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCheckIn = useMemo(
    () => checkins.some((inst) => isInstanceCheckInAvailable(inst, nowMs)),
    [checkins, nowMs],
  );

  const handleCheckIn = useCallback(async () => {
    if (checkingIn) return;
    setCheckingIn(true);
    setError(null);
    try {
      await execute('ClaimCheckIn', {});
      audioEngine.play('sfx.reward.checkin');
    } catch (err: any) {
      setError(err?.message ?? 'Check-in failed — please try again.');
    } finally {
      setCheckingIn(false);
    }
  }, [checkingIn, execute]);

  if (checkins.length === 0) return null;

  return (
    <div className="flex flex-col gap-0">
      <div className="pb-3">
        {canCheckIn ? (
          <button
            type="button"
            disabled={checkingIn}
            onClick={handleCheckIn}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-bold bg-gradient-to-br from-[rgba(139,92,246,0.3)] to-[rgba(109,40,217,0.25)] border border-[rgba(139,92,246,0.55)] text-[#e2d9ff] hover:from-[rgba(139,92,246,0.4)] hover:to-[rgba(109,40,217,0.35)] hover:border-[rgba(139,92,246,0.75)] active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_16px_rgba(139,92,246,0.2)]"
          >
            {checkingIn ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-[#a78bfa] border-t-transparent rounded-full animate-spin" />
                Checking in…
              </>
            ) : (
              '✦ Check In'
            )}
          </button>
        ) : (
          <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-[#9ca3af] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]">
            Already checked in — come back tomorrow
          </div>
        )}
        {error && (
          <p className="mt-2 text-center text-[12px] text-[#f87171]">{error}</p>
        )}
      </div>

      {checkins.map((instance) => (
        <CheckInTrack key={instance.checkInDefId} defId={instance.checkInDefId} />
      ))}
    </div>
  );
}
