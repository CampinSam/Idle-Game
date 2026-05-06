export type GrowthRate = 'flat' | 'linear' | 'exp';
export type XpCurve = 'linear' | 'exp' | 'custom';

export interface ResourceEntry {
  type: 'currency' | 'item';
  id: string;
  amount?: number;
  baseCapacity?: number;
  baseAmount?: number;
  ratePerHour?: number;
  growthRate?: GrowthRate;
  growthScalar?: number;
}

export interface AllowedBuildingEntry {
  buildingDefId: string;
  maxCount?: number;
  minCount?: number;
}

export interface AllowedRoomEntry {
  roomDefId: string;
  maxCount?: number;
  minCount?: number;
}

export type OnStarveBehavior = 'starved' | 'paused';

export interface LevelBlock {
  xpThreshold?: number;
  workers?: { slots: number; rules?: Record<string, any> };
  buildings?: { slots: number; allowed?: AllowedBuildingEntry[]; rules?: Record<string, any> };
  rooms?: { allowed?: AllowedRoomEntry[] };
  storage?: ResourceEntry[];
  production?: ResourceEntry[];
  consumption?: ResourceEntry[];
  constructionCost?: ResourceEntry[];
  effects?: Record<string, any>;
  onStarve?: OnStarveBehavior;
  timer?: { duration: number };
  [key: string]: any;
}

