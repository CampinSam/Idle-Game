const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Request failed: ${res.status}`);
    }

    return res.json();
  }

  // Auth
  register(username: string, email: string, password: string) {
    return this.request<{ accessToken: string; player: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  login(email: string, password: string) {
    return this.request<{ accessToken: string; player: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  // Player
  getProfile() {
    return this.request<any>('/player/profile');
  }

  // Entities
  getEntities() {
    return this.request<any[]>('/entities');
  }

  getEntity(id: string) {
    return this.request<any>(`/entities/${id}`);
  }

  // Locations
  getLocations() {
    return this.request<any[]>('/locations');
  }

  getLocation(id: string) {
    return this.request<any>(`/locations/${id}`);
  }

  claimLocation(id: string) {
    return this.request<any>(`/locations/${id}/claim`, { method: 'POST' });
  }

  getAvailableBuildings(locationId: string) {
    return this.request<any>(`/locations/${locationId}/available-buildings`);
  }

  buildBuilding(locationId: string, buildingDefId: string) {
    return this.request<any>(`/locations/${locationId}/build`, {
      method: 'POST',
      body: JSON.stringify({ buildingDefId }),
    });
  }

  completeBuilding(locationId: string, buildingId: string) {
    return this.request<any>(`/locations/${locationId}/buildings/${buildingId}/complete`, {
      method: 'POST',
    });
  }

  upgradeBuilding(locationId: string, buildingId: string) {
    return this.request<any>(`/locations/${locationId}/buildings/${buildingId}/upgrade`, {
      method: 'POST',
    });
  }

  toggleBuilding(locationId: string, buildingId: string, enabled: boolean) {
    return this.request<any>(`/locations/${locationId}/buildings/${buildingId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  // Missions
  getMissionCategoryDefs() {
    return this.request<any[]>('/missions/categories');
  }

  getMissionDefinitions() {
    return this.request<any[]>('/missions/definitions');
  }

  getActiveMissions() {
    return this.request<any[]>('/missions/active');
  }

  getMissionHistory() {
    return this.request<any[]>('/missions/history');
  }

  startMission(defId: string, entityIds: string[]) {
    return this.request<any>('/missions/start', {
      method: 'POST',
      body: JSON.stringify({ defId, entityIds }),
    });
  }

  completeMission(missionId: string) {
    return this.request<any>(`/missions/${missionId}/complete`, {
      method: 'POST',
    });
  }

  markJobsNotified(jobIds: string[]) {
    return this.request<any>('/jobs/notify', {
      method: 'POST',
      body: JSON.stringify({ jobIds }),
    });
  }

  // Crafting
  getCraftingRecipes() {
    return this.request<any[]>('/crafting/recipes');
  }

  getActiveCraftingJobs() {
    return this.request<any[]>('/crafting/active');
  }

  startCrafting(recipeId: string, entityId: string) {
    return this.request<any>('/crafting/start', {
      method: 'POST',
      body: JSON.stringify({ recipeId, entityId }),
    });
  }

  collectCrafting(jobId: string) {
    return this.request<any>(`/crafting/${jobId}/collect`, {
      method: 'POST',
    });
  }

  getCurrencies() {
    return this.request<any[]>('/currencies');
  }

  getItemDefs() {
    return this.request<any[]>('/inventory/items');
  }

  getInventory() {
    return this.request<any>('/inventory');
  }

  getCurrencyBalances() {
    return this.request<Record<string, number>>('/currencies/balances');
  }

  getCurrencyLedger(currencyId: string, limit = 50, offset = 0) {
    return this.request<any[]>(`/currencies/${currencyId}/ledger?limit=${limit}&offset=${offset}`);
  }

  getTickInfo() {
    return this.request<{ currentTick: number; currentRate: number; serverTime: string; activeBoosts: Array<{ id: string; name: string; multiplier: number; endTime: string }> }>('/tick/current');
  }

  createBoost(data: { name: string; description?: string; multiplier: number; durationMinutes: number }) {
    return this.request<any>('/tick/boosts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getNotifications(params?: { category?: string; limit?: number; cursorCreatedAt?: string; cursorId?: string; includeArchived?: boolean }) {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.cursorCreatedAt) q.set('cursorCreatedAt', params.cursorCreatedAt);
    if (params?.cursorId) q.set('cursorId', params.cursorId);
    if (params?.includeArchived) q.set('includeArchived', 'true');
    const qs = q.toString();
    return this.request<{ items: any[]; nextCursor: { createdAt: string; id: string } | null; unreadCount: number }>(`/notifications${qs ? '?' + qs : ''}`);
  }

  getUnreadCount() {
    return this.request<{ count: number }>('/notifications/unread-count');
  }

  markNotificationsRead(ids: string[]) {
    return this.request<any>('/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  markAllNotificationsRead() {
    return this.request<any>('/notifications/mark-all-read', { method: 'POST' });
  }

  clearReadNotifications() {
    return this.request<any>('/notifications/clear-read', { method: 'POST' });
  }

  getJob(jobId: string) {
    return this.request<any>(`/jobs/${jobId}`);
  }

  skipJob(jobId: string) {
    return this.request<{ skipped: boolean; costs: Record<string, number> }>(`/jobs/${jobId}/skip`, { method: 'POST' });
  }

  cancelJob(jobId: string) {
    return this.request<{ cancelled: boolean }>(`/jobs/${jobId}/cancel`, { method: 'POST' });
  }

  dismissNotification(id: string) {
    return this.request<any>('/notifications/dismiss', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  getGifts(status?: string) {
    const q = status ? `?status=${status}` : '';
    return this.request<any[]>(`/gifts${q}`);
  }

  getGift(id: string) {
    return this.request<any>(`/gifts/${id}`);
  }

  claimGift(id: string) {
    return this.request<any>(`/gifts/${id}/claim`, { method: 'POST' });
  }

  getMetaEnums() {
    return this.request<Record<string, string[]>>('/meta/enums');
  }

  getMetaRules() {
    return this.request<Record<string, any>>('/meta/rules');
  }

  getModalSpec(params: { jobId?: string; notificationId?: string; giftId?: string; buildingDefId?: string; locationId?: string; buildingId?: string }) {
    const q = new URLSearchParams();
    if (params.jobId) q.set('jobId', params.jobId);
    if (params.notificationId) q.set('notificationId', params.notificationId);
    if (params.giftId) q.set('giftId', params.giftId);
    if (params.buildingDefId) q.set('buildingDefId', params.buildingDefId);
    if (params.locationId) q.set('locationId', params.locationId);
    if (params.buildingId) q.set('buildingId', params.buildingId);
    return this.request<any>(`/ui/modal?${q.toString()}`);
  }

  bootstrap() {
    return this.requestV1<BootstrapResponse>('/v1/bootstrap');
  }

  sendCommand(input: CommandRequest) {
    return this.requestV1<CommandResponse>('/v1/commands', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  fetchDelta(sinceCursor: string) {
    return this.requestV1<DeltaResponse | DeltaResetResponse>(`/v1/delta?since=${sinceCursor}`);
  }

  getToken() {
    return this.token;
  }

  private async requestV1<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Server returned non-JSON response (${res.status})`);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Request failed: ${res.status}`);
    }

    return res.json();
  }

  // Wallet auth
  walletNonce(chain: string, address: string) {
    return this.request<{ nonce: string; message: string }>('/auth/wallet/nonce', {
      method: 'POST',
      body: JSON.stringify({ chain, address }),
    });
  }

  walletVerify(chain: string, address: string, signature: string) {
    return this.request<{ accessToken: string; player: any } | { linked: true }>('/auth/wallet/verify', {
      method: 'POST',
      body: JSON.stringify({ chain, address, signature }),
    });
  }

  walletNonceAuthed(chain: string, address: string, _token: string) {
    return this.request<{ nonce: string; message: string }>('/auth/wallet/nonce', {
      method: 'POST',
      body: JSON.stringify({ chain, address }),
    });
  }

  walletVerifyAuthed(chain: string, address: string, signature: string, _token: string) {
    return this.request<{ linked: true }>('/auth/wallet/link', {
      method: 'POST',
      body: JSON.stringify({ chain, address, signature }),
    });
  }

  // Linked wallets
  getLinkedWallets() {
    return this.request<any[]>('/player/wallets');
  }

  removeLinkedWallet(id: string) {
    return this.request<{ success: true }>(`/player/wallets/${id}`, { method: 'DELETE' });
  }

  setWalletPrimary(id: string) {
    return this.request<{ success: true }>(`/player/wallets/${id}/primary`, { method: 'POST' });
  }

  // NFT collections
  syncNftCollections() {
    return this.request<{ claimed: number; alreadyClaimed: number; notImported: number; entities: any[] }>('/nft/collections/sync', {
      method: 'POST',
    });
  }

  getNftEntities() {
    return this.request<any[]>('/nft/collections/entities');
  }
}

export interface BootstrapResponse {
  serverTime: number;
  snapshot: {
    player: any;
    state: any;
    inventory?: any;
    jobs?: any;
    notifications?: any;
    currencies?: any;
    activeEffects?: any;
    activeSeason?: { id: string; name?: string; [key: string]: unknown } | null;
  };
  cursor: { delta: string };
}

export interface CommandRequest {
  type: string;
  payload: Record<string, any>;
  idempotencyKey: string;
}

export interface CommandResponse {
  patches: Patch[];
  ui: UiIntent[];
  cursor: { delta: string };
}

export interface DeltaResponse {
  from: string;
  to: string;
  patches: Patch[];
  ui: UiIntent[];
}

export interface DeltaResetResponse {
  resetRequired: true;
}

export type Patch =
  | { op: 'upsert'; entity: string; id: string; data: any }
  | { op: 'delete'; entity: string; id: string };

export type UiIntent =
  | { type: 'modal'; spec: import('@derp/shared').ModalSpecV1 }
  | { type: 'toast'; tone: 'success' | 'error' | 'info'; message: string }
  | { type: 'navigate'; deepLink: string };

export const api = new ApiClient();
