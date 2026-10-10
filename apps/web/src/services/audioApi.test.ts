import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioApi } from './audioApi';

describe('audioApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests the existing first-party audio config endpoint', async () => {
    const response = new Response(JSON.stringify({ actionMap: {} }));
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(audioApi.getConfig()).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/audio/config');
  });
});