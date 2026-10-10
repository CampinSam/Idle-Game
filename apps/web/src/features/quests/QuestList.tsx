import { useMemo, useState } from 'react';
import { useSyncQuests } from '../../hooks/useSyncSelectors';
import { QuestCard } from './QuestCard';
import { QuestMetaProgress } from './QuestMetaProgress';

// Human-readable label and display order for each cadence value.
const CADENCE_META: Record<string, { label: string; order: number }> = {
  daily: { label: 'Daily', order: 0 },
  weekly: { label: 'Weekly', order: 1 },
  oneoff: { label: 'Story', order: 2 },
};
const FALLBACK_LABEL = 'Other';

const STATUS_ORDER: Record<string, number> = {
  completed: 0,
  active: 1,
  not_started: 2,
  claimed: 3,
};

function sortQuests(quests: any[]): any[] {
  return [...quests].sort((a, b) => {
    const ao = STATUS_ORDER[a.status] ?? 4;
    const bo = STATUS_ORDER[b.status] ?? 4;
    return ao - bo;
  });
}

export default function QuestList() {
  const allQuests = useSyncQuests();

  // Exclude achievement-category entries — they live on the Achievements page.
  const quests = useMemo(
    () => (allQuests as any[]).filter((q: any) => q.questDef?.category !== 'achievement'),
    [allQuests],
  );

  // Derive tabs from the unique cadence values actually present in the data
  // so the tab list always reflects the server-supplied quest definitions.
  const tabs = useMemo(() => {
    const cadenceSet = new Set<string>();
    for (const q of quests) {
      const c = q.questDef?.cadence ?? 'oneoff';
      cadenceSet.add(c);
    }
    const derived = [...cadenceSet]
      .map((c) => ({
        cadence: c,
        label: CADENCE_META[c]?.label ?? FALLBACK_LABEL,
        order: CADENCE_META[c]?.order ?? 99,
      }))
      .sort((a, b) => a.order - b.order);

    return [{ cadence: 'all', label: 'All', order: -1 }, ...derived];
  }, [quests]);

  const [activeCadence, setActiveCadence] = useState<string>('all');

  // If the previously selected cadence tab disappears from the data, fall back to 'all'.
  const selectedCadence = tabs.some((t) => t.cadence === activeCadence) ? activeCadence : 'all';

  const filtered = useMemo(() => {
    if (selectedCadence === 'all') return sortQuests(quests);
    return sortQuests(quests.filter((q: any) => (q.questDef?.cadence ?? 'oneoff') === selectedCadence));
  }, [quests, selectedCadence]);

  const emptyMessages: Record<string, string> = {
    all: 'No quests available yet.',
    daily: 'No daily quests available — check back tomorrow!',
    weekly: 'No weekly quests available — check back Monday!',
    oneoff: 'No story quests yet.',
  };

  return (
    <div className="flex flex-col gap-2.5">
      <QuestMetaProgress quests={quests} />

      {tabs.length > 1 && (
        <div className="flex bg-black/25 border border-[rgba(139,92,246,0.12)] rounded-[10px] overflow-hidden">
          {tabs.map((t) => (
            <button
              key={t.cadence}
              className={`flex-1 py-2 px-1 text-[11px] font-bold tracking-[0.5px] uppercase bg-transparent border-b-2 cursor-pointer transition-[color,border-color] duration-150 ${
                selectedCadence === t.cadence
                  ? 'text-[#c4b5fd] border-b-derp-purple'
                  : 'text-text-secondary border-b-transparent'
              }`}
              onClick={() => setActiveCadence(t.cadence)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 px-5 text-text-secondary text-sm">
            {emptyMessages[selectedCadence] ?? 'No quests in this category.'}
          </div>
        ) : (
          filtered.map((q: any) => <QuestCard key={q.questDefId ?? q.id} quest={q} />)
        )}
      </div>
    </div>
  );
}
