import { memo, useMemo } from 'react';
import { RewardNode, type NodeState } from './RewardNode';

interface RewardTrackProps {
  cycleLength: number;
  streak: number;
  claimableDays: Record<number, any>;
  dayIcons?: Record<number, string | null | undefined>;
  onClaimDay: (dayIndex: number) => void;
  claimingDay: number | null;
}

function isMilestoneDay(day: number, cycleLength: number): boolean {
  const d = day + 1;
  if (d === cycleLength) return true;
  if (cycleLength >= 14 && d === Math.floor(cycleLength / 2)) return true;
  if (d % 7 === 0) return true;
  return false;
}

function RewardTrackInner({ cycleLength, streak, claimableDays, dayIcons, onClaimDay, claimingDay }: RewardTrackProps) {
  const currentDay = streak % cycleLength;

  const nodes = useMemo(() => {
    const result: { day: number; state: NodeState; milestone: boolean }[] = [];
    for (let i = 0; i < cycleLength; i++) {
      let state: NodeState;
      if (claimableDays[i]) {
        state = 'claimable';
      } else if (i < currentDay) {
        state = 'claimed';
      } else if (i === currentDay) {
        state = 'current';
      } else {
        state = 'locked';
      }
      result.push({ day: i, state, milestone: isMilestoneDay(i, cycleLength) });
    }
    return result;
  }, [cycleLength, currentDay, claimableDays]);

  return (
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-2 pb-1">
      <div className="flex items-center gap-0 relative min-w-max">
        {nodes.map((n, idx) => (
          <div key={n.day} className="flex items-center">
            {idx > 0 && (
              <div
                className={[
                  'w-5 h-[3px] shrink-0',
                  n.state === 'claimed'
                    ? '[background:linear-gradient(90deg,#8b5cf6,#a78bfa)] shadow-[0_0_4px_rgba(139,92,246,0.4)]'
                    : 'bg-[rgba(139,92,246,0.2)]',
                ].join(' ')}
              />
            )}
            <RewardNode
              day={n.day}
              state={n.state}
              isMilestone={n.milestone}
              iconKey={dayIcons?.[n.day]}
              onClaim={() => onClaimDay(n.day)}
              claiming={claimingDay === n.day}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const RewardTrack = memo(RewardTrackInner);
