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
    <div className="quest-meta-strip">
      <span className="quest-meta-label">Progress</span>
      <div className="quest-meta-bar-wrap">
        <div className="quest-meta-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="quest-meta-count">{completedCount}/{maxMilestone}</span>
      <div className="quest-meta-milestones">
        {MILESTONES.map((m) => (
          <span
            key={m}
            className={`quest-meta-milestone${completedCount >= m ? ' reached' : ''}`}
          >
            {completedCount >= m ? '✓' : '🏆'} {m}
          </span>
        ))}
      </div>
    </div>
  );
}

export const QuestMetaProgress = memo(QuestMetaProgressInner);
