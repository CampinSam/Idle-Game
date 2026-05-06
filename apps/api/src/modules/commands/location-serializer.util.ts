import {
  resolveLevelConfig,
  resolveProductionRates,
  resolveConsumptionRates,
  resolveStorageCapacity,
  resolveConstructionCosts,
  calcGrowth,
  calcXpForLevel,
  LevelRules,
} from '../game-rules/level-config.util';

function getThreatMult(threat: number): number {
  if (threat <= 20) return 10000;
  if (threat <= 40) return 9500;
  if (threat <= 60) return 8500;
  if (threat <= 80) return 7000;
  return 5000;
}

export function serializeLocation(
  location: any,
  buildingJobs: any[] = [],
  currencyIds: Set<string> = new Set(),
): any {
  const jobsByBuildingId = new Map<string, any>();
  for (const job of buildingJobs) {
    const jobData = job.data as any;
    if (jobData?.buildingId) {
      jobsByBuildingId.set(jobData.buildingId, job);
    }
  }

  const storage = (location.storage as any) || {};
  // Worker contribution to throughput is stat-driven (sum of FOC/SPD across
  // assigned workers' equipped stats). The settlement service caches the
  // resolved multiplier on `storage.workerProductionMultBps`; the serializer
  // reads from there rather than recomputing. Falls back to 10000 (×1.00)
  // when the meta hasn't been recalculated yet.
  const workerMult = Number(storage.workerProductionMultBps ?? 10000);
  const threatMult = getThreatMult(location.threatLevel || 0);

  const locRules = (location.definition?.rules as LevelRules) || {};
  const locConfig = resolveLevelConfig(locRules, location.level);
  const maxWorkers = locConfig.workers?.slots ?? 2;
  const maxLocLevel = locRules.maxLevel ?? 50;
  const xpToNext = location.level >= maxLocLevel ? 0 : calcXpForLevel(locRules, location.level + 1);

  const resourceTypes: Record<string, string> = {};
  for (const b of (location.buildings ?? [])) {
    const bRules = (b.buildingDef?.rules as LevelRules) || {};
    const bConfig = resolveLevelConfig(bRules, b.level);
    const bProd = resolveProductionRates(bConfig.production, b.level);
    const bCons = resolveConsumptionRates(bConfig.consumption, b.level);
    for (const resId of Object.keys(bProd)) {
      if (!resourceTypes[resId]) {
        resourceTypes[resId] = currencyIds.has(resId) ? 'CURRENCY' : 'ITEM';
      }
    }
    for (const resId of Object.keys(bCons)) {
      if (!resourceTypes[resId]) {
        resourceTypes[resId] = currencyIds.has(resId) ? 'CURRENCY' : 'ITEM';
      }
    }
  }

  return {
    id: location.id,
    ownerUserId: location.ownerUserId,
    definitionId: location.definitionId,
    regionId: location.regionId,
    name: location.definitionId || location.regionId || 'Location',
    kind: location.definition?.kind || '',
    region: location.definition?.kind || '',
    isUnique: location.isUnique,
    level: location.level,
    xp: location.xp?.toString?.() ?? '0',
    maxLevel: maxLocLevel,
    xpToNext,
    threatLevel: location.threatLevel,
    corruptionLevel: location.corruptionLevel,
    enabled: location.enabled !== false,
    lastCollectionTick: location.lastCollectionTick?.toString?.() ?? '0',
    storage: {
      capacity: storage.capacity || {},
      stored: storage.stored || {},
      productionRates: storage.productionRates || {},
      consumptionRates: storage.consumptionRates || {},
      effectiveProductionRates: storage.effectiveProductionRates || {},
      effectiveConsumptionRates: storage.effectiveConsumptionRates || {},
      workerProductionMultBps: Number(storage.workerProductionMultBps ?? 10000),
      workerConsumptionMultBps: Number(storage.workerConsumptionMultBps ?? 10000),
      resourceTypes,
      lastSettledAt: storage.lastSettledAt ?? location.createdAt?.toISOString() ?? null,
    },
    lastAccruedTick: location.lastCollectionTick?.toString?.() ?? '0',
    buildings: (location.buildings ?? []).map((b: any) => {
      const job = jobsByBuildingId.get(b.id);
      const jobTimer = job?.timer as any;
      const isEnabled = b.enabled !== false;
      const status = job ? 'building' : (isEnabled ? 'active' : 'disabled');

      const defTags: string[] = Array.isArray(b.buildingDef?.tags) ? b.buildingDef.tags : [];
      const explicitCategory: string | null = b.buildingDef?.category || null;
      let category = 'GENERATOR';
      if (explicitCategory) category = explicitCategory;
      else if (defTags.includes('storage')) category = 'STORAGE';
      else if (defTags.includes('defense')) category = 'DEFENSE';
      else if (defTags.includes('workshop') || defTags.includes('crafting')) category = 'WORKSHOP';

      const displayDef = b.buildingDef?.displayDef ? {
        id: b.buildingDef.displayDef.id,
        borderColor: b.buildingDef.displayDef.borderColor,
        backgroundImage: b.buildingDef.displayDef.backgroundImage,
        cardBackground: b.buildingDef.displayDef.cardBackground,
        style: b.buildingDef.displayDef.style ?? {},
        data: b.buildingDef.displayDef.data,
      } : null;

      const bRules = (b.buildingDef?.rules as LevelRules) || {};
      const bConfig = resolveLevelConfig(bRules, b.level);
      const bProduction = resolveProductionRates(bConfig.production, b.level);
      const bConsumption = resolveConsumptionRates(bConfig.consumption, b.level);
      const bStorageContributions = resolveStorageCapacity(bConfig.storage, b.level);
      const primaryResource = Object.keys(bProduction)[0] || null;
      const resolved = primaryResource
        ? (currencyIds.has(primaryResource)
            ? { outputType: 'CURRENCY', outputRefId: primaryResource }
            : { outputType: 'ITEM', outputRefId: primaryResource })
        : { outputType: null, outputRefId: null };
      const rph = primaryResource ? bProduction[primaryResource] : 0;

      const maxLevel: number = (bRules as any).maxLevel ?? 10;
      const nextLevel = b.level + 1;
      const nextConfig = resolveLevelConfig(bRules, nextLevel);
      const upgradeCosts = resolveConstructionCosts(nextConfig.constructionCost, nextLevel);
      const rawTimer = (nextConfig.timer as any) || null;
      const scaledDuration = rawTimer
        ? calcGrowth(rawTimer.duration ?? 0, rawTimer.growthRate, rawTimer.growthScalar, nextLevel)
        : 0;
      const upgradeTimer = scaledDuration > 0 ? { duration: scaledDuration } : null;

      return {
        id: b.id,
        locationId: location.id,
        buildingDefId: b.buildingDefId,
        name: b.buildingDef?.name || b.buildingDefId,
        category,
        level: b.level,
        maxLevel,
        enabled: isEnabled,
        status,
        displayDef,
        outputType: resolved.outputType,
        outputRefId: resolved.outputRefId,
        resourcePerHour: String(rph),
        effectiveResourcePerHour: String(Math.floor(Math.floor(rph * workerMult / 10000) * threatMult / 10000)),
        consumptionRates: bConsumption,
        storageContributions: bStorageContributions,
        upgradeCosts,
        upgradeTimer,
        jobId: job?.id || null,
        startTick: jobTimer?.startTick ?? null,
        durationTicks: jobTimer?.durationTicks ?? null,
        jobData: job?.data || null,
        rooms: (b.rooms ?? []).map((r: any) => ({
          id: r.id,
          buildingInstanceId: b.id,
          roomDefId: r.roomDefId,
          name: r.roomDef?.name || r.roomDefId,
          level: r.level,
          enabled: r.enabled !== false,
        })),
      };
    }),
    maxWorkers,
    workers: (location.workerAssignments ?? []).map((w: any, i: number) => ({
      id: w.id,
      locationId: location.id,
      entityId: w.entityId,
      roleTag: w.roleTag,
      slotIndex: i,
    })),
  };
}
