import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';
import {
  resolveLevelConfig,
  resolveProductionRates,
  resolveStorageCapacity,
  LevelRules,
} from '../game-rules/level-config.util';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const MAX_ELAPSED_TICKS = BigInt(7 * 24 * 60 * 60);
const BPS_BASE = BigInt(10000);

function getThreatMultBps(threat: number): bigint {
  if (threat <= 20) return BigInt(10000);
  if (threat <= 40) return BigInt(9500);
  if (threat <= 60) return BigInt(8500);
  if (threat <= 80) return BigInt(7000);
  return BigInt(5000);
}

function getWorkerMultBps(workerCount: number, maxWorkers: number): bigint {
  if (maxWorkers === 0) return BPS_BASE;
  const ratio = workerCount / maxWorkers;
  return BigInt(Math.floor(5000 + ratio * 5000));
}

export interface SettlementResult {
  locationId: string;
  elapsedTicks: string;
  produced: Array<{ resourceId: string; amount: string }>;
  capped: boolean;
}

export interface StorageInfo {
  capacity: Record<string, number>;
  stored: Record<string, number>;
}

@Injectable()
export class LocationSettlementService {
  private readonly logger = new Logger(LocationSettlementService.name);

  constructor(private prisma: PrismaService) {}

  async settleLocationTx(
    tx: TxClient,
    locationId: string,
    userId: string,
    currentTick: bigint,
  ): Promise<SettlementResult> {
    const location = await (tx as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: userId },
      include: {
        workerAssignments: true,
      },
    });

    if (!location) {
      throw new Error(`Location ${locationId} not found for user ${userId}`);
    }

    let elapsedTicks = currentTick - location.lastCollectionTick;
    if (elapsedTicks <= BigInt(0)) {
      return {
        locationId,
        elapsedTicks: '0',
        produced: [],
        capped: false,
      };
    }

    let capped = false;
    if (elapsedTicks > MAX_ELAPSED_TICKS) {
      this.logger.warn(
        `Clamping elapsedTicks from ${elapsedTicks} to ${MAX_ELAPSED_TICKS} for location ${locationId}`,
      );
      elapsedTicks = MAX_ELAPSED_TICKS;
      capped = true;
    }

    if (!location.enabled) {
      await (tx as any).locationInstance.update({
        where: { id: locationId },
        data: { lastCollectionTick: currentTick },
      });
      return {
        locationId,
        elapsedTicks: elapsedTicks.toString(),
        produced: [],
        capped: false,
      };
    }

    const existingStorage = (location.storage as any) || {};
    const mergedOutputs: Record<string, number> = existingStorage.productionRates || {};
    const locStorageCapacity: Record<string, number> = existingStorage.capacity || {};

    if (Object.keys(mergedOutputs).length === 0) {
      await (tx as any).locationInstance.update({
        where: { id: locationId },
        data: { lastCollectionTick: currentTick },
      });
      return {
        locationId,
        elapsedTicks: elapsedTicks.toString(),
        produced: [],
        capped,
      };
    }

    const locationDef = await (tx as any).locationDefinition.findUnique({
      where: { id: location.definitionId },
    });
    const locRules = (locationDef?.rules as LevelRules) || {};
    const locConfig = resolveLevelConfig(locRules, location.level);

    const locWorkerSlots = locConfig.workers?.slots ?? 2;
    const workerCount = location.workerAssignments.length;
    const workerMultBps = getWorkerMultBps(workerCount, locWorkerSlots);
    const threatMultBps = getThreatMultBps(location.threatLevel);

    const storedAmounts: Record<string, number> = { ...(existingStorage.stored || {}) };

    // Clamp stored amounts to current capacity to handle cases where capacity decreased
    for (const resourceId of Object.keys(storedAmounts)) {
      const cap = locStorageCapacity[resourceId] ?? 0;
      if (cap > 0 && storedAmounts[resourceId] > cap) {
        storedAmounts[resourceId] = cap;
      }
    }

    const produced: Array<{ resourceId: string; amount: string }> = [];

    for (const [resourceId, ratePerHour] of Object.entries(mergedOutputs)) {
      let output = BigInt(Math.floor(ratePerHour * Number(elapsedTicks))) / BigInt(3600);
      output = output * workerMultBps / BPS_BASE;
      output = output * threatMultBps / BPS_BASE;

      if (output > BigInt(0)) {
        const capacity = locStorageCapacity[resourceId] ?? 0;
        const currentStored = storedAmounts[resourceId] ?? 0;
        const available = Math.max(0, capacity - currentStored);
        const actualProduced = Number(output) < available ? Number(output) : available;

        if (actualProduced > 0) {
          storedAmounts[resourceId] = currentStored + actualProduced;
          produced.push({
            resourceId,
            amount: String(actualProduced),
          });
        }
      }
    }

    await (tx as any).locationInstance.update({
      where: { id: locationId },
      data: {
        lastCollectionTick: currentTick,
        storage: {
          ...existingStorage,
          stored: storedAmounts,
        },
      },
    });

    return {
      locationId,
      elapsedTicks: elapsedTicks.toString(),
      produced,
      capped,
    };
  }

  computeLocationMeta(location: any): { capacity: Record<string, number>; productionRates: Record<string, number> } {
    const locRules = (location.definition?.rules as LevelRules) || {};
    const locConfig = resolveLevelConfig(locRules, location.level);
    const capacity = resolveStorageCapacity(locConfig.storage, location.level);
    const productionRates = resolveProductionRates(locConfig.production, location.level);

    for (const building of (location.buildings ?? [])) {
      if (building.enabled === false) continue;
      const bState = (building.state as any) || {};
      if (bState.status !== 'active') continue;
      const bRules = (building.buildingDef?.rules as LevelRules) || {};
      const bConfig = resolveLevelConfig(bRules, building.level);

      const bStorage = resolveStorageCapacity(bConfig.storage, building.level);
      for (const [resId, cap] of Object.entries(bStorage)) {
        capacity[resId] = (capacity[resId] || 0) + cap;
      }

      const bProduction = resolveProductionRates(bConfig.production, building.level);
      for (const [resId, rate] of Object.entries(bProduction)) {
        productionRates[resId] = (productionRates[resId] || 0) + rate;
      }
    }

    for (const building of (location.buildings ?? [])) {
      if (building.enabled === false) continue;
      const bState = (building.state as any) || {};
      if (bState.status !== 'active') continue;
      for (const room of (building.rooms ?? [])) {
        if (room.enabled === false) continue;
        const rRules = (room.roomDef?.rules as LevelRules) || {};
        const rConfig = resolveLevelConfig(rRules, room.level);

        const rStorage = resolveStorageCapacity(rConfig.storage, room.level);
        for (const [resId, cap] of Object.entries(rStorage)) {
          capacity[resId] = (capacity[resId] || 0) + cap;
        }

        const rProduction = resolveProductionRates(rConfig.production, room.level);
        for (const [resId, rate] of Object.entries(rProduction)) {
          productionRates[resId] = (productionRates[resId] || 0) + rate;
        }

        if (rConfig.effects?.productionMultBps) {
          const mult = Number(rConfig.effects.productionMultBps);
          for (const resId of Object.keys(productionRates)) {
            productionRates[resId] = Math.floor(productionRates[resId] * mult / 10000);
          }
        }
      }
    }

    return { capacity, productionRates };
  }

  async getStorageInfo(locationId: string, userId: string): Promise<StorageInfo & { productionRates?: Record<string, number> }> {
    const location = await (this.prisma as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: userId },
    });
    if (!location) {
      return { capacity: {}, stored: {} };
    }
    const storage = (location.storage as any) || {};
    return {
      capacity: storage.capacity || {},
      stored: storage.stored || {},
      productionRates: storage.productionRates || {},
    };
  }

  async recalculateLocationMeta(locationId: string, client?: any): Promise<{ capacity: Record<string, number>; productionRates: Record<string, number>; effectiveProductionRates: Record<string, number> }> {
    const db = client || this.prisma;
    const location = await (db as any).locationInstance.findFirst({
      where: { id: locationId },
      include: {
        definition: true,
        buildings: { include: { buildingDef: true, rooms: { include: { roomDef: true } } } },
        workerAssignments: true,
      },
    });
    if (!location) return { capacity: {}, productionRates: {}, effectiveProductionRates: {} };

    const { capacity, productionRates } = this.computeLocationMeta(location);

    const locRules = (location.definition?.rules as LevelRules) || {};
    const locConfig = resolveLevelConfig(locRules, location.level);
    const maxWorkers: number = locConfig.workers?.slots ?? 2;
    const workerCount: number = (location.workerAssignments || []).length;
    const workerMultBps = getWorkerMultBps(workerCount, maxWorkers);
    const threatMultBps = getThreatMultBps(location.threatLevel || 0);

    const effectiveProductionRates: Record<string, number> = {};
    for (const [resId, rate] of Object.entries(productionRates)) {
      let effective = rate;
      effective = Math.floor(effective * Number(workerMultBps) / 10000);
      effective = Math.floor(effective * Number(threatMultBps) / 10000);
      effectiveProductionRates[resId] = effective;
    }

    const storage = (location.storage as any) || {};
    await (db as any).locationInstance.update({
      where: { id: locationId },
      data: {
        storage: {
          ...storage,
          capacity,
          productionRates,
          effectiveProductionRates,
        },
      },
    });
    return { capacity, productionRates, effectiveProductionRates };
  }
}