export interface LevelRules {
  maxLevel?: number;
  xpCurve?: XpCurve;
  baseXP?: number;
  xpRate?: number;
  level?: Record<string, LevelBlock>;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    if (srcVal === undefined) continue;
    if (Array.isArray(srcVal)) {
      result[key] = [...srcVal];
    } else if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
      result[key] = deepMerge(result[key] || {}, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

export function resolveLevelConfig(rules: LevelRules, level: number): LevelBlock {
  const levelMap = rules.level || {};
  const sortedKeys = Object.keys(levelMap)
    .map(Number)
    .filter((k) => !isNaN(k) && k <= level)
    .sort((a, b) => a - b);

  let merged: LevelBlock = {};
  for (const key of sortedKeys) {
    merged = deepMerge(merged, levelMap[String(key)]);
  }
  return merged;
}

export function resolveAllowedBuildings(rules: LevelRules, level: number): AllowedBuildingEntry[] {
  const levelMap = rules.level || {};
  const sortedKeys = Object.keys(levelMap)
    .map(Number)
    .filter((k) => !isNaN(k) && k <= level)
    .sort((a, b) => a - b);

  const map = new Map<string, AllowedBuildingEntry>();
  for (const key of sortedKeys) {
    const block = levelMap[String(key)];
    const allowed = block?.buildings?.allowed;
    if (Array.isArray(allowed)) {
      for (const entry of allowed) {
        map.set(entry.buildingDefId, { ...entry });
      }
    }
  }
  return Array.from(map.values());
}

export function resolveAllowedRooms(rules: LevelRules, level: number): AllowedRoomEntry[] {
  const levelMap = rules.level || {};
  const sortedKeys = Object.keys(levelMap)
    .map(Number)
    .filter((k) => !isNaN(k) && k <= level)
    .sort((a, b) => a - b);

  const map = new Map<string, AllowedRoomEntry>();
  for (const key of sortedKeys) {
    const block = levelMap[String(key)];
    const allowed = block?.rooms?.allowed;
    if (Array.isArray(allowed)) {
      for (const entry of allowed) {
        map.set(entry.roomDefId, { ...entry });
      }
    }
  }
  return Array.from(map.values());
}

export function calcGrowth(
  base: number,
  growthRate: GrowthRate | undefined,
  growthScalar: number | undefined,
  level: number,
): number {
  const scalar = growthScalar ?? 0;
  switch (growthRate) {
    case 'linear':
      return Math.floor(base + scalar * (level - 1));
    case 'exp':
      return Math.floor(base * Math.pow(scalar, level - 1));
    case 'flat':
    default:
      return Math.floor(base);
  }
}

export function resolveStorageCapacity(
  entries: ResourceEntry[] | undefined,
  level: number,
): Record<string, number> {
  if (!entries || entries.length === 0) return {};
  const result: Record<string, number> = {};
  for (const entry of entries) {
    const cap = calcGrowth(
      entry.baseCapacity ?? 0,
      entry.growthRate,
      entry.growthScalar,
      level,
    );
    result[entry.id] = cap;
  }
  return result;
}

export function resolveProductionRates(
  entries: ResourceEntry[] | undefined,
  level: number,
): Record<string, number> {
  if (!entries || entries.length === 0) return {};
  const result: Record<string, number> = {};
  for (const entry of entries) {
    const rate = calcGrowth(
      entry.ratePerHour ?? 0,
      entry.growthRate,
      entry.growthScalar,
      level,
    );
    result[entry.id] = rate;
  }
  return result;
}

export function resolveConsumptionRates(
  entries: ResourceEntry[] | undefined,
  level: number,
): Record<string, number> {
  if (!entries || entries.length === 0) return {};
  const result: Record<string, number> = {};
  for (const entry of entries) {
    const rate = calcGrowth(
      entry.ratePerHour ?? 0,
      entry.growthRate,
      entry.growthScalar,
      level,
    );
    result[entry.id] = rate;
  }
  return result;
}

export function resolveConstructionCosts(
  entries: ResourceEntry[] | undefined,
  level: number,
): Array<{ type: string; id: string; amount: number }> {
  if (!entries || entries.length === 0) return [];
  return entries.map((entry) => ({
    type: entry.type,
    id: entry.id,
    amount: calcGrowth(
      entry.amount ?? entry.baseAmount ?? 0,
      entry.growthRate,
      entry.growthScalar,
      level,
    ),
  }));
}

export interface LocationLevelUnlocks {
  workerSlotsAdded: number;
  buildingSlotsAdded: number;
  newAllowedBuildings: string[];
  newAllowedRooms: string[];
  storageAdded: Array<{ type: string; id: string; addedCapacity: number }>;
  productionAdded: Array<{ type: string; id: string; addedRate: number }>;
}

export function diffLocationLevelUnlocks(
  rules: LevelRules,
  fromLevel: number,
  toLevel: number,
): LocationLevelUnlocks {
  const fromCfg = resolveLevelConfig(rules, fromLevel);
  const toCfg = resolveLevelConfig(rules, toLevel);

  // Allowed buildings/rooms: use cumulative resolvers so intermediate
  // levels' unlocks are not lost when jumping multiple levels at once
  // (resolveLevelConfig replaces arrays on deepMerge).
  const fromAllowedB = new Set(
    resolveAllowedBuildings(rules, fromLevel).map((a) => a.buildingDefId),
  );
  const newAllowedBuildings = resolveAllowedBuildings(rules, toLevel)
    .map((a) => a.buildingDefId)
    .filter((id) => id && !fromAllowedB.has(id));

  const fromAllowedR = new Set(
    resolveAllowedRooms(rules, fromLevel).map((a) => a.roomDefId),
  );
  const newAllowedRooms = resolveAllowedRooms(rules, toLevel)
    .map((a) => a.roomDefId)
    .filter((id) => id && !fromAllowedR.has(id));

  // Storage/production: resolve concrete per-level snapshots (which apply
  // growth) and diff by id. Resources introduced only at toLevel correctly
  // diff against 0, and entries whose config changes between levels use
  // the proper basis on each side.
  const fromStorageById = resolveStorageCapacity(fromCfg.storage, fromLevel);
  const toStorageById = resolveStorageCapacity(toCfg.storage, toLevel);
  const storageTypeById = new Map<string, string>();
  for (const s of (fromCfg.storage as ResourceEntry[]) || []) {
    if (s?.id) storageTypeById.set(s.id, s.type);
  }
  for (const s of (toCfg.storage as ResourceEntry[]) || []) {
    if (s?.id) storageTypeById.set(s.id, s.type);
  }
  const storageAdded: Array<{ type: string; id: string; addedCapacity: number }> = [];
  for (const id of new Set([
    ...Object.keys(fromStorageById),
    ...Object.keys(toStorageById),
  ])) {
    const before = fromStorageById[id] ?? 0;
    const after = toStorageById[id] ?? 0;
    const delta = after - before;
    if (delta > 0) {
      storageAdded.push({
        type: storageTypeById.get(id) ?? 'currency',
        id,
        addedCapacity: delta,
      });
    }
  }

  const fromProdById = resolveProductionRates(fromCfg.production, fromLevel);
  const toProdById = resolveProductionRates(toCfg.production, toLevel);
  const prodTypeById = new Map<string, string>();
  for (const p of (fromCfg.production as ResourceEntry[]) || []) {
    if (p?.id) prodTypeById.set(p.id, p.type);
  }
  for (const p of (toCfg.production as ResourceEntry[]) || []) {
    if (p?.id) prodTypeById.set(p.id, p.type);
  }
  const productionAdded: Array<{ type: string; id: string; addedRate: number }> = [];
  for (const id of new Set([
    ...Object.keys(fromProdById),
    ...Object.keys(toProdById),
  ])) {
    const before = fromProdById[id] ?? 0;
    const after = toProdById[id] ?? 0;
    const delta = after - before;
    if (delta > 0) {
      productionAdded.push({
        type: prodTypeById.get(id) ?? 'currency',
        id,
        addedRate: delta,
      });
    }
  }

  return {
    workerSlotsAdded: Math.max(0, (toCfg.workers?.slots ?? 0) - (fromCfg.workers?.slots ?? 0)),
    buildingSlotsAdded: Math.max(0, (toCfg.buildings?.slots ?? 0) - (fromCfg.buildings?.slots ?? 0)),
    newAllowedBuildings,
    newAllowedRooms,
    storageAdded,
    productionAdded,
  };
}

export function calcXpForLevel(rules: LevelRules, targetLevel: number): number {
  const curve = rules.xpCurve ?? 'exp';
  const baseXP = rules.baseXP ?? 100;
  const xpRate = rules.xpRate ?? 1.5;

  if (curve === 'custom') {
    const levelMap = rules.level || {};
    const block = levelMap[String(targetLevel)];
    if (block?.xpThreshold !== undefined) return block.xpThreshold;
    const sortedKeys = Object.keys(levelMap)
      .map(Number)
      .filter((k) => !isNaN(k) && k <= targetLevel)
      .sort((a, b) => b - a);
    for (const key of sortedKeys) {
      if (levelMap[String(key)]?.xpThreshold !== undefined) {
        return levelMap[String(key)].xpThreshold!;
      }
    }
    return Math.floor(baseXP * Math.pow(xpRate, targetLevel - 1));
  }

  if (curve === 'linear') {
    return Math.floor(baseXP * targetLevel);
  }

  return Math.floor(baseXP * Math.pow(xpRate, targetLevel - 1));
}

export function calcTotalXpToLevel(rules: LevelRules, targetLevel: number): number {
  let total = 0;
  for (let lvl = 2; lvl <= targetLevel; lvl++) {
    total += calcXpForLevel(rules, lvl);
  }
  return total;
}
