const _rawApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE = _rawApiUrl ? _rawApiUrl.replace(/\/$/, '') : '/api';

let _idemCounter = 0;
function newIdempotencyKey(scope: string): string {
  _idemCounter++;
  // Random + counter + time gives a key the server can dedupe on; same value
  // is reused if the SAME logical operation is retried by the same call site.
  const rand = Math.random().toString(36).slice(2, 10);
  return `${scope}-${Date.now().toString(36)}-${_idemCounter}-${rand}`;
}

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

  getEntityEvents(id: string) {
    return this.request<any[]>(`/entities/${id}/events`);
  }

  getEntityPowerUsage(id: string) {
    return this.request<Record<string, { usageCount: number; lastUsedUtcDay: string }>>(
      `/entities/${id}/power-usage`,
    );
  }

  // Locations
  getLocations() {
    return this.request<any[]>('/locations');
  }

  getLocation(id: string) {
    return this.request<any>(`/locations/${id}`);
  }

  getLocationPowerUsage(id: string) {
    return this.request<Record<string, { usageCount: number; lastUsedUtcDay: string }>>(
      `/locations/${id}/power-usage`,
    );
  }

  claimLocation(id: string, idempotencyKey?: string) {
    return this.request<any>(`/locations/${id}/claim`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`loc-claim-${id}`) },
    });
  }

  getAvailableBuildings(locationId: string) {
    return this.request<any>(`/locations/${locationId}/available-buildings`);
  }

  buildBuilding(locationId: string, buildingDefId: string, idempotencyKey?: string) {
    return this.request<any>(`/locations/${locationId}/build`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`bld-${locationId}-${buildingDefId}`) },
      body: JSON.stringify({ buildingDefId }),
    });
  }

  completeBuilding(locationId: string, buildingId: string, idempotencyKey?: string) {
    return this.request<any>(`/locations/${locationId}/buildings/${buildingId}/complete`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`bld-complete-${buildingId}`) },
    });
  }

  upgradeBuilding(locationId: string, buildingId: string, idempotencyKey?: string) {
    return this.request<any>(`/locations/${locationId}/buildings/${buildingId}/upgrade`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`bld-upgrade-${buildingId}`) },
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

  startMission(defId: string, entityIds: string[], idempotencyKey?: string) {
    return this.request<any>('/missions/start', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`mission-start-${defId}`) },
      body: JSON.stringify({ defId, entityIds }),
    });
  }

  completeMission(missionId: string, idempotencyKey?: string) {
    return this.request<any>(`/missions/${missionId}/complete`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`mission-complete-${missionId}`) },
    });
  }

  missionSynergyPreview(defId: string, entityIds: string[], signal?: AbortSignal) {
    return this.request<SynergyPreview>('/missions/synergy-preview', {
      method: 'POST',
      body: JSON.stringify({ defId, entityIds }),
      signal,
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

  collectCrafting(jobId: string, idempotencyKey?: string) {
    return this.request<any>(`/crafting/${jobId}/collect`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`craft-collect-${jobId}`) },
    });
  }

  getCraftingForecast(includeAll = false, locationId?: string) {
    const params = new URLSearchParams();
    if (includeAll) params.set('includeAll', '1');
    if (locationId) params.set('locationId', locationId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      cap: number;
      tiers: Array<{ key: string; label: string; minCl: number }>;
      workshopTier: number;
      luckFloor: number;
      slotsTotal: number;
      slotsUsed: number;
      slotsOpen: number;
      timerMultiplier: number;
      recipeTierCap: number;
      entities: Array<{
        entityId: string;
        name: string;
        level: number;
        status: string;
        idle: boolean;
        stats: { FOC: number; LCK: number };
        craftingLuck: number;
        rawCraftingLuck: number;
        luckFloor: number;
        probabilities: Array<{ key: string; label: string; probability: number }>;
        expectedQuality: string;
        expectedQualityLabel: string;
      }>;
    }>(`/crafting/forecast${qs}`);
  }

  getCraftingWorkshops() {
    return this.request<Array<{
      buildingId: string;
      buildingDefId: string;
      name: string;
      level: number;
      enabled: boolean;
      locationId: string;
      locationName?: string;
      displayDef?: {
        id: string;
        borderColor?: string | null;
        backgroundImage?: string | null;
        cardBackground?: string | null;
        style?: any;
      } | null;
    }>>('/crafting/workshops');
  }

  getCraftingWorkshopAtLocation(locationId: string) {
    return this.request<{
      buildingId: string;
      buildingDefId: string;
      name: string;
      level: number;
      enabled: boolean;
      locationId: string;
      locationName?: string;
      displayDef?: {
        id: string;
        borderColor?: string | null;
        backgroundImage?: string | null;
        cardBackground?: string | null;
        style?: any;
      } | null;
    }>(`/crafting/workshops/${encodeURIComponent(locationId)}`);
  }

  getCurrencies() {
    return this.request<any[]>('/currencies');
  }

  getItemDefs() {
    return this.request<any[]>('/inventory/items');
  }

  getEffectDefs() {
    return this.request<any[]>('/effects/defs');
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

  skipJob(jobId: string, idempotencyKey?: string) {
    return this.request<{ skipped: boolean; costs: Record<string, number> }>(`/jobs/${jobId}/skip`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`job-skip-${jobId}`) },
    });
  }

  cancelJob(jobId: string, idempotencyKey?: string) {
    return this.request<{ cancelled: boolean }>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`job-cancel-${jobId}`) },
    });
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

  claimGift(id: string, idempotencyKey?: string) {
    return this.request<any>(`/gifts/${id}/claim`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || newIdempotencyKey(`gift-claim-${id}`) },
    });
  }

  getMetaEnums() {
    return this.request<Record<string, string[]>>('/meta/enums');
  }

  getMetaRules() {
    return this.request<Record<string, any>>('/meta/rules');
  }

  getModalSpec(params: { jobId?: string; notificationId?: string; giftId?: string; buildingDefId?: string; locationId?: string; buildingId?: string; depositXp?: boolean; levelUp?: boolean }) {
    const q = new URLSearchParams();
    if (params.jobId) q.set('jobId', params.jobId);
    if (params.notificationId) q.set('notificationId', params.notificationId);
    if (params.giftId) q.set('giftId', params.giftId);
    if (params.buildingDefId) q.set('buildingDefId', params.buildingDefId);
    if (params.locationId) q.set('locationId', params.locationId);
    if (params.buildingId) q.set('buildingId', params.buildingId);
    if (params.depositXp) q.set('depositXp', 'true');
    if (params.levelUp) q.set('levelUp', 'true');
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

  walletVerify(chain: string, address: string, signature: string, key?: string) {
    return this.request<
      | { accessToken: string; player: any }
      | { linked: true }
      | { needsOnboarding: true; walletToken: string; chain: string; address: string }
    >('/auth/wallet/verify', {
      method: 'POST',
      body: JSON.stringify({ chain, address, signature, key }),
    });
  }

  walletCompleteOnboarding(walletToken: string, username: string, email?: string) {
    return this.request<{ accessToken: string; player: any }>('/auth/wallet/complete', {
      method: 'POST',
      body: JSON.stringify({ walletToken, username, email }),
    });
  }

  walletNonceAuthed(chain: string, address: string, _token: string) {
    return this.request<{ nonce: string; message: string }>('/auth/wallet/nonce', {
      method: 'POST',
      body: JSON.stringify({ chain, address }),
    });
  }

  walletVerifyAuthed(chain: string, address: string, signature: string, _token: string, key?: string) {
    return this.request<{ linked: true }>('/auth/wallet/link', {
      method: 'POST',
      body: JSON.stringify({ chain, address, signature, key }),
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

  addManualWallet(chain: string, address: string) {
    return this.request<{ linked: true }>(`/player/wallets/manual`, {
      method: 'POST',
      body: JSON.stringify({ chain, address }),
    });
  }

  // NFT collections
  syncNftCollections() {
    return this.request<{ claimed: number; alreadyClaimed: number; notImported: number; unclaimed: number; reconciliationSkippedCollections: string[]; entities: any[]; locations: any[] }>('/nft/collections/sync', {
      method: 'POST',
    });
  }

  getNftEntities() {
    return this.request<any[]>('/nft/collections/entities');
  }
}

export interface ActivePowerSummary {
  id: string;
  label: string;
  powerType: string;
  value: number;
  valueMode: string;
  endTime: string;
}

export interface BootstrapResponse {
  serverTime: number;
  tickAnchor?: {
    currentTick: number;
    tickRate: number;
    serverTime: string;
    activeBoosts?: Array<{ id: string; name: string; multiplier: number; endTime: string }>;
  };
  snapshot: {
    player: any;
    state: any;
    inventory?: any;
    jobs?: any;
    notifications?: any;
    currencies?: any;
    activeEffects?: any;
    activeSeason?: { id: string; name?: string; [key: string]: unknown } | null;
    activePowers?: ActivePowerSummary[];
    entityPowerUsages?: Record<string, Record<string, { usageCount: number; lastUsedUtcDay: string }>>;
    locationPowerUsages?: Record<string, Record<string, { usageCount: number; lastUsedUtcDay: string }>>;
  };
  cursor: { delta: string };
}

export interface CommandRequest {
  type: string;
  payload: Record<string, any>;
  idempotencyKey: string;
}

export interface SynergyMatchedRule {
  ruleId: string;
  name: string;
  applications: number;
  scoreContrib: number;
  mpBonusContrib: number;
  durationBonusContrib: number;
  isPenalty: boolean;
}

export interface SynergyPreview {
  matchedRules: SynergyMatchedRule[];
  synergyScore: number;
  missionPowerBonus: number;
  durationBonus: number;
}

export interface CommandResponse {
  patches: Patch[];
  ui: UiIntent[];
  cursor: { delta: string };
  meta?: {
    synergyPreview?: SynergyPreview;
  };
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
