import { useState, useMemo } from 'react';
import { useSyncQuests } from '../../hooks/useSyncSelectors';
import { QuestCard } from './QuestCard';
import { QuestMetaProgress } from './QuestMetaProgress';
import './Quests.css';

const TABS = ['All', 'Active', 'Completed', 'Claimed'] as const;
type Tab = typeof TABS[number];

const TAB_FILTER: Record<Tab, (q: any) => boolean> = {
  All: () => true,
  Active: (q) => q.status === 'active',
  Completed: (q) => q.status === 'completed',
  Claimed: (q) => q.status === 'claimed',
};

export default function QuestList() {
  const quests = useSyncQuests();
  const [tab, setTab] = useState<Tab>('All');

  const filtered = useMemo(() => {
    const fn = TAB_FILTER[tab];
    return quests
      .filter(fn)
      .sort((a: any, b: any) => {
        const order = { completed: 0, active: 1, claimed: 2 };
        return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
      });
  }, [quests, tab]);

  return (
    <div className="quest-section">
      <span className="quest-section-title">Quests</span>

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
            {tab === 'All' ? 'No quests available yet.' : `No ${tab.toLowerCase()} quests.`}
          </div>
        ) : (
          filtered.map((q: any) => <QuestCard key={q.id} quest={q} />)
        )}
      </div>
    </div>
  );
}
