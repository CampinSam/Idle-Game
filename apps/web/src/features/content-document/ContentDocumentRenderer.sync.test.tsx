import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContentDocumentRenderer } from './ContentDocumentRenderer';
import { useSurfaceContext } from './SurfaceContext';
import { renderWithProviders } from '../../test/render';
import { api } from '../../services/api';
import { deferred, missionJob } from '../../test/fixtures/missionLifecycle';
import { applyPatches, resetSync } from '../../store/syncSlice';
import { SyncEngine } from '../../services/SyncEngine';

vi.mock('../../services/api', () => ({ api: { getContentDocument: vi.fn(), bootstrap: vi.fn(), fetchDelta: vi.fn(), getToken: () => 'synthetic' } }));
vi.mock('./blockRegistry', () => ({ BLOCK_REGISTRY: { rich_text: ({ block }: any) => {
  const { context } = useSurfaceContext();
  return <p>{block.content} {context.teamMode}</p>;
} } }));
const doc = (id: string) => ({ id, version: 1, context: { missionMode: 'planning' as const, teamMode: 'editable' as const }, blocks: [{ type: 'rich_text' as const, content: id }] });
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

it('hides the previous document immediately on ID change and exposes a failed replacement', async () => {
  vi.mocked(api.getContentDocument).mockResolvedValueOnce(doc('first'));
  const view = renderWithProviders(<ContentDocumentRenderer documentId="first" />);
  await screen.findByText('first editable');
  const pending = deferred<any>();
  vi.mocked(api.getContentDocument).mockReturnValueOnce(pending.promise);
  view.rerender(<ContentDocumentRenderer documentId="second" />);
  expect(screen.queryByText('first editable')).not.toBeInTheDocument();
  await act(async () => pending.reject(new Error('Replacement unavailable')));
  expect(screen.getByText('Replacement unavailable')).toBeInTheDocument();
});

it('ignores late responses and clears fetched content when the source is removed', async () => {
  const old = deferred<any>();
  vi.mocked(api.getContentDocument).mockReturnValueOnce(old.promise).mockResolvedValueOnce(doc('second'));
  const view = renderWithProviders(<ContentDocumentRenderer documentId="first" />);
  view.rerender(<ContentDocumentRenderer documentId="second" />);
  await screen.findByText('second editable');
  await act(async () => old.resolve(doc('first')));
  expect(screen.queryByText('first editable')).not.toBeInTheDocument();
  view.rerender(<ContentDocumentRenderer />);
  expect(screen.queryByText('second editable')).not.toBeInTheDocument();
});

it('does not reuse an earlier fetch when switching from inline content back to the same ID', async () => {
  vi.mocked(api.getContentDocument).mockResolvedValueOnce(doc('old'));
  const view = renderWithProviders(<ContentDocumentRenderer documentId="same" />);
  await screen.findByText('old editable');
  view.rerender(<ContentDocumentRenderer documentId="same" definition={doc('inline')} />);
  expect(screen.getByText('inline editable')).toBeInTheDocument();
  const pending = deferred<any>();
  vi.mocked(api.getContentDocument).mockReturnValueOnce(pending.promise);
  view.rerender(<ContentDocumentRenderer documentId="same" />);
  expect(screen.queryByText('old editable')).not.toBeInTheDocument();
  await act(async () => pending.resolve(doc('fresh')));
  expect(screen.getByText('fresh editable')).toBeInTheDocument();
});

it.each(['active', 'phase_ready', 'failed', 'abandoned'])('does not treat %s or another job as collectible', status => {
  const { store } = renderWithProviders(<ContentDocumentRenderer definition={doc('scoped')} overrideRules={[{ on: 'job.ready', jobId: 'job-pilot', apply: { teamMode: 'locked' } }]} />);
  act(() => { store.dispatch(applyPatches({ patches: [
    { op: 'upsert', entity: 'job', id: 'other', data: { ...missionJob('ready_notified'), id: 'other' } },
    { op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob(status) },
  ] })); });
  expect(screen.getByText('scoped editable')).toBeInTheDocument();
});

it('applies and validates the effective designer presentation after live rules, then resets it', () => {
  const rules = [{ on: 'job.ready' as const, jobId: 'job-pilot', apply: { teamMode: 'locked' as const, missionPresentation: { version: 1 as const, spacing: 'compact' as const, variant: 'panel' as const } } }];
  const view = renderWithProviders(<ContentDocumentRenderer definition={doc('live')} overrideRules={rules} />);
  const patch = (status: string) => act(() => { view.store.dispatch(applyPatches({ patches: [{ op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob(status) }] })); });
  patch('ready_notified');
  expect(screen.getByText('live locked').parentElement).toHaveClass('gap-2', 'bg-bg-secondary');
  act(() => { view.store.dispatch(resetSync()); });
  expect(screen.getByText('live editable').parentElement).not.toHaveClass('gap-2');
  patch('ready');
  view.rerender(<ContentDocumentRenderer definition={doc('live')} overrideRules={[{ ...rules[0], apply: { missionPresentation: { version: 2 } as any } }]} />);
  expect(screen.getByRole('alert')).toHaveTextContent('version 1');
  expect(screen.queryByText('live editable')).not.toBeInTheDocument();
});

it('consumes an SSE delta through the real SyncEngine/store into declarative context', async () => {
  class Source {
    static current: Source;
    listeners = new Map<string, (e: any) => void>();
    constructor() { Source.current = this; }
    addEventListener(name: string, fn: any) { this.listeners.set(name, fn); }
    close() {}
  }
  vi.stubGlobal('EventSource', Source);
  vi.mocked(api.bootstrap).mockResolvedValue({ serverTime: Date.now(), snapshot: { player: null, state: {} }, cursor: { delta: '1' } } as any);
  vi.mocked(api.fetchDelta).mockResolvedValue({ from: '1', to: '2', patches: [{ op: 'upsert', entity: 'job', id: 'job-pilot', data: missionJob('ready_notified') }], ui: [] } as any);
  const { store } = renderWithProviders(<ContentDocumentRenderer definition={doc('stream')} overrideRules={[{ on: 'job.ready', jobId: 'job-pilot', apply: { teamMode: 'locked' } }]} />);
  const engine = new SyncEngine(store as any);
  try {
    await act(async () => engine.start());
    await act(async () => { Source.current.listeners.get('delta.available')?.({ data: JSON.stringify({ delta: '2' }) }); });
    await waitFor(() => expect(store.getState().sync.cursor).toBe('2'));
    expect(screen.getByText('stream locked')).toBeInTheDocument();
  } finally { act(() => engine.stop()); }
});
