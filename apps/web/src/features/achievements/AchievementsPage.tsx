import { useMemo } from 'react';
import { useSyncAchievements } from '../../hooks/useSyncSelectors';
import { AchievementCard } from './AchievementCard';

const PAGE_CLASS =
  'flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto ' +
  '[-webkit-overflow-scrolling:touch] overscroll-contain gap-4';

const SECTION_CLASS =
  'bg-gradient-to-br from-[#1a1640] to-[#221a50] border border-[rgba(139,92,246,0.25)] ' +
  'rounded-2xl p-3.5 flex flex-col gap-3 motion-safe:animate-[card-enter_0.2s_ease-out_both]';

export default function AchievementsPage() {
  const achievements = useSyncAchievements() as any[];

  const { unlocked, total, sorted } = useMemo(() => {
    const unlocked = achievements.filter((a) => a.status === 'claimed').length;
    const total = achievements.length;
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
    <div className={PAGE_CLASS}>
      <div className={SECTION_CLASS}>
        <div className="bg-gradient-to-br from-[rgba(255,215,0,0.08)] to-[rgba(255,215,0,0.02)] border border-[rgba(255,215,0,0.2)] rounded-xl p-4 mb-4">
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
            sorted.map((a: any) => <AchievementCard key={a.id} achievement={a} />)
          )}
        </div>
      </div>
    </div>
  );
}
