import { useMemo } from 'react';
import { useSyncAchievements } from '../../hooks/useSyncSelectors';
import { AchievementCard } from './AchievementCard';
import './Achievements.css';

export default function AchievementsPage() {
  const achievements = useSyncAchievements() as any[];

  const { unlocked, total, sorted } = useMemo(() => {
    const unlocked = achievements.filter((a) => a.status === 'claimed').length;
    const total = achievements.length;
    // Sort: completed (claimable) → active (in progress) → claimed (done).
    // Within each band, sort by tier desc then name.
    const sorted = [...achievements].sort((a, b) => {
      const order = { completed: 0, active: 1, claimed: 2 };
      const ao = order[a.status as keyof typeof order] ?? 3;
      const bo = order[b.status as keyof typeof order] ?? 3;
      if (ao !== bo) return ao - bo;
      const at = a.achievementDef?.tier ?? 0;
      const bt = b.achievementDef?.tier ?? 0;
      if (at !== bt) return bt - at;
      return (a.achievementDef?.name ?? '').localeCompare(b.achievementDef?.name ?? '');
    });
    return { unlocked, total, sorted };
  }, [achievements]);

  const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;

  return (
    <div className="achievement-section">
      <div className="achievement-header">
        <div className="achievement-header-title">Achievements</div>
        <div className="achievement-header-stats">
          <span className="achievement-header-count">
            {unlocked} / {total} unlocked
          </span>
          <div className="achievement-header-bar">
            <div
              className="achievement-header-bar-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="achievement-header-pct">{pct}%</span>
        </div>
      </div>

      <div className="achievement-list">
        {sorted.length === 0 ? (
          <div className="achievement-empty">
            No achievements yet — start playing to unlock your first one!
          </div>
        ) : (
          sorted.map((a: any) => <AchievementCard key={a.id} achievement={a} />)
        )}
      </div>
    </div>
  );
}
