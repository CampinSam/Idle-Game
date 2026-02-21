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

  dispatchEvent: (data: { userId: string; defId: string; payload: any }) =>
    adminRequest<any>('/events/dispatch', { method: 'POST', body: JSON.stringify(data) }),
  sendGift: (data: { userId: string; giftDefId: string }) =>
    adminRequest<any>('/gifts/send', { method: 'POST', body: JSON.stringify(data) }),
};
