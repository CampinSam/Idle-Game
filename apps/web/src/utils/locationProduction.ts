const BPS_BASE = 10000;

function getThreatMult(threat: number): number {
  if (threat <= 20) return 10000;
  if (threat <= 40) return 9500;
  if (threat <= 60) return 8500;
  if (threat <= 80) return 7000;
  return 5000;
}

function getWorkerMult(workerCount: number): number {
  return 10000 + workerCount * 2000;
}

function getCapacityForKey(location: any, key: string): number {
  const storageCapacity = location.storage?.capacity || {};
  const [, resourceId] = key.split(':');
  let base = Number(storageCapacity[resourceId] || storageCapacity[key] || 0);
  let flatAdds = 0;
  let multBps = BPS_BASE;

  for (const building of (location.buildings || [])) {
    const bData = building.data as any;
    if (bData?.capacityFlat && bData.capacityFlat[key]) {
      flatAdds += Number(bData.capacityFlat[key]);
    }
    if (bData?.capacityMultBps && bData.capacityMultBps[key]) {
      multBps = Math.floor((multBps * Number(bData.capacityMultBps[key])) / BPS_BASE);
    }
    for (const room of (building.rooms || [])) {
      const roomData = room.data as any;
      if (roomData?.capacityFlat && roomData.capacityFlat[key]) {
        flatAdds += Number(roomData.capacityFlat[key]);
      }
      if (roomData?.capacityMultBps && roomData.capacityMultBps[key]) {
        multBps = Math.floor((multBps * Number(roomData.capacityMultBps[key])) / BPS_BASE);
      }
    }
  }

  return Math.floor(((base + flatAdds) * multBps) / BPS_BASE);
}

export interface GeneratorProduction {
  buildingId: string;
  buildingName: string;
  buildingLevel: number;
  resourceKey: string;
  outputType: string;
  outputRefId: string;
  ratePerHour: number;
}

export interface ResourceSummary {
  key: string;
  outputType: string;
  outputRefId: string;
  totalRatePerHour: number;
  currentAmount: number;
  capacity: number;
  generators: GeneratorProduction[];
}

export function computeGeneratorProduction(
  location: any,
): GeneratorProduction[] {
  const generators = (location.buildings || []).filter(
    (b: any) => b.enabled && b.status !== 'building',
  );

  const workerCount = (location.workers || []).length;
  const workerMultBps = getWorkerMult(workerCount);
  const threatMultBps = getThreatMult(location.threatLevel || 0);

  const results: GeneratorProduction[] = [];

  for (const building of generators) {
    if (!building.outputRefId || building.outputRefId === 'null') continue;
    const resourcePerHour = Number(building.resourcePerHour || 0);
    const key = `${building.outputType}:${building.outputRefId}`;

    let output = resourcePerHour;
    output = (output * workerMultBps) / BPS_BASE;
    output = (output * threatMultBps) / BPS_BASE;

    results.push({
      buildingId: building.id,
      buildingName: building.name || building.refId || building.id,
      buildingLevel: building.level,
      resourceKey: key,
      outputType: building.outputType,
      outputRefId: building.outputRefId,
      ratePerHour: output,
    });
  }

  return results;
}

export function aggregateByResource(
  location: any,
  generators: GeneratorProduction[],
): ResourceSummary[] {
  const storageByKey = new Map<string, number>();
  for (const sb of (location.storageBalances || [])) {
    storageByKey.set(`${sb.outputType}:${sb.outputRefId}`, Number(sb.amount));
  }

  const grouped = new Map<string, {
    outputType: string;
    outputRefId: string;
    totalRatePerHour: number;
    generators: GeneratorProduction[];
  }>();

  for (const gen of generators) {
    const existing = grouped.get(gen.resourceKey);
    if (existing) {
      existing.totalRatePerHour += gen.ratePerHour;
      existing.generators.push(gen);
    } else {
      grouped.set(gen.resourceKey, {
        outputType: gen.outputType,
        outputRefId: gen.outputRefId,
        totalRatePerHour: gen.ratePerHour,
        generators: [gen],
      });
    }
  }

  const allKeys = new Set<string>();
  for (const [k] of grouped) allKeys.add(k);
  for (const [k] of storageByKey) allKeys.add(k);

  const results: ResourceSummary[] = [];
  for (const key of allKeys) {
    const [outputType, outputRefId] = key.split(':');
    const group = grouped.get(key);
    const capacity = getCapacityForKey(location, key);
    const currentAmount = storageByKey.get(key) ?? 0;

    results.push({
      key,
      outputType: group?.outputType ?? outputType ?? '',
      outputRefId: group?.outputRefId ?? outputRefId ?? '',
      totalRatePerHour: group?.totalRatePerHour ?? 0,
      currentAmount,
      capacity,
      generators: group?.generators ?? [],
    });
  }

  return results;
}

export function formatRate(ratePerHour: number): string {
  if (!isFinite(ratePerHour) || ratePerHour < 0) return '0';
  if (ratePerHour >= 1000) return `${(ratePerHour / 1000).toFixed(1)}k`;
  if (ratePerHour >= 1) return `${Math.round(ratePerHour)}`;
  if (ratePerHour > 0) return `${ratePerHour.toFixed(1)}`;
  return '0';
}

export function formatAmount(amount: number): string {
  if (!isFinite(amount) || amount < 0) return '0';
  if (amount >= 10000) return `${(amount / 1000).toFixed(1)}k`;
  return `${Math.floor(amount)}`;
}
