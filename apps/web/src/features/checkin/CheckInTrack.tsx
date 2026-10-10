import { useMemo } from 'react';
import { useSyncCheckIns } from '../../hooks/useSyncSelectors';
import { useNow } from '../../hooks/useNow';
import { getWindowStart, getWindowDurationMs, formatCountdown } from './checkinUtils';
import { RewardTrack } from './RewardTrack';

interface CheckInTrackProps {
  defId: string;
}

export default function CheckInTrack({ defId }: CheckInTrackProps) {
  const checkins = useSyncCheckIns();
  const now = useNow(60_000);

  const instance = useMemo(
    () => (checkins as any[]).find((c) => c.checkInDefId === defId) ?? null,
    [checkins, defId],
  );
  const def = instance?.checkInDef;

  const cycleLength = def?.cycleLength ?? 7;
  const frequency = def?.frequency ?? { type: 'daily' };
  const streak = instance?.streak ?? 0;

  const dayIcons = useMemo(() => {
    const map: Record<number, string | undefined> = {};
    const rewards: any[] = Array.isArray(def?.rewards) ? def.rewards : [];
    for (const r of rewards) {
      if (typeof r?.day === 'number' && typeof r?.iconKey === 'string' && r.iconKey) {
        map[r.day] = r.iconKey;
      }
    }
    return map;
  }, [def]);

  const countdown = useMemo(() => {
    const nowDate = new Date(now);
    const windowStart = getWindowStart(frequency, nowDate);
    const windowMs = getWindowDurationMs(frequency);
    const nextWindow = new Date(windowStart.getTime() + windowMs);
    const remaining = nextWindow.getTime() - now;
    return formatCountdown(remaining) ?? '';
  }, [now, frequency]);

  if (!def) return null;

  return (
    <div className="checkin-track flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between">
        <span className="[font-family:'Cinzel',serif] text-[15px] font-bold text-[#e2d9ff]">
          {def.name}
        </span>
        {countdown && (
          <span className="text-[12px] text-[#a78bfa] font-semibold">
            Resets in {countdown}
          </span>
        )}
      </div>
      {instance && (
        <RewardTrack
          cycleLength={cycleLength}
          streak={streak}
          dayIcons={dayIcons}
        />
      )}
    </div>
  );
}
