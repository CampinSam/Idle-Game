const API_BASE = '/api/admin';
const NFT_API_BASE = '/api';

export interface TraceNode {
  type: 'group' | 'rule' | 'rule_ref';
  label: string;
  passed: boolean;
  children?: TraceNode[];
  error?: string;
}

export interface AdminPermissionFlags {
  read: boolean;
  write: boolean;
  approve: boolean;
  player_read: boolean;
  player_write: boolean;
  system_tools: boolean;
  metrics_read: boolean;
}

export interface AdminMe {
  id: string;
  username: string;
  roleId: string;
  role: {
    id: string;
    name: string;
    slug: string;
    permissionFlags: AdminPermissionFlags;
  };
  contentScopes: string[];
  permissionFlagsOverride?: Partial<AdminPermissionFlags>;
  effectivePermissions?: AdminPermissionFlags;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  isBootstrap?: boolean;
}

let adminToken = sessionStorage.getItem('adminToken') || '';

export function setAdminToken(token: string) {
  adminToken = token;
  sessionStorage.setItem('adminToken', token);
}

export function getAdminToken() {
  return adminToken;
}

export function clearAdminToken() {
  adminToken = '';
  sessionStorage.removeItem('adminToken');
}

function authHeaders(): Record<string, string> {
  if (adminToken) {
    return { Authorization: `Bearer ${adminToken}` };
  }
  // Dev-only fallback for bootstrap access before any account exists
  const devKey = import.meta.env.DEV ? (import.meta.env.VITE_ADMIN_KEY || 'derp-admin-2026') : '';
  if (devKey) {
    return { 'X-Admin-Key': devKey };
  }
  return {};
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  const text = await res.text();
  const parsed = text.trim() ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(parsed?.message || `Request failed: ${res.status}`);
  }

  return parsed as T;
}

