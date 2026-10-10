import { memo, useMemo } from 'react';

const MILESTONES = [3, 5, 10];

interface QuestMetaProgressProps {
  quests: any[];
}

function QuestMetaProgressInner({ quests }: QuestMetaProgressProps) {
  const { completedCount, totalCount } = useMemo(() => {
    const total = quests.length;
    const done = quests.filter(
      (q: any) => q.status === 'completed' || q.status === 'claimed',
    ).length;
    return { completedCount: done, totalCount: total };
  }, [quests]);

  if (totalCount === 0) return null;

  const maxMilestone = MILESTONES[MILESTONES.length - 1];
  const pct = Math.min(100, (completedCount / maxMilestone) * 100);

  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-br from-[rgba(139,92,246,0.08)] to-[rgba(88,28,135,0.08)] border border-[rgba(139,92,246,0.2)] rounded-xl">
      <span className="text-[13px] text-text-secondary font-semibold">Progress</span>
      <div className="flex-1 h-2 bg-black/30 rounded overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] rounded transition-[width] duration-300 shadow-[0_0_6px_rgba(139,92,246,0.4)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[13px] font-bold text-[#c4b5fd] whitespace-nowrap">{completedCount}/{maxMilestone}</span>
      <div className="flex gap-1.5 mt-1">
        {MILESTONES.map((m) => (
          <span
            key={m}
            className={`flex items-center gap-[3px] text-[11px] font-semibold py-0.5 px-2 rounded-[10px] ${
              completedCount >= m
                ? 'text-[#4ade80] border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)]'
                : 'text-text-secondary bg-black/20 border border-[rgba(139,92,246,0.12)]'
            }`}
          >
            {completedCount >= m ? '✓' : '🏆'} {m}
          </span>
        ))}
      </div>
    </div>
  );
}

export const QuestMetaProgress = memo(QuestMetaProgressInner);
