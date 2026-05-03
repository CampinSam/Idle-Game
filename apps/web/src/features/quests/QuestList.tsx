import { useState, useMemo } from 'react';
import { useSyncQuests } from '../../hooks/useSyncSelectors';
import { QuestCard } from './QuestCard';
import { QuestMetaProgress } from './QuestMetaProgress';
import './Quests.css';

// Cadence tabs replace the old status tabs (All/Active/Completed/Claimed).
// Daily/weekly quests are fundamentally different player-facing content
// from one-off story quests, so they get their own filter dimensions.
// Within each cadence tab, completed quests sort to the top so the player
// can claim them at a glance.
const TABS = ['Daily', 'Weekly', 'Story', 'All'] as const;
type Tab = typeof TABS[number];

const TAB_FILTER: Record<Tab, (q: any) => boolean> = {
  Daily: (q) => q.questDef?.cadence === 'daily',
  Weekly: (q) => q.questDef?.cadence === 'weekly',
  // "Story" = legacy one-off quests. Treat missing cadence as oneoff so
  // pre-migration quests still show up.
  Story: (q) =>
    q.questDef?.cadence === 'oneoff' || q.questDef?.cadence == null,
  All: () => true,
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
    <div className="quest-section">
      <QuestMetaProgress quests={quests} />

      <div className="quest-tab-bar">
        {TABS.map((t) => (
          <button
            key={t}
            className={`quest-tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="quest-list">
        {filtered.length === 0 ? (
          <div className="quest-empty">
            {tab === 'Daily' && 'No daily quests available — check back tomorrow!'}
            {tab === 'Weekly' && 'No weekly quests available — check back Monday!'}
            {tab === 'Story' && 'No story quests yet.'}
            {tab === 'All' && 'No quests available yet.'}
          </div>
        ) : (
          filtered.map((q: any) => <QuestCard key={q.id} quest={q} />)
        )}
      </div>
    </div>
  );
}