async function nftAdminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${NFT_API_BASE}${path}`, { ...options, headers });

  const text = await res.text();
  const parsed = text.trim() ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(parsed?.message || `Request failed: ${res.status}`);
  }

  return parsed;
}

export const adminApi = {
  // ─── Auth ────────────────────────────────────────────────────────────────────

  login: (username: string, password: string) =>
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `Login failed: ${res.status}`);
      return body as { token: string; account: AdminMe };
    }),

  getMe: () => adminRequest<AdminMe>('/me'),

  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    adminRequest<{ success: boolean }>('/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // ─── Account Management (Super Admin only) ────────────────────────────────

  listRoles: () => adminRequest<any[]>('/roles'),
  listAccounts: () => adminRequest<any[]>('/accounts'),
  createAccount: (data: { username: string; password: string; roleId: string; contentScopes?: string[] }) =>
    adminRequest<any>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: string, data: { username?: string; password?: string; roleId?: string; contentScopes?: string[]; enabled?: boolean; permissionFlagsOverride?: Partial<AdminPermissionFlags> }) =>
    adminRequest<any>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: string) =>
    adminRequest<any>(`/accounts/${id}`, { method: 'DELETE' }),

  // ─── Audit Log ───────────────────────────────────────────────────────────

  listAuditLog: (opts: { adminId?: string; action?: string; tableName?: string; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.adminId) params.set('adminId', opts.adminId);
    if (opts.action) params.set('action', opts.action);
    if (opts.tableName) params.set('tableName', opts.tableName);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    return adminRequest<any[]>(`/audit-log?${params.toString()}`);
  },

  // ─── Tables / Generic CRUD ───────────────────────────────────────────────

  getTables: () => adminRequest<{ key: string; name: string; table: string }[]>('/tables'),
  list: (table: string) => adminRequest<any[]>(`/${table}`),
  get: (table: string, id: string) => adminRequest<any>(`/${table}/${id}`),
  create: (table: string, data: any) =>
    adminRequest<any>(`/${table}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (table: string, id: string, data: any) =>
    adminRequest<any>(`/${table}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (table: string, id: string) =>
    adminRequest<any>(`/${table}/${id}`, { method: 'DELETE' }),

  // ─── Players ─────────────────────────────────────────────────────────────

  getPlayerCount: () => adminRequest<{ total: number; active: number }>('/players/count'),

  getSystemHealth: () => adminRequest<{
    api: string;
    currentTick: number;
    tickRate: number;
    tickDrift: number;
    jobCounts: Record<string, number>;
  }>('/system/health'),

  listPlayers: (params: { q?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.page != null) qs.set('page', String(params.page));
    if (params.limit != null) qs.set('limit', String(params.limit));
    return adminRequest<{ items: any[]; total: number; page: number; limit: number }>(
      `/players?${qs.toString()}`,
    );
  },
  resyncPlayerNfts: (id: string) =>
    adminRequest<{ claimed: number; unclaimed: number; transferred: number }>(`/players/${id}/nft/resync`, { method: 'POST' }),
  searchPlayers: (q: string) => adminRequest<any[]>(`/players/search?q=${encodeURIComponent(q)}`),
  getPlayer: (id: string) => adminRequest<any>(`/players/${id}`),
  updatePlayer: (id: string, data: any) =>
    adminRequest<any>(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setPlayerCurrency: (id: string, currencyId: string, balance: string) =>
    adminRequest<any>(`/players/${id}/currency`, { method: 'PUT', body: JSON.stringify({ currencyId, balance }) }),
  resetPlayer: (id: string) =>
    adminRequest<any>(`/players/${id}/reset`, { method: 'POST' }),
  generateResetLink: (id: string) =>
    adminRequest<{ url: string }>(`/players/${id}/generate-reset-link`, { method: 'POST', body: JSON.stringify({}) }),

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
  listCurrencyDefs: () => adminRequest<any[]>('/currency'),

  updatePlayerEntity: (id: string, entityId: string, data: { stats?: any; level?: number; name?: string }) =>
    adminRequest<any>(`/players/${id}/entities/${entityId}`, { method: 'PUT', body: JSON.stringify(data) }),

  reconcileEntityStatus: (userId: string, entityId: string) =>
    adminRequest<{ changed: boolean; newStatus: string; previousStatus: string; jobId: string | null; jobType: string | null }>(
      `/players/${userId}/entities/${entityId}/reconcile-status`,
      { method: 'POST' },
    ),

  getEntityPowerUsage: (userId: string, entityId: string) =>
    adminRequest<any[]>(`/players/${userId}/entities/${entityId}/power-usage`),
  resetEntityPowerUsage: (userId: string, entityId: string, powerKey: string) =>
    adminRequest<any>(`/players/${userId}/entities/${entityId}/power-usage/${encodeURIComponent(powerKey)}`, { method: 'DELETE' }),

  forceSettleLocation: (id: string, locationId: string) =>
    adminRequest<any>(`/players/${id}/locations/${locationId}/settle`, { method: 'POST' }),

  getPlayerEffects: (id: string) => adminRequest<any[]>(`/players/${id}/effects`),
  deletePlayerEffect: (id: string, effectId: string) =>
    adminRequest<any>(`/players/${id}/effects/${effectId}`, { method: 'DELETE' }),

  getPlayerTelemetry: (id: string, limit = 30) =>
    adminRequest<any[]>(`/players/${id}/telemetry?limit=${limit}`),

  listPlayerEvents: (opts: { userId?: string; eventType?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.userId) params.set('userId', opts.userId);
    if (opts.eventType) params.set('eventType', opts.eventType);
    if (opts.limit) params.set('limit', String(opts.limit));
    return adminRequest<any[]>(`/player-events?${params.toString()}`);
  },

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

  getGlobalPowers: (all?: boolean) =>
    adminRequest<any[]>(`/global-powers${all ? '?all=true' : ''}`),
  createGlobalPower: (data: {
    label: string;
    effectDefId: string | null;
    effectOverrides?: Record<string, any>;
    selection?: Record<string, any>;
    durationMinutes: number;
    scheduledFor?: string;
    triggeredByUserId?: string;
  }) => adminRequest<any>('/global-powers', { method: 'POST', body: JSON.stringify(data) }),
  cancelGlobalPower: (id: string) =>
    adminRequest<any>(`/global-powers/${id}`, { method: 'DELETE' }),
  getEffectDefs: () => adminRequest<any[]>('/effect-defs'),

  listPowerDefs: (enabled?: boolean) =>
    adminRequest<any[]>(`/power-defs${enabled !== undefined ? `?enabled=${enabled}` : ''}`),
  getPowerDef: (id: string) => adminRequest<any>(`/power-defs/${id}`),
  createPowerDef: (data: {
    id: string;
    name: string;
    description?: string;
    powerType: string;
    effectDefId?: string | null;
    defaultValue?: number;
    defaultValueMode?: string;
    defaultDurationMinutes?: number;
    defaultDailyLimit?: number;
    defaultScope?: string;
    selection?: any;
    enabled?: boolean;
  }) => adminRequest<any>('/power-defs', { method: 'POST', body: JSON.stringify(data) }),
  updatePowerDef: (id: string, data: Record<string, any>) =>
    adminRequest<any>(`/power-defs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePowerDef: (id: string) =>
    adminRequest<any>(`/power-defs/${id}`, { method: 'DELETE' }),
  telemetryList: () => adminRequest<any[]>('/telemetry'),
  telemetryGet: (id: string) => adminRequest<any>(`/telemetry/${id}`),
  telemetryCreate: (body: any) => adminRequest<any>('/telemetry', { method: 'POST', body: JSON.stringify(body) }),
  telemetryUpdate: (id: string, body: any) => adminRequest<any>(`/telemetry/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  telemetryDelete: (id: string) => adminRequest<any>(`/telemetry/${id}`, { method: 'DELETE' }),
  telemetryResetCounts: (id: string) => adminRequest<any>(`/telemetry/${id}/reset`, { method: 'POST' }),

  listNftCollections: () =>
    nftAdminRequest<any[]>('/nft/collections'),
  importNftCollectionCache: (id: string) =>
    nftAdminRequest<any>(`/nft/collections/${id}/import`, { method: 'POST' }),
  getImportCacheStatus: (id: string) =>
    nftAdminRequest<{ status: 'idle' | 'running' | 'done' | 'error'; total: number; processed: number; upserted: number; failed: number; startedAt?: string; finishedAt?: string }>(`/nft/collections/${id}/import/status`),
  createNftInstances: (id: string) =>
    nftAdminRequest<{ started: true; total: number }>(`/nft/collections/${id}/create-instances`, { method: 'POST' }),
  getCreateInstancesStatus: (id: string) =>
    nftAdminRequest<{ status: 'idle' | 'running' | 'done' | 'error'; total: number; processed: number; upserted: number; failed: number; startedAt?: string; finishedAt?: string }>(`/nft/collections/${id}/create-instances/status`),
  refreshNftOwnership: (id: string) =>
    nftAdminRequest<any>(`/nft/collections/${id}/refresh`, { method: 'POST' }),
  getRefreshStatus: (id: string) =>
    nftAdminRequest<{ status: 'idle' | 'running' | 'done' | 'error'; total: number; processed: number; updated: number; failed: number; startedAt?: string; finishedAt?: string }>(`/nft/collections/${id}/refresh/status`),
  listNftAssets: (id: string, page = 1, limit = 50) =>
    nftAdminRequest<{ items: any[]; total: number; page: number; limit: number }>(
      `/nft/collections/${id}/assets?page=${page}&limit=${limit}`,
    ),
  seedNftEntities: () =>
    adminRequest<{ skipped: boolean; inserted: number }>('/seeds/nft-entities', { method: 'POST' }),

  listEntityInstances: (params: {
    q?: string; page?: number; limit?: number;
    userId?: string; definitionId?: string; status?: string; nftCollectionDefId?: string;
  }) => {
    const p = new URLSearchParams();
    if (params.q) p.set('q', params.q);
    if (params.page) p.set('page', String(params.page));
    if (params.limit) p.set('limit', String(params.limit));
    if (params.userId) p.set('userId', params.userId);
    if (params.definitionId) p.set('definitionId', params.definitionId);
    if (params.status) p.set('status', params.status);
    if (params.nftCollectionDefId) p.set('nftCollectionDefId', params.nftCollectionDefId);
    return adminRequest<{
      items: {
        id: string; name: string; definitionId: string; definitionName: string;
        level: number; status: string; ownerUserId: string | null; ownerUsername: string | null;
        nftAssetId: string | null; nftCollectionDefId: string | null; stats: any; rarity: string | null;
      }[];
      total: number; page: number; limit: number;
    }>(`/instances/entities?${p}`);
  },

  listLocationInstances: (params: {
    q?: string; page?: number; limit?: number;
    userId?: string; definitionId?: string; enabled?: boolean; nftCollectionDefId?: string;
  }) => {
    const p = new URLSearchParams();
    if (params.q) p.set('q', params.q);
    if (params.page) p.set('page', String(params.page));
    if (params.limit) p.set('limit', String(params.limit));
    if (params.userId) p.set('userId', params.userId);
    if (params.definitionId) p.set('definitionId', params.definitionId);
    if (params.enabled !== undefined) p.set('enabled', String(params.enabled));
    if (params.nftCollectionDefId) p.set('nftCollectionDefId', params.nftCollectionDefId);
    return adminRequest<{
      items: {
        id: string; name: string; definitionId: string; definitionName: string;
        level: number; enabled: boolean; ownerUserId: string | null; ownerUsername: string | null;
        nftAssetId: string | null; nftCollectionDefId: string | null; storage: any;
      }[];
      total: number; page: number; limit: number;
    }>(`/instances/locations?${p}`);
  },

  listEntities: (q?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('limit', String(limit));
    return adminRequest<{ id: string; name: string }[]>(`/entities?${params.toString()}`);
  },

  listLocationDefs: () => adminRequest<any[]>('/locationDefinition'),
  listSeasons: () => adminRequest<any[]>('/season'),

  listGameDefinitions: (key?: string) => {
    const qs = key ? `?key=${encodeURIComponent(key)}` : '';
    return adminRequest<any[]>(`/game-definitions${qs}`);
  },
  getGameDefinition: (id: string) => adminRequest<any>(`/gameDefinition/${id}`),
  createGameDefinition: (data: any) =>
    adminRequest<any>('/gameDefinition', { method: 'POST', body: JSON.stringify(data) }),
  updateGameDefinition: (id: string, data: any) =>
    adminRequest<any>(`/gameDefinition/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGameDefinition: (id: string) =>
    adminRequest<any>(`/gameDefinition/${id}`, { method: 'DELETE' }),
  publishGameDefinition: (key: string, version: number, type?: string) =>
    adminRequest<any>(`/game-definitions/${encodeURIComponent(key)}/${version}/publish${type ? `?type=${encodeURIComponent(type)}` : ''}`, { method: 'POST' }),
  rollbackGameDefinition: (key: string, version: number, type?: string) =>
    adminRequest<any>(`/game-definitions/${encodeURIComponent(key)}/${version}/rollback${type ? `?type=${encodeURIComponent(type)}` : ''}`, { method: 'POST' }),

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
      headers: authHeaders(),
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Upload failed: ${res.status}`);
      }
      return res.json();
    });
  },

  getAdaOracleStatus: () =>
    adminRequest<{
      lovelacePerUsd: number;
      usdPerAda: number;
      sampleCount: number;
      twaWindowSeconds: number;
      oldestSampleAt: string | null;
      newestSampleAt: string | null;
      usingFallback: boolean;
    }>('/crypto/rates/ada/current'),

  getCryptoConfig: () => adminRequest<any>('/crypto/config'),
  updateCryptoConfig: (data: {
    hotWalletAddress?: string;
    blockfrostProjectId?: string;
    cntPolicyId?: string;
    cntAssetName?: string;
    cntPriceAda?: number;
    minWithdrawalType?: string;
    minWithdrawalAmount?: number;
    withdrawalFee?: number;
    autoApprovalThreshold?: number;
    hotWalletSkeyHex?: string;
    adaWithdrawalFee?: number;
    adaMinWithdrawalAmount?: number;
  }) => adminRequest<any>('/crypto/config', { method: 'PUT', body: JSON.stringify(data) }),
  generateHotWallet: (confirm: true) =>
    adminRequest<{ address: string; pendingDownload: true }>('/crypto/wallet/generate', {
      method: 'POST',
      body: JSON.stringify({ confirm }),
    }),
  claimPendingKeyDownload: () =>
    adminRequest<{ skeyHex: string }>('/crypto/wallet/claim-key', { method: 'POST', body: JSON.stringify({}) }),
  getCryptoBalance: () => adminRequest<{
    ada: { gross: string; liability: string; net: string };
    currencies: Array<{ currencyId: string; gross: string; liability: string; net: string; approvedWithdrawals: string }>;
  } | null>('/crypto/balance'),
  getCryptoWithdrawals: (status?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (limit) params.set('limit', String(limit));
    return adminRequest<any[]>(`/crypto/withdrawals?${params.toString()}`);
  },
  updateCryptoWithdrawal: (id: string, data: { status?: string; txHash?: string; adminNote?: string }) =>
    adminRequest<any>(`/crypto/withdrawals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getUnresolvedDeposits: (includeResolved?: boolean, limit?: number) => {
    const params = new URLSearchParams();
    if (includeResolved) params.set('includeResolved', 'true');
    if (limit) params.set('limit', String(limit));
    return adminRequest<any[]>(`/crypto/unresolved-deposits?${params.toString()}`);
  },
  resolveUnresolvedDeposit: (id: string, creditUserId?: string) =>
    adminRequest<any>(`/crypto/unresolved-deposits/${id}/resolve`, { method: 'PUT', body: JSON.stringify({ creditUserId }) }),

  getPlayerDepositLedger: (userId: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    return adminRequest<Array<{
      id: string;
      currencyId: string;
      delta: string;
      reason: string | null;
      sourceType: string;
      txHash: string | null;
      metadata: any;
      createdAt: string;
    }>>(`/players/${userId}/ledger/deposits?${params.toString()}`);
  },

  listPlayerWallets: (userId: string) =>
    adminRequest<Array<{ id: string; chain: string; address: string; isPrimary: boolean; createdAt: string }>>(
      `/players/${userId}/wallets`,
    ),

  addPlayerWallet: (userId: string, chain: string, address: string) =>
    adminRequest<{ success: boolean }>(
      `/players/${userId}/wallets`,
      { method: 'POST', body: JSON.stringify({ chain, address }) },
    ),

  removePlayerWallet: (userId: string, walletId: string) =>
    adminRequest<{ success: boolean }>(
      `/players/${userId}/wallets/${walletId}`,
      { method: 'DELETE' },
    ),

  evaluateSelection: (body: {
    rule: unknown;
    userId: string;
    entityIds?: string[];
    activityContext?: {
      activityType?: string;
      missionType?: string;
      missionTags?: string[];
      regionId?: string;
      seasonId?: string;
    };
    eventContext?: {
      type?: string;
      key?: string;
      amount?: number;
      data?: Record<string, unknown>;
    };
  }) =>
    adminRequest<{ passed: boolean; resolvedContext: unknown; trace: TraceNode }>('/selection/evaluate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ─── Content Drafts ──────────────────────────────────────────────────────
  listDrafts: (opts: { status?: string; tableName?: string; recordId?: string; authorId?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.tableName) params.set('tableName', opts.tableName);
    if (opts.recordId) params.set('recordId', opts.recordId);
    if (opts.authorId) params.set('authorId', opts.authorId);
    if (opts.limit) params.set('limit', String(opts.limit));
    return adminRequest<any[]>(`/drafts?${params.toString()}`);
  },

  getDraft: (id: string) => adminRequest<any>(`/drafts/${id}`),

  approveDraft: (id: string) =>
    adminRequest<any>(`/drafts/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),

  rejectDraft: (id: string, reviewComment?: string) =>
    adminRequest<any>(`/drafts/${id}/reject`, { method: 'POST', body: JSON.stringify({ reviewComment }) }),

  // ─── Game Metrics ─────────────────────────────────────────────────────────

  getGameHealthMetrics: () => adminRequest<{
    computedAt: string;
    metrics: Array<{
      name: string;
      value: number | null;
      unit: string;
      label: string;
      description: string;
      status: 'green' | 'yellow' | 'red' | 'neutral';
      benchmark: string;
    }>;
  }>('/metrics/game-health'),

  getMetricHistory: (metricNames: string[], days: number) => {
    const params = new URLSearchParams();
    params.set('metrics', metricNames.join(','));
    params.set('days', String(days));
    return adminRequest<Record<string, Array<{ date: string; value: number }>>>(
      `/metrics/history?${params.toString()}`,
    );
  },

  recordMetricSnapshot: () =>
    adminRequest<{ success: boolean }>('/metrics/record-snapshot', { method: 'POST', body: JSON.stringify({}) }),

  uploadMedia: (file: File, targetDir?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const url = targetDir
      ? `${API_BASE}/media/upload?targetDir=${encodeURIComponent(targetDir)}`
      : `${API_BASE}/media/upload`;
    return fetch(url, {
      method: 'POST',
      headers: authHeaders(),
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
