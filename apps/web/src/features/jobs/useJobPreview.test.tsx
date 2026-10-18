import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useJobPreview } from './useJobPreview';
import { api } from '../../services/api';
import { deferred, missionPreview } from '../../test/fixtures/missionLifecycle';
vi.mock('../../services/api', () => ({ api: { jobPreview: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
it('invalidates immediately when live inputs change and ignores a late response for an old selection', async () => {
  const old = deferred<ReturnType<typeof missionPreview>>();
  vi.mocked(api.jobPreview).mockReturnValueOnce(old.promise as any).mockResolvedValue(missionPreview({ canAfford: false }) as any);
  const { result, rerender } = renderHook(({ ids, revision }) => useJobPreview({ jobType: 'mission', defId: 'm', entityIds: ids, revision, debounceMs: 0 }),
    { initialProps: { ids: ['a'], revision: '1' } });
  await waitFor(() => expect(api.jobPreview).toHaveBeenCalledTimes(1));
  rerender({ ids: ['b'], revision: '2' });
  expect(result.current.preview).toBeNull();
  await waitFor(() => expect(result.current.preview?.canAfford).toBe(false));
  await act(async () => old.resolve(missionPreview()));
  expect(result.current.preview?.canAfford).toBe(false);
  const next = deferred<ReturnType<typeof missionPreview>>();
  vi.mocked(api.jobPreview).mockReturnValue(next.promise as any);
  rerender({ ids: ['b'], revision: '3' });
  expect(result.current.preview).toBeNull();
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(api.jobPreview).toHaveBeenCalledTimes(3));
  await act(async () => next.reject(new Error('Preview unavailable')));
  expect(result.current.error).toBe('Preview unavailable');
  expect(result.current.preview).toBeNull();
});
