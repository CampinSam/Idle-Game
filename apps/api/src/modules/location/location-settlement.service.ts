import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';
import { DefinitionCacheService } from '../definition-cache/definition-cache.service';
import {
  resolveLevelConfig,
  resolveProductionRates,
  resolveConsumptionRates,
  resolveStorageCapacity,
  LevelRules,
  OnStarveBehavior,
  ResourceEntry,
} from '../game-rules/level-config.util';
import { CurrencyService } from '../currency/currency.service';
import { InventoryService } from '../inventory/inventory.service';
import { EffectService } from '../effect/effect.service';
import { SynergyResolverService } from '../synergy/synergy-resolver.service';
import { EffectCategory, EffectTargetType, EffectTargetContext, type TraitPrimitive } from '@derp/shared';
import { sumEquippedStatsForEntities, StatMap } from '../entity/entity-stats.util';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const MAX_ELAPSED_TICKS = BigInt(7 * 24 * 60 * 60);
const BPS_BASE = BigInt(10000);
const MAX_PHASE_ITERATIONS = 50;

function getThreatMultBps(threat: number): bigint {
  if (threat <= 20) return BigInt(10000);
  if (threat <= 40) return BigInt(9500);
  if (threat <= 60) return BigInt(8500);
  if (threat <= 80) return BigInt(7000);
  return BigInt(5000);
}

/**
 * Stat-driven worker contribution to outpost throughput.
 *
 *   productionMultBps  = 10000 + 50 × (ΣFOC + ΣSPD)
 *   consumptionMultBps = max(0, 10000 + 50 × (ΣSPD − ΣFOC))
 *
 * Stats are the sum across every assigned worker's *equipped* stats so gear
 * counts. Zero workers → both multipliers are exactly 1.00 (no change), and
 * consumption is floored at 0 (high-FOC teams can drive consumption to zero
 * but never refund resources).
 */
export function getWorkerMultsBps(stats: StatMap): {
  productionMultBps: bigint;
  consumptionMultBps: bigint;
} {
  const focPlusSpd = stats.FOC + stats.SPD;
  const spdMinusFoc = stats.SPD - stats.FOC;
  const prod = 10000 + Math.round(50 * focPlusSpd);
  const cons = Math.max(0, 10000 + Math.round(50 * spdMinusFoc));
  return {
    productionMultBps: BigInt(prod),
    consumptionMultBps: BigInt(cons),
  };
}

export type BuildingStatus = 'operational' | 'starved' | 'paused';

export interface ProductionBundle {
  buildingId: string;
  buildingDefId: string;
  produces: Record<string, number>;
  consumes: Record<string, number>;
  resourceTypes: Record<string, 'currency' | 'item'>;
  onStarve: OnStarveBehavior;
  status: BuildingStatus;
}

export interface SettlementResult {
  locationId: string;
  elapsedTicks: string;
  produced: Array<{ resourceId: string; amount: string }>;
  consumed: Array<{ resourceId: string; amount: string }>;
  capped: boolean;
}

export interface StorageInfo {
  capacity: Record<string, number>;
  stored: Record<string, number>;
}

export interface LocationMetaResult {
  capacity: Record<string, number>;
  productionRates: Record<string, number>;
  consumptionRates: Record<string, number>;
  productionBundles: ProductionBundle[];
  netFlows: Record<string, number>;
}

function resolveOnStarve(instanceState: any, defConfig: any): OnStarveBehavior {
  if (instanceState?.onStarve === 'paused' || instanceState?.onStarve === 'starved') {
    return instanceState.onStarve;
  }
  if (defConfig?.onStarve === 'paused' || defConfig?.onStarve === 'starved') {
    return defConfig.onStarve;
  }
  return 'starved';
}

function resolveBundleStatus(
  bundleId: string,
  currentOnStarve: OnStarveBehavior,
  existingStatusMap: Map<string, { status: BuildingStatus; onStarve: OnStarveBehavior }>,
): BuildingStatus {
  const existing = existingStatusMap.get(bundleId);
  if (!existing) return 'operational';

  if (existing.status === 'paused' && currentOnStarve === 'starved') {
    return 'starved';
  }

  return existing.status;
}

function extractResourceTypes(entries: ResourceEntry[] | undefined): Record<string, 'currency' | 'item'> {
  if (!entries || entries.length === 0) return {};
  const result: Record<string, 'currency' | 'item'> = {};
  for (const entry of entries) {
    result[entry.id] = entry.type;
  }
  return result;
}

@Injectable()
export class LocationSettlementService {
  private readonly logger = new Logger(LocationSettlementService.name);

