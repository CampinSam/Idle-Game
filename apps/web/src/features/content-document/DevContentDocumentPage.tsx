/**
 * DEV ONLY — temporary test harness for ContentDocumentRenderer.
 * Remove when Task #722 (wire MissionPanel + GameModal) is complete.
 */
import { useState } from 'react';
import type { ContentDocumentContext, ContentDocumentDefinition } from '@derp/shared';
import { ContentDocumentRenderer } from './ContentDocumentRenderer';

const MOCK_DEF: ContentDocumentDefinition = {
  id: 'mission_planning_document',
  version: 1,
  context: { missionMode: 'planning', teamMode: 'editable', rewardMode: 'preview' },
  blocks: [
    { type: 'mission_hero' },
    { type: 'mission_requirements' },
    { type: 'mission_stats' },
    { type: 'mission_synergy' },
    { type: 'team_section' },
    { type: 'narrative_text', text: 'This is a sample mission narrative shown in planning mode.' },
    { type: 'divider' },
    { type: 'key_value_row', label: 'Category', value: 'Exploration' },
    { type: 'rich_text', content: 'Additional rich text block content.' },
  ],
};

const MOCK_IN_PROGRESS_DEF: ContentDocumentDefinition = {
  id: 'mission_in_progress_document',
  version: 1,
  context: { missionMode: 'in_progress', teamMode: 'locked', rewardMode: 'preview' },
  blocks: [
    { type: 'mission_hero' },
    { type: 'mission_stats' },
    { type: 'mission_synergy' },
    { type: 'mission_timer' },
    { type: 'entity_roster' },
  ],
};

const MOCK_OUTCOME_DEF: ContentDocumentDefinition = {
  id: 'mission_outcome_document',
  version: 1,
  context: { missionMode: 'outcome', teamMode: 'locked', rewardMode: 'actual' },
  blocks: [
    { type: 'mission_hero' },
    { type: 'outcome_banner' },
    { type: 'reward_list' },
    { type: 'entity_roster' },
    { type: 'narrative_text', text: 'The team returned from a harrowing expedition.' },
  ],
};

const MOCK_DATA_PLANNING: Record<string, any> = {
  def: {
    id: 'mock-mission-1',
    name: 'The Sunken Archive',
    difficulty: 75,
    description: 'Delve into the submerged ruins to recover ancient tomes.',
    timer: { duration: 3600 },
    display: {},
    injuryRate: 0.2,
    tags: [{ text: 'Lore', color: '#7c3aed' }],
    missionCategoryDefId: 'cat-exploration',
    requirements: [],
  },
  currentCat: { id: 'cat-exploration', name: 'Exploration' },
  missionCategoryDefs: [{ id: 'cat-exploration', name: 'Exploration' }],
  missionPower: 85,
  difficulty: 75,
  successChance: 72,
  injuryChance: 18,
  injuryRate: 0.2,
  powerRatio: 0.53,
  synergy: null,
  previewRequirements: [
    { label: 'Min 2 entities', met: true },
    { label: 'Team Power ≥ 50', met: true },
  ],
  previewLoading: false,
  entities: [
    { id: 'e1', name: 'Aldric', level: 5, status: 'idle' },
    { id: 'e2', name: 'Seraphine', level: 3, status: 'idle' },
    { id: 'e3', name: 'Torvin', level: 7, status: 'mission' },
  ],
  selectedEntities: ['e1'],
  teamMax: 4,
  onToggle: (id: string) => console.log('[DevHarness] toggle entity:', id),
};

const MOCK_DATA_IN_PROGRESS: Record<string, any> = {
  ...MOCK_DATA_PLANNING,
  remainingMs: 1_234_567,
  progressPct: 38,
  isReady: false,
  rosterEntities: [
    { id: 'e1', name: 'Aldric', level: 5 },
    { id: 'e2', name: 'Seraphine', level: 3 },
  ],
};

const MOCK_DATA_OUTCOME: Record<string, any> = {
  ...MOCK_DATA_PLANNING,
  isSuccess: true,
  results: {
    success: true,
    qualityLabel: 'Outstanding Victory',
    rewards: [
      { type: 'currency', name: 'Gold', amount: 450 },
      { type: 'item', name: 'Ancient Tome', amount: 1 },
      { type: 'entity_xp', name: 'Entity XP', amount: 120 },
    ],
    entityResults: [
      { id: 'e1', name: 'Aldric', injured: false, leveledUp: true, oldLevel: 5, newLevel: 6, xpGained: 120 },
      { id: 'e2', name: 'Seraphine', injured: true, leveledUp: false, oldLevel: 3, newLevel: 3, xpGained: 80 },
    ],
  },
  rosterEntities: [
    { id: 'e1', name: 'Aldric', level: 6 },
    { id: 'e2', name: 'Seraphine', level: 3 },
  ],
  narrativeTexts: ['The archive yielded its secrets. Aldric levelled up. Seraphine was injured in a cave-in.'],
};

type Tab = 'planning' | 'in_progress' | 'outcome' | 'fetch';

export default function DevContentDocumentPage() {
  const [tab, setTab] = useState<Tab>('planning');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'planning', label: 'Planning' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'outcome', label: 'Outcome' },
    { id: 'fetch', label: 'Fetch (live)' },
  ];

  const defMap: Record<Tab, ContentDocumentDefinition | undefined> = {
    planning: MOCK_DEF,
    in_progress: MOCK_IN_PROGRESS_DEF,
    outcome: MOCK_OUTCOME_DEF,
    fetch: undefined,
  };

  const dataMap: Record<Tab, Record<string, any>> = {
    planning: MOCK_DATA_PLANNING,
    in_progress: MOCK_DATA_IN_PROGRESS,
    outcome: MOCK_DATA_OUTCOME,
    fetch: MOCK_DATA_PLANNING,
  };

  const contextMap: Record<Tab, ContentDocumentContext> = {
    planning: { missionMode: 'planning', teamMode: 'editable', rewardMode: 'preview' },
    in_progress: { missionMode: 'in_progress', teamMode: 'locked', rewardMode: 'preview' },
    outcome: { missionMode: 'outcome', teamMode: 'locked', rewardMode: 'actual' },
    fetch: { missionMode: 'planning', teamMode: 'editable', rewardMode: 'preview' },
  };

  return (
    <div
      className="min-h-screen p-4"
      style={{ background: 'linear-gradient(160deg,#1a1640 0%,#0f0a28 100%)' }}
    >
      <div className="max-w-md mx-auto">
        <div className="mb-4">
          <h1 className="font-cinzel text-[18px] font-black text-white mb-1">
            📄 ContentDocumentRenderer Dev Harness
          </h1>
          <p className="text-[11px] text-text-secondary">
            Task #721 — remove after Task #722 wires MissionPanel.
          </p>
        </div>

        <div className="flex gap-1.5 mb-4 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer border transition-all ${
                tab === t.id
                  ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white'
                  : 'bg-white/5 border-white/15 text-text-secondary hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(139,92,246,0.3)' }}>
          <ContentDocumentRenderer
            key={tab}
            definition={defMap[tab]}
            documentId={tab === 'fetch' ? 'mission_planning_document' : undefined}
            baseContext={contextMap[tab]}
            data={dataMap[tab]}
            className="flex flex-col gap-3 p-3"
          />
        </div>
      </div>
    </div>
  );
}
