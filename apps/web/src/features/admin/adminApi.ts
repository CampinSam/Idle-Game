const API_BASE = '/api/admin';

let adminKey = sessionStorage.getItem('adminKey') || '';

export function setAdminKey(key: string) {
  adminKey = key;
  sessionStorage.setItem('adminKey', key);
}

export function getAdminKey() {
  return adminKey;
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Key': adminKey,
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const adminApi = {
  getTables: () => adminRequest<{ key: string; name: string; table: string }[]>('/tables'),
  list: (table: string) => adminRequest<any[]>(`/${table}`),
  get: (table: string, id: string) => adminRequest<any>(`/${table}/${id}`),
  create: (table: string, data: any) =>
    adminRequest<any>(`/${table}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (table: string, id: string, data: any) =>
    adminRequest<any>(`/${table}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (table: string, id: string) =>
    adminRequest<any>(`/${table}/${id}`, { method: 'DELETE' }),
  listBoosts: () => adminRequest<any[]>('/boosts/list'),
  createBoost: (data: { name: string; description?: string; multiplier: number; durationMinutes: number }) =>
    adminRequest<any>('/boosts/create', { method: 'POST', body: JSON.stringify(data) }),
  updateBoost: (id: string, data: { name?: string; description?: string }) =>
    adminRequest<any>(`/boosts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancelBoost: (id: string) =>
    adminRequest<any>(`/boosts/${id}`, { method: 'DELETE' }),

  searchPlayers: (q: string) => adminRequest<any[]>(`/players/search?q=${encodeURIComponent(q)}`),
  getPlayer: (id: string) => adminRequest<any>(`/players/${id}`),
  updatePlayer: (id: string, data: any) =>
    adminRequest<any>(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setPlayerCurrency: (id: string, currencyId: string, balance: string) =>
    adminRequest<any>(`/players/${id}/currency`, { method: 'PUT', body: JSON.stringify({ currencyId, balance }) }),
  resetPlayer: (id: string) =>
    adminRequest<any>(`/players/${id}/reset`, { method: 'POST' }),

  sendNotification: (data: { userId: string; type: string; category: string; priority: string; title: string; body: string }) =>
    adminRequest<any>('/notifications/send', { method: 'POST', body: JSON.stringify(data) }),

  listRecentJobs: (limit = 10) => adminRequest<any[]>(`/jobs/recent?limit=${limit}`),

  dispatchEvent: (data: { userId: string; defId: string; payload: any }) =>
    adminRequest<any>('/events/dispatch', { method: 'POST', body: JSON.stringify(data) }),
  sendGift: (data: { userId: string; giftDefId: string }) =>
    adminRequest<any>('/gifts/send', { method: 'POST', body: JSON.stringify(data) }),

  getPlayerJobs: (id: string) => adminRequest<any[]>(`/players/${id}/jobs`),
  forceCompleteJob: (id: string, jobId: string) =>
    adminRequest<any>(`/players/${id}/jobs/${jobId}/force-complete`, { method: 'POST' }),

  grantItems: (id: string, itemId: string, quantity: number) =>
    adminRequest<any>(`/players/${id}/items`, { method: 'POST', body: JSON.stringify({ itemId, quantity }) }),
  getPlayerItems: (id: string) => adminRequest<any[]>(`/players/${id}/items`),
  listItemDefs: () => adminRequest<any[]>('/item-defs'),

  updatePlayerEntity: (id: string, entityId: string, data: { stats?: any; level?: number; name?: string }) =>
    adminRequest<any>(`/players/${id}/entities/${entityId}`, { method: 'PUT', body: JSON.stringify(data) }),

  forceSettleLocation: (id: string, locationId: string) =>
    adminRequest<any>(`/players/${id}/locations/${locationId}/settle`, { method: 'POST' }),

  getPlayerEffects: (id: string) => adminRequest<any[]>(`/players/${id}/effects`),
  deletePlayerEffect: (id: string, effectId: string) =>
    adminRequest<any>(`/players/${id}/effects/${effectId}`, { method: 'DELETE' }),

  getPlayerTelemetry: (id: string, limit = 30) =>
    adminRequest<any[]>(`/players/${id}/telemetry?limit=${limit}`),

  listIcons: () => adminRequest<any[]>('/media/icons'),
  listSystemIcons: () => adminRequest<any[]>('/media/system-icons'),
  createSystemIconDef: (data: { id: string; name: string }) =>
    adminRequest<any>('/media/system-icons', { method: 'POST', body: JSON.stringify(data) }),
  deleteSystemIconDef: (key: string) =>
    adminRequest<any>(`/media/system-icons/${encodeURIComponent(key)}`, { method: 'DELETE' }),

  getBalanceBundle: () => adminRequest<{
    entityDefinitions: Array<{ id: string; name: string; speciesId: string; slots: Record<string, string[]> }>;
    traitDefinitions: Record<string, { archetype: string; slotStats: Record<string, Record<string, number>>; scaling: Record<string, number>; rarityMultiplier: number }>;
  }>('/balance/bundle'),

  testOutcome: (
    spec: any,
    opts: { userId?: string; seed?: string; iterations?: number } = {},
  ) =>
    adminRequest<{
      iterations: number;
      pickedUser: { id: string; username: string | null; keeperLevel: number; flagCount: number } | null;
      runs: Array<{
        resolved: Array<{ entry: any; amount?: number }>;
        flags: Array<{ entry: any }>;
        texts: string[];
      }>;
      aggregate: {
        entries: Array<{
          type: string;
          key: string | null;
          count: number;
          totalAmount: number;
          minAmount: number;
          maxAmount: number;
        }>;
        flags: Array<{
          operation: string;
          key: string;
          count: number;
          sampleValues: unknown[];
        }>;
        texts: Array<{ message: string; count: number }>;
      };
    }>('/outcomes/test', {
      method: 'POST',
      body: JSON.stringify({ spec, ...opts }),
    }),

  listSoundDefs: () => adminRequest<any[]>('/audio/sounds'),
  createSoundDef: (data: { key: string; name: string; bus: string; fileKey?: string; description?: string }) =>
    adminRequest<any>('/audio/sounds', { method: 'POST', body: JSON.stringify(data) }),
  updateSoundDef: (id: string, data: { key?: string; name?: string; bus?: string; fileKey?: string; description?: string }) =>
    adminRequest<any>(`/audio/sounds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSoundDef: (id: string) =>
    adminRequest<any>(`/audio/sounds/${id}`, { method: 'DELETE' }),

  backfillEntityStats: () =>
    adminRequest<{ total: number; updated: number; skipped: number; failed: number }>(
      '/backfill/entity-stats',
      { method: 'POST' },
    ),

  listLocationDefs: () => adminRequest<any[]>('/locationDefinition'),
  listSeasons: () => adminRequest<any[]>('/season'),

  listSoundMappings: () => adminRequest<any[]>('/audio/mappings'),
  createSoundMapping: (data: { actionKey: string; soundDefId: string; weight?: number }) =>
    adminRequest<any>('/audio/mappings', { method: 'POST', body: JSON.stringify(data) }),
  updateSoundMapping: (id: string, data: { weight?: number }) =>
    adminRequest<any>(`/audio/mappings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSoundMapping: (id: string) =>
    adminRequest<any>(`/audio/mappings/${id}`, { method: 'DELETE' }),

  uploadAudio: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/audio/upload`, {
      method: 'POST',
      headers: { 'X-Admin-Key': adminKey },
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Upload failed: ${res.status}`);
      }
      return res.json();
    });
  },

  uploadMedia: (file: File, targetDir?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const url = targetDir
      ? `${API_BASE}/media/upload?targetDir=${encodeURIComponent(targetDir)}`
      : `${API_BASE}/media/upload`;
    return fetch(url, {
      method: 'POST',
      headers: { 'X-Admin-Key': adminKey },
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Upload failed: ${res.status}`);
      }
      return res.json();
    });
  },
};
