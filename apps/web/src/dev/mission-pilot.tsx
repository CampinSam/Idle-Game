// Separate Vite development entry. Not imported by the application or production build.
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../store';
import { api } from '../services/api';
import { audioEngine } from '../services/AudioEngine';
import { applyPatches, setStatus, setTickSync } from '../store/syncSlice';
import { fetchMissionDefs, fetchMissionCategoryDefs } from '../store/gameSlice';
import { ModalProvider } from '../context/ModalContext';
import { TickEngineProvider } from '../tick';
import MissionsPage from '../features/missions/MissionsPage';
import GameModalHost from '../components/modal/GameModalHost';
import { missionCategory, missionDef, missionJob, missionModal, missionPreview, pilotEntity } from '../test/fixtures/missionLifecycle';
import { assertCommandResponse, type ModalSpecV1 } from '@derp/shared';
import '../index.css';

if (!import.meta.env.DEV) throw new Error('Local mission fixtures are development-only');
// Fail closed: this entry never falls through to an application API.
window.fetch = async () => { throw new Error('Network fetch is disabled in the local mission pilot'); };
audioEngine.play = () => {};
let cursor = 1;
let phase = 0;
let status = 'active';
let started = false;
let affordable = true;
let startCount = 0;
const twoPhase = new URLSearchParams(location.search).get('phases') !== '1';
const definition = { ...missionDef, mode: twoPhase ? 'multi_phase' : 'single', phases: twoPhase ? [{ name: 'Survey', count: 1 }, { name: 'Return', count: 1 }] : [] };
const pause = () => new Promise(resolve => setTimeout(resolve, 180));
function patchJob() {
  store.dispatch(applyPatches({ patches: [{ op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob(status, phase) }], cursor: String(++cursor) }));
}
function currentModal(): ModalSpecV1 {
  const spec = missionModal(status, phase);
  spec.pages[0].body = status === 'active'
    ? [{ type: 'timer', endsAt: new Date(Date.now() + 60000).toISOString(), wallClock: true, label: 'Time remaining' }]
    : [{ type: 'richText', doc: [{ t: 'p', c: [{ t: 'text', v: 'The scout recorded the crystal marsh conditions. '.repeat(18) }] }] }];
  return spec;
}
const document = {
  id: 'mission_planning_document', version: 1,
  context: { missionMode: 'planning', teamMode: 'editable', rewardMode: 'preview', missionPresentation: { version: 1, spacing: 'compact', variant: 'panel' } },
  blocks: [{ type: 'mission_hero' }, { type: 'mission_planning_sticky' }, { type: 'team_section' }, { type: 'reward_list' }],
};
Object.assign(api, {
  getMissionDefinitions: async () => [definition], getMissionCategoryDefs: async () => [missionCategory],
  getScreenComposition: async () => ({ id: 'mission-screen', type: 'screen_composition', key: 'missions', version: 1, isActive: true,
    data: { layout: { layoutType: 'pass_through' }, sections: [{ id: 'missions', component: 'MissionBrowser', priority: 1 }] } }),
  getContentDocument: async () => document,
  jobPreview: async () => { await pause(); return missionPreview({ canAfford: affordable }); },
  getModalSpec: async () => { await pause(); return currentModal(); },
  getJob: async () => ({ ...missionJob(status, phase), skipInfo: { skipable: false } }),
  sendCommand: async ({ type }: { type: string }) => {
    await pause();
    if (type === 'StartMission') { startCount++; started = true; status = 'active'; phase = 0; }
    else if (type === 'ContinueMission') { phase = 1; status = 'active'; }
    else if (type === 'CompleteMission') status = 'completed';
    else throw new Error(`Unsupported fixture command: ${type}`);
    const response = { patches: [{ op: 'upsert' as const, entity: 'job' as const, id: 'job-pilot', data: missionJob(status, phase) }], ui: [], cursor: { delta: String(++cursor) } };
    assertCommandResponse(response);
    return response;
  },
});
store.dispatch(setStatus('connected'));
store.dispatch(applyPatches({ patches: Array.from({ length: 12 }, (_, i) => ({ op: 'upsert' as const, entity: 'entity' as const, id: `bird-${i}`,
  data: { ...pilotEntity, id: `bird-${i}`, name: i ? `Field scout ${i}` : 'Scout with a deliberately long translated name', rarity: 'COMMON', progression: { level: 1 }, speciesId: 'bird' } })), cursor: String(cursor) }));
store.dispatch(setTickSync({ currentTick: 100, tickRate: 1, serverTime: new Date().toISOString(), boosts: [], receivedAt: Date.now() }));
store.dispatch(fetchMissionDefs()); store.dispatch(fetchMissionCategoryDefs());
Object.assign(window, { missionPilot: {
  advance() { if (!started) return; status = twoPhase && phase === 0 ? 'phase_ready' : 'ready_notified'; patchJob(); },
  reconnect() { store.dispatch(setStatus('reconnecting')); setTimeout(() => store.dispatch(setStatus('connected')), 200); },
  balance() { affordable = !affordable; store.dispatch(applyPatches({ patches: [{ op: 'upsert', entity: 'currencyBalance', id: 'gold', data: { gold: affordable ? 10 : 0 } }], cursor: String(++cursor) })); },
  busy() { const id = 'bird-0'; store.dispatch(applyPatches({ patches: [{ op: 'upsert', entity: 'entity', id, data: { ...store.getState().sync.entities[id], status: 'mission' } }], cursor: String(++cursor) })); },
  get startCount() { return startCount; },
} });
ReactDOM.createRoot(window.document.getElementById('root')!).render(
  <Provider store={store}><MemoryRouter><ModalProvider><TickEngineProvider>
    <div className="flex flex-col h-[100dvh] overflow-hidden p-2 gap-2">
      <div className="text-xs flex-shrink-0">Local mission fixtures · no backend</div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><MissionsPage /></div>
    </div><GameModalHost />
  </TickEngineProvider></ModalProvider></MemoryRouter></Provider>,
);
