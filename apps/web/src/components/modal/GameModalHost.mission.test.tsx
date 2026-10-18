import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useModal } from '../../context/ModalContext';
import { renderWithProviders, makeTestStore } from '../../test/render';
import { api } from '../../services/api';
import { applyPatches, setStatus, resetSync } from '../../store/syncSlice';
import GameModalHost from './GameModalHost';
import { missionJob, missionModal, deferred } from '../../test/fixtures/missionLifecycle';
vi.mock('../../services/AudioEngine', () => ({ audioEngine: { play: vi.fn() } }));
vi.mock('../../services/api', () => ({ api: { getModalSpec: vi.fn(), sendCommand: vi.fn(), setToken: vi.fn() } }));
vi.mock('./GameModal', () => ({ default: ({ spec, onAction, onRequestClose }: any) => <div role="dialog"><h2>{spec.header.title}</h2>{spec.buttons.map((b: any) => <button key={b.id} onClick={() => onAction(b.action)}>{b.label}</button>)}<button onClick={onRequestClose}>Dismiss</button></div> }));
function Harness() {
  const { pushModal } = useModal();
  return <><button onClick={() => pushModal(missionModal())}>Open mission</button><GameModalHost /></>;
}
beforeEach(() => vi.clearAllMocks());
function mount() {
  const base = makeTestStore().getState();
  const store = makeTestStore({ ...base, sync: { ...base.sync, status: 'connected', cursor: '1', jobs: { 'job-pilot': missionJob() } } });
  renderWithProviders(<Harness />, { store });
  fireEvent.click(screen.getByText('Open mission'));
  let cursor = 1;
  const patch = (status: string, phase = 0) => act(() => store.dispatch(applyPatches({ patches: [{ op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob(status, phase) }], cursor: String(++cursor) })));
  return { store, patch };
}
it.each([false, true])('keeps an open %s two-phase mission current and freezes its historical report', async (twoPhase) => {
  const { store, patch } = mount();
  if (twoPhase) {
    vi.mocked(api.getModalSpec).mockResolvedValue(missionModal('phase_ready'));
    patch('phase_ready');
    await screen.findByText('Choose the next phase');
    vi.mocked(api.getModalSpec).mockResolvedValue(missionModal('active', 1));
    vi.mocked(api.sendCommand).mockResolvedValue({ patches: [{ op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob('active', 1) }], ui: [], cursor: { delta: '3' } });
    fireEvent.click(screen.getByText('Continue'));
    await screen.findByText('Survey in progress — phase 2');
    expect(api.sendCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'ContinueMission' }));
  }
  vi.mocked(api.getModalSpec).mockResolvedValue(missionModal('ready_notified', twoPhase ? 1 : 0));
  patch('ready_notified', twoPhase ? 1 : 0);
  await screen.findByText('Mission ready');
  vi.mocked(api.getModalSpec).mockResolvedValue(missionModal('completed'));
  vi.mocked(api.sendCommand).mockResolvedValue({ patches: [{ op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob('completed') }], ui: [], cursor: { delta: '4' } });
  fireEvent.click(screen.getByText('Collect'));
  await screen.findByText('Field report: earned 10 crystals');
  const calls = vi.mocked(api.getModalSpec).mock.calls.length;
  act(() => store.dispatch(setStatus('reconnecting')));
  act(() => store.dispatch(setStatus('connected')));
  patch('completed', 99);
  expect(api.getModalSpec).toHaveBeenCalledTimes(calls);
  expect(screen.getByText('Field report: earned 10 crystals')).toBeInTheDocument();
});
it('refreshes an active dialog on reconnect/reset and never resurrects a dismissed dialog', async () => {
  const { store, patch } = mount();
  vi.mocked(api.getModalSpec).mockResolvedValue(missionModal('active'));
  act(() => store.dispatch(setStatus('reconnecting')));
  act(() => store.dispatch(setStatus('connected')));
  await waitFor(() => expect(api.getModalSpec).toHaveBeenCalledOnce());
  act(() => { store.dispatch(resetSync()); store.dispatch(setStatus('bootstrapping')); });
  patch('phase_ready');
  vi.mocked(api.getModalSpec).mockResolvedValue(missionModal('phase_ready'));
  act(() => store.dispatch(setStatus('connected')));
  await screen.findByText('Choose the next phase');
  const pending = deferred<any>();
  vi.mocked(api.getModalSpec).mockReturnValue(pending.promise);
  patch('ready_notified');
  fireEvent.click(screen.getByText('Dismiss'));
  await act(async () => pending.resolve(missionModal('ready_notified')));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
