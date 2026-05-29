export interface PermissionFlags {
  read: boolean;
  write: boolean;
  approve: boolean;
  player_read: boolean;
  player_write: boolean;
  system_tools: boolean;
}

export interface AdminAccountUser {
  id: string;
  username: string;
  role: string;
  perms: PermissionFlags;
  scopes: string[];
  isBootstrap: boolean;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

const TABLE_KEY_TO_GROUP: Record<string, string> = {
  displayDef: 'UI',
  modalDef: 'UI',
  homeBannerDef: 'UI',
  systemIconDef: 'UI',
  tagDef: 'UI',
  visualEffectDef: 'UI',
  missionDef: 'Missions',
  missionCategoryDef: 'Missions',
  recipeDef: 'Crafting',
  buildingDef: 'Locations',
  roomDef: 'Locations',
  locationDefinition: 'Locations',
  regionDefinition: 'Locations',
  currency: 'Economy',
  itemDef: 'Economy',
  entityDefinition: 'Entities',
  giftDef: 'Rewards',
  lootboxDef: 'Rewards',
  bundleDef: 'Rewards',
  checkInDef: 'Rewards',
  questDef: 'Rewards',
  shopItemDef: 'Store',
  shopHeroDef: 'Store',
  shopTabDef: 'Store',
  shopSectionDef: 'Store',
  gemPacks: 'Store',
  nftCollectionDef: 'NFT',
  effectDef: 'Effects',
  synergyRule: 'Synergy',
  selectionRuleDef: 'Rules',
  eventDefinition: 'System',
  telemetryDef: 'Telemetry',
  'game-definitions': 'Screens',
  cryptoRateConfig: 'Payments',
};

function requireRole(user: AdminAccountUser, role: string): PermissionCheckResult {
  if (user.role === role) return { allowed: true };
  return { allowed: false, reason: `Requires '${role}' role` };
}

function requirePerm(user: AdminAccountUser, perm: keyof PermissionFlags): PermissionCheckResult {
  if (user.role === 'super_admin') return { allowed: true };
  if (user.perms[perm]) return { allowed: true };
  return { allowed: false, reason: `Requires '${perm}' permission` };
}

function requireContentPerm(
  user: AdminAccountUser,
  perm: 'read' | 'write',
  group: string | null,
): PermissionCheckResult {
  if (user.role === 'super_admin') return { allowed: true };
  if (!user.perms[perm]) return { allowed: false, reason: `Requires '${perm}' permission` };
  if (group && user.scopes.length > 0 && !user.scopes.includes(group)) {
    return { allowed: false, reason: `Content scope '${group}' is not in your allowed scopes` };
  }
  return { allowed: true };
}

export function buildUserFromJwt(payload: any): AdminAccountUser {
  return {
    id: payload.sub,
    username: payload.username,
    role: payload.role,
    perms: payload.perms as PermissionFlags,
    scopes: payload.scopes ?? [],
    isBootstrap: false,
  };
}

export function resolveRequiredPermission(
  adminPath: string,
  method: string,
  user: AdminAccountUser,
): PermissionCheckResult {
  const M = method.toUpperCase();
  const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(M);

  // Super Admin only routes
  if (adminPath.startsWith('/accounts') || adminPath.startsWith('/audit-log')) {
    return requireRole(user, 'super_admin');
  }

  // Always allowed for any authenticated admin
  if (
    adminPath === '/me' ||
    adminPath === '/tables' ||
    adminPath === '/roles' ||
    adminPath.startsWith('/balance') ||
    adminPath.startsWith('/selection') ||
    adminPath === '/outcomes/test' ||
    adminPath.startsWith('/entities') ||
    adminPath === '/effect-defs' ||
    adminPath === '/item-defs' ||
    adminPath.startsWith('/locationDefinition') ||
    adminPath.startsWith('/season') ||
    adminPath.startsWith('/meta')
  ) {
    return { allowed: true };
  }

  // Player endpoints
  if (adminPath.startsWith('/players') || adminPath.startsWith('/jobs') || adminPath.startsWith('/player-events')) {
    if (
      adminPath.includes('/reset') ||
      adminPath.includes('/generate-reset-link') ||
      adminPath.includes('/force-complete') ||
      adminPath.includes('/settle') ||
      adminPath.includes('/reconcile-status')
    ) {
      return requirePerm(user, 'system_tools');
    }
    if (isWrite) return requirePerm(user, 'player_write');
    return requirePerm(user, 'player_read');
  }

  // System tools
  if (
    adminPath.startsWith('/notifications') ||
    adminPath.startsWith('/events') ||
    adminPath.startsWith('/gifts') ||
    adminPath.startsWith('/global-powers') ||
    adminPath.startsWith('/backfill')
  ) {
    return requirePerm(user, 'system_tools');
  }

  // Crypto: reads = any admin, writes = system_tools
  if (adminPath.startsWith('/crypto')) {
    if (isWrite) return requirePerm(user, 'system_tools');
    return { allowed: true };
  }

  // NFT: reads = any admin, writes = system_tools
  if (adminPath.startsWith('/nft')) {
    if (isWrite) return requirePerm(user, 'system_tools');
    return { allowed: true };
  }

  // Media / audio
  if (adminPath.startsWith('/media') || adminPath.startsWith('/audio')) {
    if (isWrite) return requireContentPerm(user, 'write', 'System');
    return { allowed: true };
  }

  // Telemetry dedicated routes (not the telemetryDef table CRUD)
  if (adminPath.startsWith('/telemetry')) {
    if (isWrite) return requireContentPerm(user, 'write', 'Telemetry');
    return requireContentPerm(user, 'read', 'Telemetry');
  }

  // Game definitions (dedicated routes)
  if (adminPath.startsWith('/game-definitions') || adminPath.startsWith('/gameDefinition')) {
    if (isWrite) return requireContentPerm(user, 'write', 'Screens');
    return requireContentPerm(user, 'read', 'Screens');
  }

  // Generic table CRUD (/:table and /:table/:id) — must come last
  const tableKey = adminPath.split('/').filter(Boolean)[0] ?? '';
  const group = TABLE_KEY_TO_GROUP[tableKey] ?? null;

  if (isWrite) return requireContentPerm(user, 'write', group);
  return requireContentPerm(user, 'read', group);
}
