import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
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
  renderWithProviders(<MissionBuilder defId={missionDef.id} initialSelectedEntities={[pilotEntity.id]} onMissionStarted={started} />, { store });
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
});
