import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useModal } from '../../../context/ModalContext';
import { MissionBuilder } from './MissionBuilder';
import { renderWithProviders, makeTestStore } from '../../../test/render';
import { api } from '../../../services/api';
import { applyPatches, setStatus } from '../../../store/syncSlice';
import { deferred, missionCategory, missionDef, missionJob, missionModal, missionPreview, pilotEntity } from '../../../test/fixtures/missionLifecycle';
vi.mock('../../../services/AudioEngine', () => ({ audioEngine: { play: vi.fn() } }));
vi.mock('../../../services/api', () => ({ api: { jobPreview: vi.fn(), sendCommand: vi.fn(), getModalSpec: vi.fn(), setToken: vi.fn() } }));
vi.mock('../../content-document/ContentDocumentRenderer', () => ({ ContentDocumentRenderer: ({ data }: any) => <div>{data.previewRequirements.map((r: any) => <span key={r.label}>{r.label}</span>)}</div> }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.jobPreview).mockResolvedValue(missionPreview() as any);
  vi.mocked(api.getModalSpec).mockResolvedValue(missionModal());
});
function mount() {
  const base = makeTestStore().getState();
  const store = makeTestStore({ ...base, game: { ...base.game, missionDefs: [missionDef], missionCategoryDefs: [missionCategory] },
    sync: { ...base.sync, status: 'connected', cursor: '1', entities: { [pilotEntity.id]: pilotEntity } } });
  const started = vi.fn();
  function ModalProbe() {
    const { currentModal } = useModal();
    return currentModal ? <div role="dialog">{currentModal.header?.title}</div> : null;
  }
  renderWithProviders(<><MissionBuilder defId={missionDef.id} initialSelectedEntities={[pilotEntity.id]} onMissionStarted={started} /><ModalProbe /></>, { store });
  return { store, started };
}
it('requires a fresh server preview after balance/reconnect changes and invalidates unavailable team members', async () => {
  const { store } = mount();
  const start = screen.getByRole('button', { name: /start mission/i });
  expect(start).toBeDisabled();
  await waitFor(() => expect(start).toBeEnabled());
  vi.mocked(api.jobPreview).mockResolvedValue(missionPreview({ canAfford: false }) as any);
  act(() => store.dispatch(applyPatches({ patches: [{ op: 'upsert', entity: 'currencyBalance', id: 'gold', data: { gold: 0 } }], cursor: '2' })));
  expect(start).toBeDisabled();
  await waitFor(() => expect(api.jobPreview).toHaveBeenCalledTimes(2));
  act(() => store.dispatch(setStatus('reconnecting')));
  expect(start).toBeDisabled();
  vi.mocked(api.jobPreview).mockResolvedValue(missionPreview() as any);
  act(() => store.dispatch(setStatus('connected')));
  await waitFor(() => expect(start).toBeEnabled());
  act(() => store.dispatch(applyPatches({ patches: [{ op: 'upsert', entity: 'entity', id: pilotEntity.id, data: { ...pilotEntity, status: 'mission' } }], cursor: '3' })));
  expect(start).toBeDisabled();
});
it('shows pending feedback, sends one start, and surfaces command errors', async () => {
  const pending = deferred<any>();
  vi.mocked(api.sendCommand).mockReturnValue(pending.promise);
  const { started } = mount();
  const start = screen.getByRole('button', { name: /start mission/i });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.click(start); fireEvent.click(start);
  expect(api.sendCommand).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled();
  await act(async () => pending.reject(new Error('Team changed; select another scout')));
  expect(screen.getByRole('alert')).toHaveTextContent('Team changed');
  expect(started).not.toHaveBeenCalled();
});
it('applies the started job and opens its current server dialog', async () => {
  vi.mocked(api.sendCommand).mockResolvedValue({ patches: [{ op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob() }], ui: [], cursor: { delta: '2' } });
  const { store, started } = mount();
  await waitFor(() => expect(screen.getByRole('button', { name: /start mission/i })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /start mission/i }));
  await waitFor(() => expect(started).toHaveBeenCalledOnce());
  expect(store.getState().sync.jobs['job-pilot'].status).toBe('active');
  expect(api.getModalSpec).toHaveBeenCalledWith({ jobId: 'job-pilot' });
  expect(screen.getByRole('dialog')).toHaveTextContent('Survey in progress');
});

it.each(['command', 'spec'].flatMap(boundary => ['back', 'switch', 'unmount', 'switch-back'].map(exit => ({ boundary, exit }))))(
  'discards stale start UI after $exit during $boundary, retaining job patches', async ({ boundary, exit }) => {
    const pendingCommand = deferred<any>();
    const pendingSpec = deferred<any>();
    const response = { patches: [{ op: 'upsert' as const, entity: 'job' as const, id: 'job-pilot', data: missionJob() }], ui: [], cursor: { delta: '2' } };
    vi.mocked(api.sendCommand).mockReturnValue(boundary === 'command' ? pendingCommand.promise : Promise.resolve(response));
    vi.mocked(api.getModalSpec).mockReturnValue(pendingSpec.promise);
    const started = vi.fn(); const back = vi.fn();
    const other = { ...missionDef, id: 'other-mission', name: 'Other mission' };
    function Harness() {
      const [defId, setDefId] = useState(missionDef.id);
      const [visible, setVisible] = useState(true);
      const { currentModal } = useModal();
      return <>
        <button onClick={() => setDefId(other.id)}>Switch</button>
        <button onClick={() => setDefId(missionDef.id)}>Return</button>
        <button onClick={() => setVisible(false)}>Unmount</button>
        {visible && <MissionBuilder defId={defId} initialSelectedEntities={[pilotEntity.id]} onBack={back} onMissionStarted={started} />}
        {currentModal && <div role="dialog">{currentModal.header?.title}</div>}
      </>;
    }
    const base = makeTestStore().getState();
    const store = makeTestStore({ ...base, game: { ...base.game, missionDefs: [missionDef, other], missionCategoryDefs: [missionCategory] },
      sync: { ...base.sync, status: 'connected', cursor: '1', entities: { [pilotEntity.id]: pilotEntity } } });
    renderWithProviders(<Harness />, { store });
    await waitFor(() => expect(screen.getByRole('button', { name: /start mission/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /start mission/i }));
    if (boundary === 'spec') await waitFor(() => expect(api.getModalSpec).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: exit === 'back' ? /← Back/ : exit === 'unmount' ? 'Unmount' : 'Switch' }));
    if (exit === 'switch-back') fireEvent.click(screen.getByRole('button', { name: 'Return' }));
    if (boundary === 'command') await act(async () => pendingCommand.resolve(response));
    await act(async () => pendingSpec.resolve(missionModal()));
    expect(store.getState().sync.jobs['job-pilot'].status).toBe('active');
    expect(started).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    if (boundary === 'command') expect(api.getModalSpec).not.toHaveBeenCalled();
    if (exit === 'back') expect(back).toHaveBeenCalledOnce();
  },
);
