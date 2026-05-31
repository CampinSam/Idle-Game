import { useMemo } from 'react';
import { useSyncAchievements } from '../../hooks/useSyncSelectors';
import { AchievementCard } from './AchievementCard';

const PAGE_CLASS =
  'flex-1 min-h-0 overflow-x-hidden overflow-y-auto ' +
  '[-webkit-overflow-scrolling:touch] overscroll-contain p-3.5 space-y-4';

export default function AchievementsContent() {
  const achievements = useSyncAchievements() as any[];

  const { unlocked, total, sorted } = useMemo(() => {
    const unlocked = achievements.filter((a) => a.status === 'claimed').length;
    const total = achievements.length;
    const sorted = [...achievements].sort((a, b) => {
      const order = { completed: 0, active: 1, not_started: 2, claimed: 3 };
      const ao = order[a.status as keyof typeof order] ?? 4;
      const bo = order[b.status as keyof typeof order] ?? 4;
      if (ao !== bo) return ao - bo;
      const at = a.questDef?.tier ?? 0;
      const bt = b.questDef?.tier ?? 0;
      if (at !== bt) return bt - at;
      return (a.questDef?.name ?? '').localeCompare(b.questDef?.name ?? '');
    });
    return { unlocked, total, sorted };
  }, [achievements]);

  const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;

  return (
    <div className={PAGE_CLASS}>
      <div className="bg-gradient-to-br from-[rgba(255,215,0,0.08)] to-[rgba(255,215,0,0.02)] border border-[rgba(255,215,0,0.2)] rounded-xl p-4">
        <div className="text-[1.4rem] font-bold text-[#ffd76a] mb-3 tracking-[0.5px]">Achievements</div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[0.95rem] text-[#d4d4d4] font-semibold min-w-[110px]">
            {unlocked} / {total} unlocked
          </span>
          <div className="flex-1 min-w-[120px] h-2.5 bg-black/40 rounded-[5px] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#ffd76a] to-[#ff9c40] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[0.95rem] text-[#ffd76a] font-bold min-w-[40px] text-right">{pct}%</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {sorted.length === 0 ? (
          <div className="text-center py-10 px-5 text-[#888] italic">
            No achievements yet — start playing to unlock your first one!
          </div>
        ) : (
          sorted.map((a: any) => <AchievementCard key={a.questDefId ?? a.id} achievement={a} />)
        )}
      </div>
    </div>
  );
}
