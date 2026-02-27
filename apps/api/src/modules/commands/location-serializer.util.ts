import {
  resolveLevelConfig,
  resolveProductionRates,
  resolveConstructionCosts,
  calcGrowth,
  LevelRules,
} from '../game-rules/level-config.util';

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

  return {
    id: location.id,
    ownerUserId: location.ownerUserId,
    definitionId: location.definitionId,
    regionId: location.regionId,
    name: location.definitionId || location.regionId || 'Location',
    region: location.regionId || '',
    isUnique: location.isUnique,
    level: location.level,
    xp: location.xp?.toString?.() ?? '0',
    threatLevel: location.threatLevel,
    corruptionLevel: location.corruptionLevel,
    enabled: location.enabled !== false,
    lastCollectionTick: location.lastCollectionTick?.toString?.() ?? '0',
    storage: {
      capacity: storage.capacity || {},
      stored: storage.stored || {},
      productionRates: storage.productionRates || {},
      effectiveProductionRates: storage.effectiveProductionRates || {},
    },
    lastAccruedTick: location.lastCollectionTick?.toString?.() ?? '0',
    buildings: (location.buildings ?? []).map((b: any) => {
      const job = jobsByBuildingId.get(b.id);
      const jobTimer = job?.timer as any;
      const isEnabled = b.enabled !== false;
      const status = job ? 'building' : (isEnabled ? 'active' : 'disabled');

      const defTags: string[] = Array.isArray(b.buildingDef?.tags) ? b.buildingDef.tags : [];
      let category = 'GENERATOR';
      if (defTags.includes('storage')) category = 'STORAGE';
      else if (defTags.includes('defense')) category = 'DEFENSE';

      const bRules = (b.buildingDef?.rules as LevelRules) || {};
      const bConfig = resolveLevelConfig(bRules, b.level);
      const bProduction = resolveProductionRates(bConfig.production, b.level);
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
        outputType: resolved.outputType,
        outputRefId: resolved.outputRefId,
        resourcePerHour: String(rph),
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
    workers: (location.workerAssignments ?? []).map((w: any) => ({
      id: w.id,
      locationId: location.id,
      entityId: w.entityId,
      roleTag: w.roleTag,
      slotIndex: 0,
    })),
  };
}
