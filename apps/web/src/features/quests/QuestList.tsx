import { useState, useMemo } from 'react';
import { useSyncQuests } from '../../hooks/useSyncSelectors';
import { QuestCard } from './QuestCard';
import { QuestMetaProgress } from './QuestMetaProgress';

const TABS = ['Daily', 'Weekly', 'Story', 'All'] as const;
type Tab = typeof TABS[number];

const TAB_FILTER: Record<Tab, (q: any) => boolean> = {
  Daily: (q) => q.questDef?.cadence === 'daily',
  Weekly: (q) => q.questDef?.cadence === 'weekly',
  Story: (q) =>
    q.questDef?.cadence === 'oneoff' || q.questDef?.cadence == null,
  All: () => true,
};

const TAB_EMPTY: Record<Tab, string> = {
  Daily: 'No daily quests available — check back tomorrow!',
  Weekly: 'No weekly quests available — check back Monday!',
  Story: 'No story quests yet.',
  All: 'No quests available yet.',
};

export default function QuestList() {
  const quests = useSyncQuests();
  const [tab, setTab] = useState<Tab>('Daily');

  const filtered = useMemo(() => {
    const fn = TAB_FILTER[tab];
    return quests
      .filter(fn)
      .sort((a: any, b: any) => {
        const order = { completed: 0, active: 1, claimed: 2 };
        return (
          (order[a.status as keyof typeof order] ?? 3) -
          (order[b.status as keyof typeof order] ?? 3)
        );
      });
  }, [quests, tab]);

  return (
    <div className="flex flex-col gap-2.5">
      <QuestMetaProgress quests={quests} />

      <div className="flex bg-black/25 border border-[rgba(139,92,246,0.12)] rounded-[10px] overflow-hidden">
        {TABS.map((t) => (
          <button
            key={t}
            className={`flex-1 py-2 px-1 text-[11px] font-bold tracking-[0.5px] uppercase bg-transparent border-b-2 cursor-pointer transition-[color,border-color] duration-150 ${
              tab === t
                ? 'text-[#c4b5fd] border-b-derp-purple'
                : 'text-text-secondary border-b-transparent'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 px-5 text-text-secondary text-sm">
            {TAB_EMPTY[tab]}
          </div>
        ) : (
          filtered.map((q: any) => <QuestCard key={q.id} quest={q} />)
        )}
      </div>
    </div>
  );
}
