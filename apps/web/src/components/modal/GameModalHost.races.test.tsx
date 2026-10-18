import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useModal } from '../../context/ModalContext';
import { renderWithProviders, makeTestStore } from '../../test/render';
import { api } from '../../services/api';
import { applyPatches } from '../../store/syncSlice';
import { missionJob, missionModal, deferred } from '../../test/fixtures/missionLifecycle';
import GameModalHost from './GameModalHost';

vi.mock('../../services/AudioEngine', () => ({ audioEngine: { play: vi.fn() } }));
vi.mock('../../services/api', () => ({ api: { getModalSpec: vi.fn(), sendCommand: vi.fn(), setToken: vi.fn() } }));

const ready = missionModal('ready_notified');
const second = { ...missionModal('ready_notified'), id: 'second', telemetry: { jobId: 'job-second' }, header: { title: 'Second mission' }, buttons: [{ ...ready.buttons![0], action: { type: 'COMPLETE_JOB' as const, jobId: 'job-second' } }] };
function Harness({ generic }: { generic: boolean }) {
  const { pushModal, replaceModal, dismissModal } = useModal();
  const first = generic ? { ...ready, buttons: [{ ...ready.buttons![0], action: { type: 'EXECUTE_COMMAND' as const, command: 'CompleteMission', payload: { jobId: 'job-pilot' } } }] } : ready;
  return <>
    <button onClick={() => pushModal(first)}>Open</button>
    <button onClick={() => pushModal(second)}>Queue</button>
    <button onClick={() => replaceModal(second)}>Switch</button>
    <button onClick={() => dismissModal()}>Back</button>
    <GameModalHost />
  </>;
}
beforeEach(() => vi.resetAllMocks());
function mount(generic = false) {
  const base = makeTestStore().getState();
  const store = makeTestStore({ ...base, sync: { ...base.sync, status: 'connected', cursor: '1', jobs: {
    'job-pilot': missionJob('ready_notified'), 'job-second': { ...missionJob('ready_notified'), id: 'job-second' },
  } } });
  renderWithProviders(<Harness generic={generic} />, { store });
  fireEvent.click(screen.getByText('Open'));
  const patch = (phase: number) => act(() => store.dispatch(applyPatches({ patches: [{ op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob('ready_notified', phase) }] })));
  return { store, patch };
}
const commandResult = () => ({ patches: [{ op: 'upsert' as const, entity: 'job' as const, id: 'job-pilot', data: missionJob('completed') }], ui: [], cursor: { delta: '2' } });

it.each([false, true].flatMap(generic => ['close', 'back', 'switch', 'queue', 'reopen'].map(exit => ({ generic, exit }))))(
  'keeps authoritative patches but discards late command UI: $generic / $exit', async ({ generic, exit }) => {
    const { store } = mount(generic);
    const pending = deferred<any>();
    vi.mocked(api.sendCommand).mockReturnValue(pending.promise);
    const collect = screen.getByRole('button', { name: 'Collect' });
    fireEvent.click(collect);
    // Repeated interaction while pending must not send a second command.
    fireEvent.click(collect);
    expect(api.sendCommand).toHaveBeenCalledTimes(1);
    if (exit === 'queue') fireEvent.click(screen.getByText('Queue'));
    if (exit === 'switch') fireEvent.click(screen.getByText('Switch'));
    else if (exit === 'close') fireEvent.keyDown(window, { key: 'Escape' });
    else fireEvent.click(screen.getByText('Back'));
    if (exit === 'reopen') fireEvent.click(screen.getByText('Open'));
    await act(async () => pending.resolve(commandResult()));
    expect(store.getState().sync.jobs['job-pilot'].status).toBe('completed');
    // Reopening the same job may legitimately refresh from its authoritative patch.
    if (exit !== 'reopen') expect(api.getModalSpec).not.toHaveBeenCalled();
    if (['switch', 'queue'].includes(exit)) expect(screen.getByText('Second mission')).toBeInTheDocument();
    else if (exit === 'reopen') expect(screen.getByText('Mission ready')).toBeInTheDocument();
    else expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);

it.each(['resolve', 'reject'])('ignores stale refresh %s after switching to the next queued mission', async outcome => {
  const { patch } = mount();
  const pending = deferred<any>();
  vi.mocked(api.getModalSpec).mockReturnValue(pending.promise);
  patch(1);
  fireEvent.click(screen.getByText('Queue'));
  fireEvent.click(screen.getByText('Back'));
  await act(async () => outcome === 'resolve' ? pending.resolve(missionModal('completed')) : pending.reject(new Error('Old refresh failed')));
  expect(screen.getByText('Second mission')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collect' })).not.toBeDisabled();
});

it('clears an existing refresh error and blocking state for the next queued mission', async () => {
  const { patch } = mount();
  vi.mocked(api.getModalSpec).mockRejectedValue(new Error('Mission A refresh failed'));
  patch(1);
  await screen.findByText('Mission A refresh failed');
  expect(screen.getByRole('button', { name: 'Collect' })).toBeDisabled();
  fireEvent.click(screen.getByText('Queue'));
  fireEvent.click(screen.getByText('Back'));
  expect(screen.queryByText('Mission A refresh failed')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collect' })).not.toBeDisabled();
});

it.each(['resolve', 'reject'])('ignores an older refresh %s after a newer successful refresh', async outcome => {
  const { patch } = mount();
  const older = deferred<any>();
  vi.mocked(api.getModalSpec).mockReturnValueOnce(older.promise).mockResolvedValueOnce(missionModal('phase_ready'));
  patch(1);
  patch(2);
  await screen.findByText('Choose the next phase');
  await act(async () => outcome === 'resolve' ? older.resolve(missionModal('completed')) : older.reject(new Error('Stale failure')));
  expect(screen.getByText('Choose the next phase')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
});

it('allows a new interaction after a completed command and preserves queued dialogs', async () => {
  mount();
  vi.mocked(api.sendCommand).mockResolvedValue(commandResult());
  vi.mocked(api.getModalSpec).mockResolvedValue(missionModal('completed'));
  fireEvent.click(screen.getByText('Collect'));
  await screen.findByText('Field report: earned 10 crystals');
  fireEvent.click(screen.getByText('Queue'));
  fireEvent.click(screen.getByText('Back'));
  fireEvent.click(screen.getByText('Collect'));
  await waitFor(() => expect(api.sendCommand).toHaveBeenCalledTimes(2));
});

it.each(['close', 'switch', 'queue'])('does not leak a late command failure after %s', async exit => {
  mount(true);
  const pending = deferred<any>();
  vi.mocked(api.sendCommand).mockReturnValue(pending.promise);
  fireEvent.click(screen.getByText('Collect'));
  if (exit === 'queue') fireEvent.click(screen.getByText('Queue'));
  fireEvent.click(screen.getByText(exit === 'switch' ? 'Switch' : 'Back'));
  await act(async () => pending.reject(new Error('Old command failed')));
  expect(screen.queryByText('Old command failed')).not.toBeInTheDocument();
  if (exit !== 'close') expect(screen.getByRole('button', { name: 'Collect' })).not.toBeDisabled();
});

it('does not duplicate a pending command after closing and reopening the same job', async () => {
  mount();
  const pending = deferred<any>();
  vi.mocked(api.sendCommand).mockReturnValue(pending.promise);
  fireEvent.click(screen.getByText('Collect'));
  fireEvent.click(screen.getByText('Back'));
  fireEvent.click(screen.getByText('Open'));
  fireEvent.click(screen.getByText('Collect'));
  await screen.findByText('A command is already in progress');
  expect(api.sendCommand).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(commandResult()));
});
