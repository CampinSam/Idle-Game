import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi, clearAdminToken, setAdminToken } from './adminApi';

describe('adminApi media and enum requests', () => {
  beforeEach(() => {
    setAdminToken('admin-test-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    clearAdminToken();
    vi.unstubAllGlobals();
  });

  it('lists media through the admin endpoint', async () => {
    const assets = [{ assetKey: '/images/example.png' }];
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(assets), { status: 200 }));

    await expect(adminApi.listMedia()).resolves.toEqual(assets);
    expect(fetch).toHaveBeenCalledWith('/api/admin/media/list', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer admin-test-token' }),
    }));
  });

  it('uploads multipart media to the existing target directory endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ assetKey: '/images/icons/icon.png' }), { status: 200 }));
    const file = new File(['image'], 'icon.png', { type: 'image/png' });

    await expect(adminApi.uploadMedia(file, 'images/icons')).resolves.toEqual({
      assetKey: '/images/icons/icon.png',
    });

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/admin/media/upload?targetDir=images%2Ficons');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({ Authorization: 'Bearer admin-test-token' });
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get('file')).toBe(file);
  });

  it('preserves the upload API error message', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'Unsupported image' }), { status: 400 }));

    await expect(adminApi.uploadMedia(new File(['image'], 'icon.png'), 'images'))
      .rejects.toThrow('Unsupported image');
  });

  it('loads enum metadata through the admin adapter without changing its endpoint', async () => {
    const enums = { Status: ['ACTIVE'] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(enums), { status: 200 }));

    await expect(adminApi.getEnumMetadata()).resolves.toEqual(enums);
    expect(fetch).toHaveBeenCalledWith('/api/meta/enums', {
      headers: { Authorization: 'Bearer admin-test-token' },
    });
  });
});