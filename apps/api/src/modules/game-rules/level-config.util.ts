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

export interface LevelBlock {
  xpThreshold?: number;
  workers?: { slots: number; rules?: Record<string, any> };
  buildings?: { slots: number; allowed?: AllowedBuildingEntry[]; rules?: Record<string, any> };
  rooms?: { allowed?: AllowedRoomEntry[] };
  storage?: ResourceEntry[];
  production?: ResourceEntry[];
  constructionCost?: ResourceEntry[];
  effects?: Record<string, any>;
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