  constructor(
    private prisma: PrismaService,
    private effectService: EffectService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private synergyResolver: SynergyResolverService,
    private definitionCache: DefinitionCacheService,
  ) {}

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
        definition: true,
        buildings: { include: { buildingDef: { include: { displayDef: true } }, rooms: { include: { roomDef: true } } } },
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
        consumed: [],
        capped: false,
      };
    }

    let effectiveCurrentTick = currentTick;
    let capped = false;
    if (elapsedTicks > MAX_ELAPSED_TICKS) {
      this.logger.warn(
        `Clamping elapsedTicks from ${elapsedTicks} to ${MAX_ELAPSED_TICKS} for location ${locationId}`,
      );
      elapsedTicks = MAX_ELAPSED_TICKS;
      capped = true;
    }

    if (!location.enabled) {
      const existingStorageDisabled = (location.storage as any) || {};
      await (tx as any).locationInstance.update({
        where: { id: locationId },
        data: {
          lastCollectionTick: currentTick,
          storage: { ...existingStorageDisabled, lastSettledAt: new Date().toISOString() },
        },
      });
      return {
        locationId,
        elapsedTicks: elapsedTicks.toString(),
        produced: [],
        consumed: [],
        capped: false,
      };
    }

    const existingStorage = (location.storage as any) || {};
    const locStorageCapacity: Record<string, number> = existingStorage.capacity || {};
    const bundles: ProductionBundle[] = existingStorage.productionBundles || [];

    const hasAnyBundleActivity = bundles.some(
      b => Object.keys(b.produces).length > 0 || Object.keys(b.consumes).length > 0,
    );
    const mergedOutputs: Record<string, number> = existingStorage.productionRates || {};

    if (!hasAnyBundleActivity && Object.keys(mergedOutputs).length === 0) {
      await (tx as any).locationInstance.update({
        where: { id: locationId },
        data: {
          lastCollectionTick: currentTick,
          storage: { ...existingStorage, lastSettledAt: new Date().toISOString() },
        },
      });
      return {
        locationId,
        elapsedTicks: elapsedTicks.toString(),
        produced: [],
        consumed: [],
        capped,
      };
    }

    const workerEntityIds: string[] = (location.workerAssignments || [])
      .map((w: any) => w.entityId)
      .filter(Boolean);
    const workerStatsTotal = await sumEquippedStatsForEntities(tx as any, workerEntityIds);
    const { productionMultBps, consumptionMultBps } = getWorkerMultsBps(workerStatsTotal);
    const threatMultBps = getThreatMultBps(location.threatLevel);

    // Synergy: build descriptors from assigned workers and resolve rules.
    // resourceYieldModifiers per-resourceId scale production rates.
    const synergyYieldMap = new Map<string, { percentAdd: number; flat: number; multiplier: number }>();
    try {
      if (workerEntityIds.length > 0) {
        const workerEntities = await (tx as any).entity.findMany({
          where: { id: { in: workerEntityIds } },
          select: { id: true, role: true, traits: true, definitionId: true, nftCollectionDefId: true },
        });
        const locationRegionId: string | undefined = (location.regionId as string | undefined) ?? undefined;
        const workerDescriptors = workerEntities.map((e: any) => ({
          entityId: e.id as string,
          entityType: (e.role as string | undefined) ?? undefined,
          traits: (e.traits ?? {}) as Record<string, TraitPrimitive>,
          speciesId: e.definitionId as string | undefined,
          collectionId: e.nftCollectionDefId as string | undefined,
          rarity: typeof (e.traits as any)?.rarity === 'string' ? (e.traits as any).rarity : undefined,
          regionId: locationRegionId,
        }));
        const synergyResult = await this.synergyResolver.resolveRules(
          { activityType: 'outpost', teamSize: workerEntityIds.length, regionId: locationRegionId },
          workerDescriptors,
          workerDescriptors,
        );
        for (const mod of synergyResult.totals.resourceYieldModifiers) {
          synergyYieldMap.set(mod.resourceId, {
            percentAdd: mod.percentAdd,
            flat: mod.flat,
            multiplier: mod.multiplier,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Synergy resolution failed for location ${locationId}: ${err}`);
    }

    let effectProductionBps = BigInt(10000);
    try {
      const locationTargetContext: EffectTargetContext = {
        archetype: location.definition?.id ?? undefined,
      };
      const prodMod = await this.effectService.resolveForTarget(
        userId, EffectTargetType.LOCATION, locationId, EffectCategory.PRODUCTION_RATE, tx, locationTargetContext,
      );
      const effectMultiplier = 1 + prodMod.flatAdd / 100 + prodMod.percentAdd / 100;
      effectProductionBps = BigInt(Math.round(effectMultiplier * Number(BPS_BASE) * prodMod.multiplier));
    } catch {}

    const storedAmounts: Record<string, number> = { ...(existingStorage.stored || {}) };

    for (const resourceId of Object.keys(storedAmounts)) {
      const cap = locStorageCapacity[resourceId] ?? 0;
      if (cap > 0 && storedAmounts[resourceId] > cap) {
        storedAmounts[resourceId] = cap;
      }
    }

    const hasAnyConsumption = bundles.some(b => Object.keys(b.consumes).length > 0);

    let totalProduced: Record<string, number> = {};
    let totalConsumed: Record<string, number> = {};

    if (!hasAnyConsumption) {
      for (const [resourceId, ratePerHour] of Object.entries(mergedOutputs)) {
        // Apply per-resource synergy yield modifier before computing output.
        const synergyMod = synergyYieldMap.get(resourceId);
        const effectiveRate = synergyMod
          ? (ratePerHour * (1 + synergyMod.percentAdd / 100) * synergyMod.multiplier) + synergyMod.flat
          : ratePerHour;

        let output = BigInt(Math.floor(effectiveRate * Number(elapsedTicks))) / BigInt(3600);
        output = output * productionMultBps / BPS_BASE;
        output = output * threatMultBps / BPS_BASE;
        output = output * effectProductionBps / BPS_BASE;

        if (output > BigInt(0)) {
          const capacity = locStorageCapacity[resourceId] ?? 0;
          const currentStored = storedAmounts[resourceId] ?? 0;
          const available = Math.max(0, capacity - currentStored);
          const actualProduced = Number(output) < available ? Number(output) : available;

          if (actualProduced > 0) {
            storedAmounts[resourceId] = currentStored + actualProduced;
            totalProduced[resourceId] = (totalProduced[resourceId] || 0) + actualProduced;
          }
        }
      }
    } else {
      const globalResourceTypes = this.collectResourceTypes(bundles);
      const walletBalances = await this.fetchPlayerResourceBalances(tx, userId, globalResourceTypes);

      // Scale bundle produce rates by synergy resourceYieldModifiers before
      // phased settlement so the modifier applies per-resource correctly.
      const settlementBundles = synergyYieldMap.size > 0
        ? bundles.map(b => ({
            ...b,
            produces: Object.fromEntries(
              Object.entries(b.produces).map(([rid, rate]) => {
                const mod = synergyYieldMap.get(rid);
                const scaled = mod
                  ? (rate * (1 + mod.percentAdd / 100) * mod.multiplier) + mod.flat
                  : rate;
                return [rid, scaled];
              }),
            ),
          }))
        : bundles;

      const result = this.runPhasedSettlement(
        settlementBundles,
        storedAmounts,
        walletBalances,
        locStorageCapacity,
        Number(elapsedTicks),
        productionMultBps,
        consumptionMultBps,
        threatMultBps,
        effectProductionBps,
      );
      totalProduced = result.totalProduced;
      totalConsumed = result.totalConsumed;

      for (const [resId, amount] of Object.entries(result.storedAmounts)) {
        storedAmounts[resId] = amount;
      }

      for (const bundle of bundles) {
        const resultBundle = result.bundleStatuses.get(bundle.buildingId);
        if (resultBundle) {
          bundle.status = resultBundle;
        }
      }

      await this.deductConsumedFromWallet(
        tx, userId, result.walletConsumed, globalResourceTypes,
      );

      if (result.simulatedSeconds < Number(elapsedTicks)) {
        const simulatedTicks = BigInt(Math.floor(result.simulatedSeconds));
        elapsedTicks = simulatedTicks;
        effectiveCurrentTick = location.lastCollectionTick + simulatedTicks;
        this.logger.warn(
          `Phased settlement only simulated ${result.simulatedSeconds}s of ${Number(elapsedTicks)}s for location ${locationId} (safety cap hit)`,
        );
        capped = true;
      }
    }

    await (tx as any).locationInstance.update({
      where: { id: locationId },
      data: {
        lastCollectionTick: effectiveCurrentTick,
        storage: {
          ...existingStorage,
          stored: storedAmounts,
          productionBundles: bundles,
          lastSettledAt: new Date().toISOString(),
        },
      },
    });

    const produced = Object.entries(totalProduced)
      .filter(([, amount]) => amount > 0)
      .map(([resourceId, amount]) => ({ resourceId, amount: String(amount) }));

    const consumed = Object.entries(totalConsumed)
      .filter(([, amount]) => amount > 0)
      .map(([resourceId, amount]) => ({ resourceId, amount: String(amount) }));

    return {
      locationId,
      elapsedTicks: elapsedTicks.toString(),
      produced,
      consumed,
      capped,
    };
  }

  private collectResourceTypes(bundles: ProductionBundle[]): Record<string, 'currency' | 'item'> {
    const types: Record<string, 'currency' | 'item'> = {};
    for (const bundle of bundles) {
      if (bundle.resourceTypes) {
        Object.assign(types, bundle.resourceTypes);
      }
    }
    return types;
  }

  private async fetchPlayerResourceBalances(
    tx: TxClient,
    userId: string,
    resourceTypes: Record<string, 'currency' | 'item'>,
  ): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};

    const currencyIds = Object.entries(resourceTypes)
      .filter(([, type]) => type === 'currency')
      .map(([id]) => id);
    const itemIds = Object.entries(resourceTypes)
      .filter(([, type]) => type === 'item')
      .map(([id]) => id);

    if (currencyIds.length > 0) {
      const curDefs = await (tx as any).currency.findMany({
        where: { OR: currencyIds.flatMap((s: string) => [{ id: s }, { key: s }]) },
        select: { id: true, key: true },
      });
      const uuidToSlug = new Map<string, string>(curDefs.map((c: any) => [c.id, c.key]));
      const uuids: string[] = curDefs.map((c: any) => c.id);
      const rows = await (tx as any).userCurrencyBalance.findMany({
        where: { userId, currencyId: { in: uuids } },
        select: { currencyId: true, balance: true },
      });
      for (const row of rows) {
        const slug = uuidToSlug.get(row.currencyId) ?? row.currencyId;
        balances[slug] = Number(row.balance);
      }
    }

    if (itemIds.length > 0) {
      const itemDefs = this.definitionCache.getAll('itemDef')
        .filter((d: any) => itemIds.includes(d.id) || itemIds.includes(d.key));
      const uuidToSlug = new Map<string, string>(itemDefs.map((d: any) => [d.id, d.key]));
      const uuids: string[] = itemDefs.map((d: any) => d.id);
      const rows = await (tx as any).itemInstance.findMany({
        where: { userId, definitionId: { in: uuids } },
        select: { definitionId: true, quantity: true },
      });
      for (const row of rows) {
        const slug = uuidToSlug.get(row.definitionId) ?? row.definitionId;
        balances[slug] = (balances[slug] || 0) + row.quantity;
      }
    }

    return balances;
  }

  private async deductConsumedFromWallet(
    tx: TxClient,
    userId: string,
    walletConsumed: Record<string, number>,
    resourceTypes: Record<string, 'currency' | 'item'>,
  ): Promise<void> {
    for (const [resId, amount] of Object.entries(walletConsumed)) {
      if (amount <= 0) continue;

      const resType = resourceTypes[resId];
      if (!resType) continue;

      if (resType === 'currency') {
        await this.currencyService.spendTx(tx as any, {
          userId,
          currencyId: resId,
          amount,
          reason: 'building_consumption',
          sourceType: 'location_settlement',
          sourceId: resId,
        });
      } else {
        await this.inventoryService.removeItemTx(tx as any, {
          userId,
          itemId: resId,
          quantity: amount,
          reason: 'building_consumption',
          sourceType: 'location_settlement',
          sourceId: resId,
        });
      }
    }
  }

  private runPhasedSettlement(
    bundles: ProductionBundle[],
    storedAmounts: Record<string, number>,
    walletBalances: Record<string, number>,
    capacity: Record<string, number>,
    totalSeconds: number,
    productionMultBps: bigint,
    consumptionMultBps: bigint,
    threatMultBps: bigint,
    effectProductionBps: bigint,
  ): {
    totalProduced: Record<string, number>;
    totalConsumed: Record<string, number>;
    walletConsumed: Record<string, number>;
    storedAmounts: Record<string, number>;
    bundleStatuses: Map<string, BuildingStatus>;
    simulatedSeconds: number;
  } {
    const totalProduced: Record<string, number> = {};
    const totalConsumed: Record<string, number> = {};
    const walletConsumed: Record<string, number> = {};
    const stored = { ...storedAmounts };
    const wallet = { ...walletBalances };
    const bundleStatuses = new Map<string, BuildingStatus>();

    const activeSet = new Set<string>();
    for (const bundle of bundles) {
      if (bundle.status === 'paused') {
        bundleStatuses.set(bundle.buildingId, 'paused');
      } else {
        activeSet.add(bundle.buildingId);
        bundleStatuses.set(bundle.buildingId, 'operational');
      }
    }

    let remainingSeconds = totalSeconds;
    let iterations = 0;

    while (remainingSeconds > 0 && iterations < MAX_PHASE_ITERATIONS) {
      iterations++;

      if (activeSet.size === 0) {
        remainingSeconds = 0;
        break;
      }

      const netFlows = this.computeNetFlows(bundles, activeSet, productionMultBps, consumptionMultBps, threatMultBps, effectProductionBps);

      let earliestEventTime = remainingSeconds;
      let eventType: 'exhaustion' | 'restart' | 'none' = 'none';
      let eventResources: string[] = [];

      for (const [resId, flow] of Object.entries(netFlows)) {
        if (flow >= 0) continue;

        const combinedAvailable = (stored[resId] ?? 0) + (wallet[resId] ?? 0);
        if (combinedAvailable <= 0) {
          earliestEventTime = 0;
          eventType = 'exhaustion';
          eventResources.push(resId);
          continue;
        }

        const drainRatePerSecond = Math.abs(flow) / 3600;
        if (drainRatePerSecond <= 0) continue;

        const timeToExhaust = combinedAvailable / drainRatePerSecond;
        if (timeToExhaust < earliestEventTime) {
          earliestEventTime = timeToExhaust;
          eventType = 'exhaustion';
          eventResources = [resId];
        } else if (eventType === 'exhaustion' && Math.abs(timeToExhaust - earliestEventTime) < 0.001) {
          eventResources.push(resId);
        }
      }

      const restartTime = this.computeRestartTime(bundles, activeSet, bundleStatuses, stored, wallet, netFlows, remainingSeconds);
      if (restartTime !== null && restartTime < earliestEventTime) {
        earliestEventTime = restartTime;
        eventType = 'restart';
        eventResources = [];
      }

      if (earliestEventTime <= 0 && eventType === 'exhaustion' && eventResources.length > 0) {
        const starvedBuildings = this.findStarvedBuildings(bundles, activeSet, eventResources, stored, wallet);
        if (starvedBuildings.length === 0) break;
        this.applyStarvation(bundles, activeSet, bundleStatuses, starvedBuildings);
        continue;
      }

      const phaseSeconds = Math.min(earliestEventTime, remainingSeconds);

      this.applyPhaseDeltas(netFlows, phaseSeconds, stored, wallet, capacity, totalProduced, totalConsumed, walletConsumed);

      if (eventType === 'exhaustion' && eventResources.length > 0) {
        for (const resId of eventResources) {
          const localRemainder = stored[resId] ?? 0;
          if (localRemainder > 0) {
            totalConsumed[resId] = (totalConsumed[resId] || 0) + localRemainder;
            stored[resId] = 0;
          }
          const walletRemainder = wallet[resId] ?? 0;
          if (walletRemainder > 0) {
            totalConsumed[resId] = (totalConsumed[resId] || 0) + walletRemainder;
            walletConsumed[resId] = (walletConsumed[resId] || 0) + walletRemainder;
            wallet[resId] = 0;
          }
        }
      }

      remainingSeconds -= phaseSeconds;

      if (eventType === 'exhaustion' && eventResources.length > 0 && remainingSeconds > 0) {
        const starvedBuildings = this.findStarvedBuildings(bundles, activeSet, eventResources, stored, wallet);
        this.applyStarvation(bundles, activeSet, bundleStatuses, starvedBuildings);
      } else if (eventType === 'restart' && remainingSeconds > 0) {
        this.reactivateStarvedBuildings(bundles, activeSet, bundleStatuses, stored, wallet);
      }
    }

    if (iterations >= MAX_PHASE_ITERATIONS) {
      this.logger.warn(`Phase loop hit safety cap of ${MAX_PHASE_ITERATIONS} iterations`);
    }

    const simulatedSeconds = totalSeconds - remainingSeconds;
    return { totalProduced, totalConsumed, walletConsumed, storedAmounts: stored, bundleStatuses, simulatedSeconds };
  }

  private computeNetFlows(
    bundles: ProductionBundle[],
    activeSet: Set<string>,
    productionMultBps: bigint,
    consumptionMultBps: bigint,
    threatMultBps: bigint,
    effectProductionBps: bigint,
  ): Record<string, number> {
    const netFlows: Record<string, number> = {};
    for (const bundle of bundles) {
      if (!activeSet.has(bundle.buildingId)) continue;
      for (const [resId, rate] of Object.entries(bundle.produces)) {
        netFlows[resId] = (netFlows[resId] || 0) + this.applyProductionMultipliers(rate, productionMultBps, threatMultBps, effectProductionBps);
      }
      for (const [resId, rate] of Object.entries(bundle.consumes)) {
        netFlows[resId] = (netFlows[resId] || 0) - this.applyConsumptionMultipliers(rate, consumptionMultBps, threatMultBps);
      }
    }
    return netFlows;
  }

  private applyPhaseDeltas(
    netFlows: Record<string, number>,
    phaseSeconds: number,
    stored: Record<string, number>,
    wallet: Record<string, number>,
    capacity: Record<string, number>,
    totalProduced: Record<string, number>,
    totalConsumed: Record<string, number>,
    walletConsumed: Record<string, number>,
  ): void {
    for (const [resId, flowPerHour] of Object.entries(netFlows)) {
      const delta = Math.floor(Math.abs(flowPerHour) * phaseSeconds / 3600);
      if (delta <= 0) continue;

      if (flowPerHour > 0) {
        const cap = capacity[resId] ?? 0;
        const current = stored[resId] ?? 0;
        const available = Math.max(0, cap - current);
        const actualAdd = Math.min(delta, available);
        if (actualAdd > 0) {
          stored[resId] = current + actualAdd;
          totalProduced[resId] = (totalProduced[resId] || 0) + actualAdd;
        }
      } else {
        const localAvail = stored[resId] ?? 0;
        const fromLocal = Math.min(delta, localAvail);
        stored[resId] = localAvail - fromLocal;

        const remaining = delta - fromLocal;
        if (remaining > 0) {
          const walletAvail = wallet[resId] ?? 0;
          const fromWallet = Math.min(remaining, walletAvail);
          wallet[resId] = walletAvail - fromWallet;
          walletConsumed[resId] = (walletConsumed[resId] || 0) + fromWallet;
        }
        totalConsumed[resId] = (totalConsumed[resId] || 0) + delta;
      }
    }
  }

  private computeRestartTime(
    bundles: ProductionBundle[],
    activeSet: Set<string>,
    bundleStatuses: Map<string, BuildingStatus>,
    stored: Record<string, number>,
    wallet: Record<string, number>,
    currentNetFlows: Record<string, number>,
    remainingSeconds: number,
  ): number | null {
    const starvedBundles = bundles.filter(
      b => bundleStatuses.get(b.buildingId) === 'starved' && !activeSet.has(b.buildingId),
    );

    if (starvedBundles.length === 0) return null;

    let earliestRestart: number | null = null;

    for (const bundle of starvedBundles) {
      let maxTimeNeeded = 0;
      let canRestart = true;

      for (const resId of Object.keys(bundle.consumes)) {
        const combinedAvailable = (stored[resId] ?? 0) + (wallet[resId] ?? 0);
        const netFlow = currentNetFlows[resId] ?? 0;

        if (combinedAvailable > 0) {
          continue;
        }

        if (netFlow <= 0) {
          canRestart = false;
          break;
        }

        const accumulateRatePerSecond = netFlow / 3600;
        const timeToAccumulate = 1 / accumulateRatePerSecond;

        if (timeToAccumulate > remainingSeconds) {
          canRestart = false;
          break;
        }

        maxTimeNeeded = Math.max(maxTimeNeeded, timeToAccumulate);
      }

      if (canRestart && maxTimeNeeded >= 0) {
        const restartTime = Math.max(maxTimeNeeded, 0);
        if (earliestRestart === null || restartTime < earliestRestart) {
          earliestRestart = restartTime;
        }
      }
    }

    return earliestRestart;
  }

  private reactivateStarvedBuildings(
    bundles: ProductionBundle[],
    activeSet: Set<string>,
    bundleStatuses: Map<string, BuildingStatus>,
    stored: Record<string, number>,
    wallet: Record<string, number>,
  ): void {
    const starvedBundles = bundles.filter(
      b => bundleStatuses.get(b.buildingId) === 'starved' && !activeSet.has(b.buildingId),
    );

    for (const bundle of starvedBundles) {
      const hasResources = Object.keys(bundle.consumes).every(resId => {
        return (stored[resId] ?? 0) + (wallet[resId] ?? 0) > 0;
      });

      if (hasResources) {
        activeSet.add(bundle.buildingId);
        bundleStatuses.set(bundle.buildingId, 'operational');
      }
    }
  }

  private findStarvedBuildings(
    bundles: ProductionBundle[],
    activeSet: Set<string>,
    exhaustingResources: string[],
    stored: Record<string, number>,
    wallet: Record<string, number>,
  ): string[] {
    const starvedBuildings: string[] = [];
    for (const bundle of bundles) {
      if (!activeSet.has(bundle.buildingId)) continue;
      const consumesExhausted = Object.keys(bundle.consumes).some(
        resId => exhaustingResources.includes(resId) &&
          (stored[resId] ?? 0) <= 0 && (wallet[resId] ?? 0) <= 0,
      );
      if (consumesExhausted) {
        starvedBuildings.push(bundle.buildingId);
      }
    }
    return starvedBuildings;
  }

  private applyStarvation(
    bundles: ProductionBundle[],
    activeSet: Set<string>,
    bundleStatuses: Map<string, BuildingStatus>,
    starvedBuildings: string[],
  ): void {
    for (const bId of starvedBuildings) {
      const bundle = bundles.find(b => b.buildingId === bId)!;
      activeSet.delete(bId);
      if (bundle.onStarve === 'paused') {
        bundleStatuses.set(bId, 'paused');
      } else {
        bundleStatuses.set(bId, 'starved');
      }
    }
  }

  private applyProductionMultipliers(
    ratePerHour: number,
    productionMultBps: bigint,
    threatMultBps: bigint,
    effectProductionBps: bigint,
  ): number {
    let val = BigInt(Math.floor(ratePerHour));
    val = val * productionMultBps / BPS_BASE;
    val = val * threatMultBps / BPS_BASE;
    val = val * effectProductionBps / BPS_BASE;
    return Number(val);
  }

  private applyConsumptionMultipliers(
    ratePerHour: number,
    consumptionMultBps: bigint,
    threatMultBps: bigint,
  ): number {
    let val = BigInt(Math.floor(ratePerHour));
    val = val * consumptionMultBps / BPS_BASE;
    val = val * threatMultBps / BPS_BASE;
    return Number(val);
  }

  computeLocationMeta(
    location: any,
    buildingIdsUnderConstruction: Set<string> = new Set(),
  ): LocationMetaResult {
    const locRules = (location.definition?.rules as LevelRules) || {};
    const locConfig = resolveLevelConfig(locRules, location.level);
    const capacity = resolveStorageCapacity(locConfig.storage, location.level);
    const productionRates = resolveProductionRates(locConfig.production, location.level);
    const consumptionRates: Record<string, number> = {};
    const productionBundles: ProductionBundle[] = [];

    const existingBundles: ProductionBundle[] = ((location.storage as any) || {}).productionBundles || [];
    const existingStatusMap = new Map<string, { status: BuildingStatus; onStarve: OnStarveBehavior }>();
    for (const eb of existingBundles) {
      existingStatusMap.set(eb.buildingId, { status: eb.status, onStarve: eb.onStarve });
    }

    const locConsumption = resolveConsumptionRates(locConfig.consumption, location.level);
    for (const [resId, rate] of Object.entries(locConsumption)) {
      consumptionRates[resId] = (consumptionRates[resId] || 0) + rate;
    }

    const locOnStarve = resolveOnStarve(location.state, locConfig);
    const locBundleId = `location:${location.id}`;
    const locProdEntries = locConfig.production as ResourceEntry[] | undefined;
    const locConsEntries = locConfig.consumption as ResourceEntry[] | undefined;
    const locResourceTypes = {
      ...extractResourceTypes(locProdEntries),
      ...extractResourceTypes(locConsEntries),
    };

    if (Object.keys(resolveProductionRates(locConfig.production, location.level)).length > 0 ||
        Object.keys(locConsumption).length > 0) {
      productionBundles.push({
        buildingId: locBundleId,
        buildingDefId: location.definitionId,
        produces: resolveProductionRates(locConfig.production, location.level),
        consumes: locConsumption,
        resourceTypes: locResourceTypes,
        onStarve: locOnStarve,
        status: resolveBundleStatus(locBundleId, locOnStarve, existingStatusMap),
      });
    }

    for (const building of (location.buildings ?? [])) {
      if (building.enabled === false) continue;
      if (buildingIdsUnderConstruction.has(building.id)) continue;
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

      const bConsumption = resolveConsumptionRates(bConfig.consumption, building.level);
      for (const [resId, rate] of Object.entries(bConsumption)) {
        consumptionRates[resId] = (consumptionRates[resId] || 0) + rate;
      }

      const bOnStarve = resolveOnStarve(building.state, bConfig);
      const bProdEntries = bConfig.production as ResourceEntry[] | undefined;
      const bConsEntries = bConfig.consumption as ResourceEntry[] | undefined;

      productionBundles.push({
        buildingId: building.id,
        buildingDefId: building.buildingDefId,
        produces: bProduction,
        consumes: bConsumption,
        resourceTypes: {
          ...extractResourceTypes(bProdEntries),
          ...extractResourceTypes(bConsEntries),
        },
        onStarve: bOnStarve,
        status: resolveBundleStatus(building.id, bOnStarve, existingStatusMap),
      });
    }

    for (const building of (location.buildings ?? [])) {
      if (building.enabled === false) continue;
      if (buildingIdsUnderConstruction.has(building.id)) continue;
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

        const rConsumption = resolveConsumptionRates(rConfig.consumption, room.level);
        for (const [resId, rate] of Object.entries(rConsumption)) {
          consumptionRates[resId] = (consumptionRates[resId] || 0) + rate;
        }

        if (Object.keys(rProduction).length > 0 || Object.keys(rConsumption).length > 0) {
          const rOnStarve = resolveOnStarve(room.state, rConfig);
          const roomBundleId = `room:${room.id}`;
          const rProdEntries = rConfig.production as ResourceEntry[] | undefined;
          const rConsEntries = rConfig.consumption as ResourceEntry[] | undefined;
          productionBundles.push({
            buildingId: roomBundleId,
            buildingDefId: room.roomDefId,
            produces: rProduction,
            consumes: rConsumption,
            resourceTypes: {
              ...extractResourceTypes(rProdEntries),
              ...extractResourceTypes(rConsEntries),
            },
            onStarve: rOnStarve,
            status: resolveBundleStatus(roomBundleId, rOnStarve, existingStatusMap),
          });
        }

        if (rConfig.effects?.productionMultBps) {
          const mult = Number(rConfig.effects.productionMultBps);
          for (const resId of Object.keys(productionRates)) {
            productionRates[resId] = Math.floor(productionRates[resId] * mult / 10000);
          }
          for (const bundle of productionBundles) {
            for (const resId of Object.keys(bundle.produces)) {
              bundle.produces[resId] = Math.floor(bundle.produces[resId] * mult / 10000);
            }
          }
        }
      }
    }

    const netFlows: Record<string, number> = {};
    const allResourceIds = new Set([...Object.keys(productionRates), ...Object.keys(consumptionRates)]);
    for (const resId of allResourceIds) {
      netFlows[resId] = (productionRates[resId] || 0) - (consumptionRates[resId] || 0);
    }

    return { capacity, productionRates, consumptionRates, productionBundles, netFlows };
  }

  async getStorageInfo(locationId: string, userId: string): Promise<StorageInfo & { productionRates?: Record<string, number>; consumptionRates?: Record<string, number>; netFlows?: Record<string, number>; productionBundles?: ProductionBundle[] }> {
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
      consumptionRates: storage.consumptionRates || {},
      netFlows: storage.netFlows || {},
      productionBundles: storage.productionBundles || [],
    };
  }

  async recalculateLocationMeta(locationId: string, client?: any): Promise<{ capacity: Record<string, number>; productionRates: Record<string, number>; consumptionRates: Record<string, number>; effectiveProductionRates: Record<string, number>; effectiveConsumptionRates: Record<string, number>; productionBundles: ProductionBundle[]; netFlows: Record<string, number>; workerProductionMultBps: number; workerConsumptionMultBps: number }> {
    const db = client || this.prisma;
    const location = await (db as any).locationInstance.findFirst({
      where: { id: locationId },
      include: {
        definition: true,
        buildings: { include: { buildingDef: { include: { displayDef: true } }, rooms: { include: { roomDef: true } } } },
        workerAssignments: true,
      },
    });
    if (!location) return { capacity: {}, productionRates: {}, consumptionRates: {}, effectiveProductionRates: {}, effectiveConsumptionRates: {}, productionBundles: [], netFlows: {}, workerProductionMultBps: 10000, workerConsumptionMultBps: 10000 };

    const activeJobs = await (db as any).job.findMany({
      where: { userId: location.ownerUserId, type: 'BuildingJob', status: 'active' },
      select: { data: true },
    });
    const buildingIdsUnderConstruction = new Set<string>(
      activeJobs.map((j: any) => (j.data as any)?.buildingId).filter(Boolean),
    );

    const { capacity, productionRates, consumptionRates, productionBundles, netFlows } = this.computeLocationMeta(location, buildingIdsUnderConstruction);

    const workerEntityIds: string[] = (location.workerAssignments || [])
      .map((w: any) => w.entityId)
      .filter(Boolean);
    const workerStatsTotal = await sumEquippedStatsForEntities(db, workerEntityIds);
    const { productionMultBps, consumptionMultBps } = getWorkerMultsBps(workerStatsTotal);
    const threatMultBps = getThreatMultBps(location.threatLevel || 0);

    const effectiveProductionRates: Record<string, number> = {};
    for (const [resId, rate] of Object.entries(productionRates)) {
      let effective = rate;
      effective = Math.floor(effective * Number(productionMultBps) / 10000);
      effective = Math.floor(effective * Number(threatMultBps) / 10000);
      effectiveProductionRates[resId] = effective;
    }

    const effectiveConsumptionRates: Record<string, number> = {};
    for (const [resId, rate] of Object.entries(consumptionRates)) {
      let effective = rate;
      effective = Math.floor(effective * Number(consumptionMultBps) / 10000);
      effective = Math.floor(effective * Number(threatMultBps) / 10000);
      effectiveConsumptionRates[resId] = effective;
    }

    const workerProductionMultBps = Number(productionMultBps);
    const workerConsumptionMultBps = Number(consumptionMultBps);

    const storage = (location.storage as any) || {};
    await (db as any).locationInstance.update({
      where: { id: locationId },
      data: {
        storage: {
          ...storage,
          capacity,
          productionRates,
          consumptionRates,
          effectiveProductionRates,
          effectiveConsumptionRates,
          productionBundles,
          netFlows,
          workerProductionMultBps,
          workerConsumptionMultBps,
        },
      },
    });
    return { capacity, productionRates, consumptionRates, effectiveProductionRates, effectiveConsumptionRates, productionBundles, netFlows, workerProductionMultBps, workerConsumptionMultBps };
  }

  /**
   * Re-derives location meta for every outpost the given entity is currently
   * assigned to as a worker. Called after equip/unequip and on level-up so
   * the outpost's effective rates (which sum each worker's *equipped* stats)
   * stay accurate without waiting for the next assign/unassign.
   */
  async recalcLocationsForWorkerEntity(entityId: string, client?: any): Promise<void> {
    const db = client || this.prisma;
    const assignments = await (db as any).locationWorkerAssignment.findMany({
      where: { entityId },
      select: { locationId: true },
    });
    for (const a of assignments) {
      try {
        await this.recalculateLocationMeta(a.locationId, db);
      } catch (err) {
        this.logger.warn(
          `Failed to recalc location ${a.locationId} after worker ${entityId} stat change: ${err}`,
        );
      }
    }
  }
}
