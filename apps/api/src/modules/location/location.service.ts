import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LocationSettlementService } from "./location-settlement.service";
import { TickService } from "../tick/tick.service";
import { CurrencyService } from "../currency/currency.service";
import { InventoryService } from "../inventory/inventory.service";
import { GameRulesService } from "../game-rules/game-rules.service";
import { NotificationService } from "../notification/notification.service";
import { EffectService } from "../effect/effect.service";
import { TelemetryService } from "../telemetry/telemetry.service";
import { ANTI_WHALE_CAPS, EffectCategory, EffectTargetType, applyModifier } from "@derp/shared";
import { serializeLocation } from "../commands/location-serializer.util";
import {
  resolveLevelConfig,
  resolveConstructionCosts,
  resolveAllowedBuildings,
  calcGrowth,
  calcXpForLevel,
  diffLocationLevelUnlocks,
  LevelRules,
  LocationLevelUnlocks as LevelConfigLocationLevelUnlocks,
} from "../game-rules/level-config.util";

import { DEFAULT_XP_DEPOSIT_COST, LocationXpCostOption } from './location-xp.constants';
export { LocationXpCostOption };

export type LocationLevelUnlocks = LevelConfigLocationLevelUnlocks;

export interface AddLocationXpResult {
  location: any;
  oldLevel: number;
  newLevel: number;
  xpGained: number;
  leveledUp: boolean;
  unlocks: LocationLevelUnlocks;
  /**
   * Notification record (created or updated) when a level-up occurred.
   * Returned so command handlers can include it in their patch stream so the
   * client gets the notification immediately via sync, rather than waiting
   * for the next bootstrap/poll.
   */
  notification?: any;
  /**
   * If the requested charges exceeded the remaining XP capacity to reach
   * maxLevel, the deposit was clamped down to this many charges. The full
   * cost for this clamped count is what was actually spent.
   */
  chargesApplied: number;
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private prisma: PrismaService,
    private settlementService: LocationSettlementService,
    private tickService: TickService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
    private gameRules: GameRulesService,
    private notificationService: NotificationService,
    private effectService: EffectService,
    private telemetryService: TelemetryService,
  ) {}

  resolveXpDepositCosts(rules: LevelRules | null | undefined): LocationXpCostOption[] {
    const raw = (rules as any)?.xpDepositCosts;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .filter((c: any) =>
          c && (c.type === 'currency' || c.type === 'item') && typeof c.id === 'string' &&
          typeof c.amount === 'number' && c.amount > 0,
        )
        .map((c: any) => ({
          type: c.type,
          id: c.id,
          amount: c.amount,
          xpPerCharge: typeof c.xpPerCharge === 'number' && c.xpPerCharge > 0 ? c.xpPerCharge : 1,
        }));
    }
    return [{ ...DEFAULT_XP_DEPOSIT_COST }];
  }

  /**
   * Spends the chosen cost option `charges` times to deposit XP into a
   * LocationInstance. Walks the location's per-level XP curve, recalculating
   * meta and emitting one collapsed level-up notification (+ telemetry) per
   * call when one or more levels were gained.
   *
   * Mirrors the entity XP authority pattern: callers must always go through
   * this method — never mutate `location.xp` / `location.level` directly.
   */
  async depositLocationXp(
    userId: string,
    locationId: string,
    chosen: { type: 'currency' | 'item'; id: string; amount: number },
    charges: number,
    externalTx?: any,
  ): Promise<AddLocationXpResult> {
    if (!Number.isFinite(charges) || charges <= 0) {
      throw new BadRequestException('charges must be a positive integer');
    }
    const chargesInt = Math.floor(charges);

    const doWork = async (tx: any): Promise<AddLocationXpResult> => {
      const loc = await (tx as any).locationInstance.findFirst({
        where: { id: locationId, ownerUserId: userId },
        include: { definition: true },
      });
      if (!loc) throw new NotFoundException('Location not found');

      const rules = (loc.definition?.rules as LevelRules) || {};
      const maxLevel = rules.maxLevel ?? 50;

      if (loc.level >= maxLevel) {
        // Cap-safe: reject at max so we never spend resources for XP that would
        // be discarded. Frontend mirrors this with a disabled state, but a
        // direct API caller still needs the explicit error.
        throw new BadRequestException('Outpost is already at maximum level');
      }

      const options = this.resolveXpDepositCosts(rules);
      const match = options.find(
        (o) => o.type === chosen.type && o.id === chosen.id && o.amount === chosen.amount,
      );
      if (!match) {
        throw new BadRequestException('Selected cost option is not available for this location');
      }

      const xpPerCharge = match.xpPerCharge ?? 1;

      // Cap-safe spending: compute remaining XP capacity to reach maxLevel
      // from the current (level, xp), then clamp the requested charge count
      // so we never spend resources for XP that would be discarded at cap.
      let remainingXpCapacity = 0;
      {
        let lvl = loc.level;
        let xpInLvl = Number(loc.xp ?? 0);
        while (lvl < maxLevel) {
          const need = calcXpForLevel(rules, lvl + 1);
          remainingXpCapacity += Math.max(0, need - xpInLvl);
          xpInLvl = 0;
          lvl++;
        }
      }
      const maxUsefulCharges = Math.max(
        1,
        Math.ceil(remainingXpCapacity / Math.max(1, xpPerCharge)),
      );
      const chargesApplied = Math.min(chargesInt, maxUsefulCharges);

      const totalCost = match.amount * chargesApplied;
      const xpDelta = xpPerCharge * chargesApplied;

      if (match.type === 'currency') {
        await this.currencyService.spendTx(tx, {
          userId,
          currencyId: match.id,
          amount: totalCost,
          reason: 'location_xp_deposit',
          sourceType: 'location',
          sourceId: locationId,
        });
      } else {
        await this.inventoryService.removeItemTx(tx, {
          userId,
          itemId: match.id,
          quantity: totalCost,
          reason: 'location_xp_deposit',
          sourceType: 'location',
          sourceId: locationId,
        });
      }

      const oldLevel = loc.level;

      let newLevel = oldLevel;
      let newXp = Number(loc.xp ?? 0) + xpDelta;

      while (newLevel < maxLevel) {
        const need = calcXpForLevel(rules, newLevel + 1);
        if (newXp < need) break;
        newXp -= need;
        newLevel++;
      }
      if (newLevel >= maxLevel) {
        // At cap: residual XP is preserved as 0 since no further threshold exists.
        newXp = 0;
      }

      const updated = await (tx as any).locationInstance.update({
        where: { id: locationId },
        data: { level: newLevel, xp: BigInt(newXp) },
      });

      const leveledUp = newLevel > oldLevel;
      const unlocks: LocationLevelUnlocks = leveledUp
        ? diffLocationLevelUnlocks(rules, oldLevel, newLevel)
        : {
            workerSlotsAdded: 0,
            buildingSlotsAdded: 0,
            newAllowedBuildings: [],
            newAllowedRooms: [],
            storageAdded: [],
            productionAdded: [],
          };

      // Always record the deposit itself for analytics (level-ups get a
      // separate, more detailed event below).
      try {
        await this.telemetryService.record(
          userId,
          'location_xp_deposited',
          locationId,
          xpDelta,
          {
            locationId,
            definitionId: loc.definitionId,
            costType: match.type,
            costId: match.id,
            costAmount: totalCost,
            chargesRequested: chargesInt,
            chargesApplied,
            xpGained: xpDelta,
            leveledUp,
          },
          tx,
        );
      } catch (err) {
        this.logger.warn(`Failed to record location_xp_deposited telemetry: ${err}`);
      }

      let levelUpNotification: any = null;
      if (leveledUp) {
        try {
          await this.settlementService.recalculateLocationMeta(locationId, tx);
        } catch (err) {
          this.logger.warn(
            `Failed to recalculate location meta for ${locationId} after level-up: ${err}`,
          );
        }
        try {
          await this.telemetryService.record(
            userId,
            'location_level_up',
            locationId,
            newLevel - oldLevel,
            {
              locationId,
              definitionId: loc.definitionId,
              fromLevel: oldLevel,
              toLevel: newLevel,
              unlocks,
            },
            tx,
          );
        } catch (err) {
          this.logger.warn(`Failed to record location_level_up telemetry: ${err}`);
        }
        try {
          levelUpNotification = await this.notificationService.recordLocationLevelUp(
            {
              userId,
              locationId,
              locationName: loc.definitionId || 'Outpost',
              fromLevel: oldLevel,
              toLevel: newLevel,
              unlocks,
            },
            tx,
          );
        } catch (err) {
          this.logger.warn(`Failed to record location_level_up notification: ${err}`);
        }
      }

      return {
        location: { ...loc, ...updated, definition: loc.definition },
        oldLevel,
        newLevel,
        xpGained: xpDelta,
        leveledUp,
        unlocks,
        notification: levelUpNotification,
        chargesApplied,
      };
    };

    return externalTx ? doWork(externalTx) : this.prisma.$transaction((tx) => doWork(tx));
  }

  /**
   * Enforces the maxActiveOutposts anti-whale cap.
   * Call this before creating any new LocationInstance for a player.
   */
  async assertOutpostCap(userId: string, externalTx?: any): Promise<void> {
    const client = externalTx || this.prisma;
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { keeperLevel: true, bonusOutpostSlots: true },
    });
    if (!user) throw new NotFoundException("User not found");
    const activeCount = await (client as any).locationInstance.count({
      where: { ownerUserId: userId, enabled: true },
    });
    const maxOutposts = ANTI_WHALE_CAPS.maxActiveOutposts(user.keeperLevel, user.bonusOutpostSlots ?? 0);
    if (activeCount >= maxOutposts) {
      throw new BadRequestException(
        `Maximum ${maxOutposts} active outpost(s) allowed at Keeper Level ${user.keeperLevel}`,
      );
    }
  }

  private async getCurrencyIds(externalTx?: any): Promise<Set<string>> {
    const client = externalTx || this.prisma;
    const currencies = await client.currency.findMany({
      select: { id: true },
    });
    return new Set(currencies.map((c: any) => c.id));
  }

  async getLocations(userId: string) {
    const [locations, buildingJobs, currencyIds] = await Promise.all([
      (this.prisma as any).locationInstance.findMany({
        where: { ownerUserId: userId },
        include: {
          definition: true,
          buildings: {
            include: {
              buildingDef: { include: { displayDef: true } },
              rooms: { include: { roomDef: true } },
            },
          },
          workerAssignments: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      (this.prisma as any).job.findMany({
        where: {
          userId,
          type: "BuildingJob",
          status: { in: ["active", "ready_notified"] },
        },
      }),
      this.getCurrencyIds(),
    ]);

    return locations.map((loc: any) =>
      serializeLocation(loc, buildingJobs, currencyIds),
    );
  }

  async getLocation(userId: string, locationId: string) {
    const currentTick = BigInt(
      Math.floor(await this.tickService.getCurrentTick()),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await this.settlementService.settleLocationTx(
        tx,
        locationId,
        userId,
        currentTick,
      );

      const location = await (tx as any).locationInstance.findFirst({
        where: { id: locationId, ownerUserId: userId },
        include: {
          definition: true,
          buildings: {
            include: {
              buildingDef: { include: { displayDef: true } },
              rooms: { include: { roomDef: true } },
            },
          },
          workerAssignments: true,
        },
      });

      if (!location) throw new NotFoundException("Location not found");
      return location;
    });

    const [buildingJobs, storageInfo, currencyIds] = await Promise.all([
      (this.prisma as any).job.findMany({
        where: {
          userId,
          type: "BuildingJob",
          status: { in: ["active", "ready_notified"] },
          data: { path: ["locationId"], equals: locationId },
        },
      }),
      this.settlementService.getStorageInfo(locationId, userId),
      this.getCurrencyIds(),
    ]);

    return {
      ...serializeLocation(result, buildingJobs, currencyIds),
      storage: storageInfo,
    };
  }

  private async buildLocationRequirementContext(
    userId: string,
    currentLocation?: any,
    parentBuilding?: any,
  ) {
    const [user, allLocations] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      (this.prisma as any).locationInstance.findMany({
        where: { ownerUserId: userId },
        include: {
          definition: true,
          buildings: {
            include: {
              buildingDef: { include: { displayDef: true } },
              rooms: { include: { roomDef: true } },
            },
          },
        },
      }),
    ]);
    if (!user) throw new NotFoundException("User not found");

    const allPlayerLocations = allLocations.map((loc: any) => ({
      buildings: loc.buildings.map((b: any) => ({
        buildingDefId: b.buildingDefId,
        rooms: b.rooms?.map((r: any) => ({ roomDefId: r.roomDefId })) ?? [],
      })),
      regionId: loc.definition?.regionId ?? null,
    }));

    const currentLocationCtx = currentLocation
      ? {
          buildings: (currentLocation.buildings ?? []).map((b: any) => ({
            buildingDefId: b.buildingDefId,
            rooms: b.rooms?.map((r: any) => ({ roomDefId: r.roomDefId })) ?? [],
          })),
          regionId: currentLocation.definition?.regionId ?? null,
        }
      : undefined;

    const parentBuildingCtx = parentBuilding
      ? {
          buildingDefId: parentBuilding.buildingDefId,
          rooms: (parentBuilding.rooms ?? []).map((r: any) => ({
            roomDefId: r.roomDefId,
          })),
        }
      : undefined;

    return this.gameRules.buildRequirementContext(user as any, {
      allPlayerLocations,
      currentLocation: currentLocationCtx,
      parentBuilding: parentBuildingCtx,
    });
  }

  async getAvailableBuildings(userId: string, locationId: string) {
    const location = await (this.prisma as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: userId },
      include: {
        definition: true,
        buildings: {
          include: { buildingDef: { include: { displayDef: true } }, rooms: { include: { roomDef: true } } },
        },
      },
    });
    if (!location) throw new NotFoundException("Location not found");

    const locRules = (location.definition?.rules as LevelRules) || {};
    const allowedBuildings = resolveAllowedBuildings(locRules, location.level);

    if (allowedBuildings.length === 0) {
      return { available: [], currentCount: location.buildings.length };
    }

    const allowedIds = allowedBuildings.map((a) => a.buildingDefId);
    const buildingDefs = await (this.prisma as any).buildingDef.findMany({
      where: { id: { in: allowedIds } },
    });
    const defMap = new Map(buildingDefs.map((d: any) => [d.id, d]));

    const reqContext = await this.buildLocationRequirementContext(
      userId,
      location,
    );

    const existingCounts = new Map<string, number>();
    for (const b of location.buildings) {
      const count = existingCounts.get(b.buildingDefId) || 0;
      existingCounts.set(b.buildingDefId, count + 1);
    }

    const available = allowedBuildings
      .filter((entry) => {
        const maxCount = entry.maxCount ?? 1;
        const currentCount = existingCounts.get(entry.buildingDefId) || 0;
        if (currentCount >= maxCount) return false;

        const def = defMap.get(entry.buildingDefId) as any;
        if (!def) return false;
        if (
          !this.gameRules.checkRequirements(
            def.visibilityRequirements,
            reqContext,
          )
        )
          return false;

        return true;
      })
      .map((entry) => {
        const def = defMap.get(entry.buildingDefId) as any;
        const meetsReqs = this.gameRules.checkRequirements(
          def.requirements,
          reqContext,
        );
        return {
          id: def.id,
          name: def.name,
          description: def.description,
          tags: def.tags,
          category: def.category ?? null,
          rules: def.rules,
          requirements: def.requirements,
          meetsRequirements: meetsReqs,
          data: def.data,
          allowedRules: {
            maxCount: entry.maxCount ?? 1,
            minCount: entry.minCount ?? 0,
          },
        };
      });

    return {
      available,
      currentCount: location.buildings.length,
    };
  }

  async buildBuilding(
    userId: string,
    locationId: string,
    buildingDefId: string,
    externalTx?: any,
  ) {
    const location = await (this.prisma as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: userId },
      include: {
        definition: true,
        buildings: {
          include: { buildingDef: { include: { displayDef: true } }, rooms: { include: { roomDef: true } } },
        },
      },
    });
    if (!location) throw new NotFoundException("Location not found");

    const locRules = (location.definition?.rules as LevelRules) || {};
    const allowedBuildings = resolveAllowedBuildings(locRules, location.level);
    const allowedEntry = allowedBuildings.find(
      (a) => a.buildingDefId === buildingDefId,
    );
    if (!allowedEntry)
      throw new BadRequestException(
        "Building not available for this location at current level",
      );

    const maxCount = allowedEntry.maxCount ?? 1;
    const existingCount = location.buildings.filter(
      (b: any) => b.buildingDefId === buildingDefId,
    ).length;
    if (existingCount >= maxCount) {
      throw new BadRequestException(
        `Maximum ${maxCount} of this building already built`,
      );
    }

    const def = await (this.prisma as any).buildingDef.findUnique({
      where: { id: buildingDefId },
    });
    if (!def) throw new BadRequestException("Building definition not found");
    const reqContext = await this.buildLocationRequirementContext(
      userId,
      location,
    );
    if (!this.gameRules.checkRequirements(def.requirements, reqContext)) {
      throw new BadRequestException("Requirements not met to build this");
    }
    const defRules = (def.rules as LevelRules) || {};
    const buildLevel = 1;
    const buildConfig = resolveLevelConfig(defRules, buildLevel);
    const costs = resolveConstructionCosts(
      buildConfig.constructionCost,
      buildLevel,
    );

    const currentTick = await this.tickService.getCurrentTick();
    const currentTickBig = BigInt(Math.floor(currentTick));

    const timer = (buildConfig.timer as any) || {};
    const baseDuration = timer.duration ?? 0;
    const durationSeconds = calcGrowth(
      baseDuration,
      timer.growthRate,
      timer.growthScalar,
      buildLevel,
    );
    let durationTicks = durationSeconds;
    const buildTimerMod = await this.effectService.resolveForTarget(
      userId, EffectTargetType.PLAYER, userId, EffectCategory.TIMER_SPEED,
    );
    if (buildTimerMod.flatAdd !== 0 || buildTimerMod.percentAdd !== 0 || buildTimerMod.multiplier !== 1) {
      durationTicks = Math.max(0, Math.floor(applyModifier(durationTicks, buildTimerMod)));
    }
    const isInstant = durationTicks <= 0;

    const doWork = async (tx: any) => {
      await this.settlementService.settleLocationTx(
        tx,
        locationId,
        userId,
        currentTickBig,
      );

      for (const cost of costs) {
        if (cost.amount <= 0) continue;

        if (cost.type === "currency") {
          await this.currencyService.spendTx(tx as any, {
            userId,
            currencyId: cost.id,
            amount: cost.amount,
            reason: "building_construction",
            sourceType: "location_building",
            sourceId: buildingDefId,
          });
        } else {
          await this.inventoryService.removeItemTx(tx as any, {
            userId,
            itemId: cost.id,
            quantity: cost.amount,
            reason: "building_construction",
            sourceType: "location_building",
            sourceId: buildingDefId,
          });
        }
      }

      const buildingState: any = { status: isInstant ? "active" : "building" };

      const building = await (tx as any).locationBuildingInstance.create({
        data: {
          locationId,
          buildingDefId,
          level: 1,
          state: buildingState,
        },
        include: { buildingDef: true },
      });

      if (!isInstant) {
        await (tx as any).job.create({
          data: {
            userId,
            type: "BuildingJob",
            defId: buildingDefId,
            status: "active",
            timer: { startTick: Math.floor(currentTick), durationTicks },
            team: [],
            data: { locationId, buildingId: building.id },
            readyAtTick: Math.floor(currentTick) + durationTicks,
          },
        });
      }

      return building;
    };

    const result = externalTx
      ? await doWork(externalTx)
      : await this.prisma.$transaction(async (tx) => doWork(tx));

    if (externalTx) {
      await this.settlementService.recalculateLocationMeta(locationId, externalTx);
    } else {
      try {
        await this.settlementService.recalculateLocationMeta(locationId);
      } catch (err) {
        this.logger.warn(
          `Failed to recalculate storage for location ${locationId}: ${err}`,
        );
      }
    }

    return {
      id: result.id,
      buildingDefId: result.buildingDefId,
      name: result.buildingDef.name,
      level: result.level,
      state: result.state,
      startTick: isInstant ? 0 : Math.floor(currentTick),
      durationTicks: isInstant ? 0 : durationTicks,
    };
  }

  async completeBuilding(
    userId: string,
    locationId: string,
    buildingId: string,
    externalTx?: any,
  ) {
    const building: any = await (
      this.prisma as any
    ).locationBuildingInstance.findFirst({
      where: { id: buildingId, locationId, location: { ownerUserId: userId } },
      include: { buildingDef: true },
    });

    if (!building) throw new NotFoundException("Building not found");

    if (!building.buildingDef) {
      this.logger.warn(
        `completeBuilding: definition not found for buildingDefId=${building.buildingDefId}, failing job gracefully`,
      );
      const buildingJob = await (this.prisma as any).job.findFirst({
        where: {
          userId,
          type: "BuildingJob",
          status: { in: ["active", "ready_notified"] },
          data: { path: ["buildingId"], equals: buildingId },
        },
      });
      const errorMsg = `ERROR: Job with id BuildingJob - ${buildingJob?.id || buildingId} could not be found.`;
      if (buildingJob) {
        await (this.prisma as any).job.update({
          where: { id: buildingJob.id },
          data: {
            status: "failed",
            results: { success: false, error: errorMsg, rewards: [] },
          },
        });
        try {
          await this.notificationService.updateBySource({
            userId,
            sourceType: "job_ready",
            sourceId: buildingJob.id,
            type: "building_complete",
            category: "buildings",
            priority: "normal",
            title: "Construction Failed",
            body: errorMsg,
            markRead: true,
          });
        } catch (err) {
          // notification update is non-critical
        }
      }
      await (this.prisma as any).locationBuildingInstance.update({
        where: { id: buildingId },
        data: { state: { status: "active" } },
      });
      return {
        id: buildingId,
        buildingDefId: building.buildingDefId,
        name: building.buildingDefId,
        level: building.level,
        state: { status: "active" },
        error: errorMsg,
      };
    }

    const buildingState = (building.state as any) || {};
    if (buildingState.status !== "building") {
      throw new BadRequestException("Building is not under construction");
    }

    const buildingJob = await (this.prisma as any).job.findFirst({
      where: {
        userId,
        type: "BuildingJob",
        status: { in: ["active", "ready_notified"] },
        data: { path: ["buildingId"], equals: buildingId },
      },
    });

    if (!buildingJob) {
      throw new NotFoundException("Building job not found");
    }

    const jobData = buildingJob.data as any;
    if (jobData?.locationId !== locationId) {
      throw new BadRequestException(
        "Building job does not belong to this location",
      );
    }

    const currentTick = await this.tickService.getCurrentTick();
    const jobTimer = buildingJob.timer as any;
    const targetTick = jobTimer.startTick + jobTimer.durationTicks;

    if (currentTick < targetTick) {
      throw new BadRequestException("Construction is not yet complete");
    }

    const currentTickBig = BigInt(Math.floor(currentTick));
    const upgradeToLevel = jobData?.upgradeToLevel;

    const doWork = async (tx: any) => {
      await this.settlementService.settleLocationTx(
        tx,
        locationId,
        userId,
        currentTickBig,
      );

      await (tx as any).job.update({
        where: { id: buildingJob.id },
        data: { status: "completed" },
      });

      const newState: any = { status: "active" };
      const updateData: any = { state: newState };
      if (upgradeToLevel) {
        updateData.level = upgradeToLevel;
      }

      const building = await (tx as any).locationBuildingInstance.update({
        where: { id: buildingId },
        data: updateData,
        include: { buildingDef: true },
      });

      const isUpgrade = !!upgradeToLevel;
      const existingNotif = await (tx as any).notification.findFirst({
        where: { userId, sourceType: "job_ready", sourceId: buildingJob.id, archivedAt: null },
      });
      let updatedNotification: any = null;
      if (existingNotif) {
        updatedNotification = await (tx as any).notification.update({
          where: { id: existingNotif.id },
          data: {
            type: "building_complete",
            title: isUpgrade ? "Upgrade Complete!" : "Construction Complete!",
            body: `${building.buildingDef.name}${isUpgrade ? ` upgraded to level ${building.level}` : " has been built"}`,
            readAt: new Date(),
            dismissedAt: null,
            deepLink: { screen: "/locations", locationId, buildingId },
          },
        });
      }

      return { building, updatedNotification };
    };

    const { building: updated, updatedNotification } = externalTx
      ? await doWork(externalTx)
      : await this.prisma.$transaction(doWork);

    if (externalTx) {
      await this.settlementService.recalculateLocationMeta(locationId, externalTx);
    } else {
      try {
        await this.settlementService.recalculateLocationMeta(locationId);
      } catch (err) {
        this.logger.warn(
          `Failed to recalculate location meta for ${locationId}: ${err}`,
        );
      }
    }

    return {
      id: updated.id,
      buildingDefId: updated.buildingDefId,
      name: updated.buildingDef.name,
      level: updated.level,
      state: updated.state,
      updatedNotification,
    };
  }

  async upgradeBuilding(
    userId: string,
    locationId: string,
    buildingId: string,
    externalTx?: any,
  ) {
    const building: any = await (
      this.prisma as any
    ).locationBuildingInstance.findFirst({
      where: { id: buildingId, locationId, location: { ownerUserId: userId } },
      include: { buildingDef: true },
    });

    if (!building) throw new NotFoundException("Building not found");
    const buildingState = (building.state as any) || {};
    if (buildingState.status !== "active") {
      throw new BadRequestException("Building must be active to upgrade");
    }

    const def = building.buildingDef;
    const defRules = (def.rules as LevelRules) || {};
    const maxLevel = defRules.maxLevel ?? 10;
    if (building.level >= maxLevel) {
      throw new BadRequestException(
        `Building is already at max level (${maxLevel})`,
      );
    }

    const currentLevel = building.level;
    const nextLevel = currentLevel + 1;
    const nextConfig = resolveLevelConfig(defRules, nextLevel);
    const costs = resolveConstructionCosts(
      nextConfig.constructionCost,
      nextLevel,
    );

    const currentTick = await this.tickService.getCurrentTick();
    const currentTickBig = BigInt(Math.floor(currentTick));

    const timer = (nextConfig.timer as any) || {};
    const baseDuration = timer.duration ?? 0;
    const durationSeconds = calcGrowth(
      baseDuration,
      timer.growthRate,
      timer.growthScalar,
      nextLevel,
    );
    let durationTicks = durationSeconds;
    const upgradeTimerMod = await this.effectService.resolveForTarget(
      userId, EffectTargetType.PLAYER, userId, EffectCategory.TIMER_SPEED,
    );
    if (upgradeTimerMod.flatAdd !== 0 || upgradeTimerMod.percentAdd !== 0 || upgradeTimerMod.multiplier !== 1) {
      durationTicks = Math.max(0, Math.floor(applyModifier(durationTicks, upgradeTimerMod)));
    }
    const isInstant = durationTicks <= 0;

    const doWork = async (tx: any) => {
      await this.settlementService.settleLocationTx(
        tx,
        locationId,
        userId,
        currentTickBig,
      );

      for (const cost of costs) {
        if (cost.amount <= 0) continue;

        if (cost.type === "currency") {
          await this.currencyService.spendTx(tx as any, {
            userId,
            currencyId: cost.id,
            amount: cost.amount,
            reason: "building_upgrade",
            sourceType: "location_building",
            sourceId: buildingId,
          });
        } else {
          await this.inventoryService.removeItemTx(tx as any, {
            userId,
            itemId: cost.id,
            quantity: cost.amount,
            reason: "building_upgrade",
            sourceType: "location_building",
            sourceId: buildingId,
          });
        }
      }

      if (isInstant) {
        return (tx as any).locationBuildingInstance.update({
          where: { id: buildingId },
          data: { level: currentLevel + 1 },
          include: { buildingDef: true },
        });
      } else {
        const result = await (tx as any).locationBuildingInstance.update({
          where: { id: buildingId },
          data: { state: { status: "building" } },
          include: { buildingDef: true },
        });

        await (tx as any).job.create({
          data: {
            userId,
            type: "BuildingJob",
            defId: def.id,
            status: "active",
            timer: { startTick: Math.floor(currentTick), durationTicks },
            team: [],
            data: { locationId, buildingId, upgradeToLevel: currentLevel + 1 },
            readyAtTick: Math.floor(currentTick) + durationTicks,
          },
        });

        return result;
      }
    };

    const updated: any = externalTx
      ? await doWork(externalTx)
      : await this.prisma.$transaction(async (tx) => doWork(tx));

    if (externalTx) {
      await this.settlementService.recalculateLocationMeta(locationId, externalTx);
    } else {
      try {
        await this.settlementService.recalculateLocationMeta(locationId);
      } catch (err) {
        this.logger.warn(
          `Failed to recalculate storage for location ${locationId}: ${err}`,
        );
      }
    }

    return {
      id: updated.id,
      buildingDefId: updated.buildingDefId,
      name: updated.buildingDef.name,
      level: isInstant ? currentLevel + 1 : updated.level,
      state: updated.state,
    };
  }

  async claimLocation(userId: string, locationId: string, externalTx?: any) {
    const currentTick = BigInt(
      Math.floor(await this.tickService.getCurrentTick()),
    );
    const currencyIds = await this.getCurrencyIds(externalTx);

    const doWork = async (tx: any) => {
      await this.settlementService.settleLocationTx(
        tx,
        locationId,
        userId,
        currentTick,
      );

      const location = await (tx as any).locationInstance.findFirst({
        where: { id: locationId, ownerUserId: userId },
      });

      if (!location) throw new NotFoundException("Location not found");

      const storage = (location.storage as any) || {};
      const storedAmounts: Record<string, number> = storage.stored || {};
      const capacityAmounts: Record<string, number> = storage.capacity || {};

      const claimed: Array<{
        outputType: string;
        outputRefId: string;
        amount: string;
      }> = [];

      for (const [resourceId, amount] of Object.entries(storedAmounts)) {
        if (amount <= 0) continue;

        const isCurrency = currencyIds.has(resourceId);
        if (isCurrency) {
          await this.currencyService.creditTx(tx as any, {
            userId,
            currencyId: resourceId,
            amount: Number(amount),
            reason: "location_claim",
            sourceType: "location",
            sourceId: locationId,
          });
        } else {
          await this.inventoryService.addItemTx(tx as any, {
            userId,
            itemId: resourceId,
            quantity: Number(amount),
            reason: "location_claim",
            sourceType: "location",
            sourceId: locationId,
          });
        }

        claimed.push({
          outputType: isCurrency ? "CURRENCY" : "ITEM",
          outputRefId: resourceId,
          amount: String(amount),
        });
      }

      const zeroedStored: Record<string, number> = {};
      for (const key of Object.keys(storedAmounts)) {
        zeroedStored[key] = 0;
      }

      await (tx as any).locationInstance.update({
        where: { id: locationId },
        data: {
          storage: {
            ...storage,
            stored: zeroedStored,
            lastSettledAt: new Date().toISOString(),
          },
        },
      });

      return claimed;
    };

    const result = externalTx
      ? await doWork(externalTx)
      : await this.prisma.$transaction(doWork);

    return {
      locationId,
      claimed: result,
    };
  }

  async assignWorker(userId: string, locationId: string, entityId: string) {
    const location = await (this.prisma as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: userId },
      include: { workerAssignments: true },
    });
    if (!location) throw new NotFoundException("Location not found");

    const entity = await (this.prisma as any).entity.findFirst({
      where: { id: entityId, ownerUserId: userId },
    });
    if (!entity) throw new NotFoundException("Entity not found");

    const entityState = (entity.state as any) || {};
    if (
      entityState.status === "working" ||
      entityState.status === "on_mission"
    ) {
      throw new BadRequestException("Entity is currently busy");
    }

    const existingAssignment = await (
      this.prisma as any
    ).locationWorkerAssignment.findFirst({
      where: { locationId, entityId },
    });
    if (existingAssignment) {
      throw new BadRequestException(
        "Entity is already assigned to this location",
      );
    }

    const locationDef = await (
      this.prisma as any
    ).locationDefinition.findUnique({
      where: { id: location.definitionId },
    });
    const locRules = (locationDef?.rules as LevelRules) || {};
    const locConfig = resolveLevelConfig(locRules, location.level);

    const maxWorkers = locConfig.workers?.slots ?? 2;
    if (location.workerAssignments.length >= maxWorkers) {
      throw new BadRequestException(
        `Maximum ${maxWorkers} workers reached for this location`,
      );
    }

    const assignment = await (
      this.prisma as any
    ).locationWorkerAssignment.create({
      data: {
        locationId,
        entityId,
        roleTag: "production",
        bonus: {},
      },
    });

    await (this.prisma as any).entity.update({
      where: { id: entityId },
      data: { state: { ...entityState, status: "working" } },
    });

    try {
      await this.settlementService.recalculateLocationMeta(locationId);
    } catch (err) {
      this.logger.warn(
        `Failed to recalculate location meta for ${locationId}: ${err}`,
      );
    }

    return {
      id: assignment.id,
      entityId: assignment.entityId,
      roleTag: assignment.roleTag,
      bonus: assignment.bonus,
    };
  }

  async removeWorker(userId: string, locationId: string, entityId: string) {
    const location = await (this.prisma as any).locationInstance.findFirst({
      where: { id: locationId, ownerUserId: userId },
    });
    if (!location) throw new NotFoundException("Location not found");

    const assignment = await (
      this.prisma as any
    ).locationWorkerAssignment.findFirst({
      where: { locationId, entityId },
    });
    if (!assignment) throw new NotFoundException("Worker assignment not found");

    await (this.prisma as any).locationWorkerAssignment.delete({
      where: { id: assignment.id },
    });

    const entity = await (this.prisma as any).entity.findUnique({
      where: { id: entityId },
    });
    if (entity) {
      const entityState = (entity.state as any) || {};
      await (this.prisma as any).entity.update({
        where: { id: entityId },
        data: { state: { ...entityState, status: "idle" } },
      });
    }

    try {
      await this.settlementService.recalculateLocationMeta(locationId);
    } catch (err) {
      this.logger.warn(
        `Failed to recalculate location meta for ${locationId}: ${err}`,
      );
    }

    return { success: true };
  }

  async toggleLocationEnabled(
    userId: string,
    locationId: string,
    enabled: boolean,
    externalTx?: any,
  ) {
    // getCurrentTick is a non-DB call; fetch it before entering the transaction.
    const currentTickBig = BigInt(Math.floor(await this.tickService.getCurrentTick()));

    const doWork = async (db: any) => {
      const location = await (db as any).locationInstance.findFirst({
        where: { id: locationId, ownerUserId: userId },
      });
      if (!location) throw new NotFoundException("Location not found");

      await this.settlementService.settleLocationTx(db, locationId, userId, currentTickBig);

      if (!enabled) {
        const activeCount = await (db as any).locationInstance.count({
          where: { ownerUserId: userId, enabled: true },
        });
        if (activeCount <= 1) {
          throw new BadRequestException("Cannot disable your only active outpost");
        }

        // --- Unassign workers ---
        const assignments = await (db as any).locationWorkerAssignment.findMany({
          where: { locationId },
          select: { entityId: true },
        });
        const workerEntityIds: string[] = assignments.map((a: any) => a.entityId);
        await (db as any).locationWorkerAssignment.deleteMany({ where: { locationId } });

        // --- Locate all jobs to cancel ---
        const buildingAndCraftingJobs = await (db as any).job.findMany({
          where: {
            userId,
            type: { in: ["BuildingJob", "CraftingJob"] },
            status: { in: ["active", "ready_notified"] },
            data: { path: ["locationId"], equals: locationId },
          },
          select: { id: true, team: true },
        });

        const allActiveMissionJobs = workerEntityIds.length > 0
          ? await (db as any).job.findMany({
              where: {
                userId,
                type: "MissionJob",
                status: { in: ["active", "ready_notified"] },
              },
              select: { id: true, team: true },
            })
          : [];
        const affectedMissionJobs = (allActiveMissionJobs as any[]).filter((j: any) => {
          const team: string[] = Array.isArray(j.team) ? j.team : [];
          return workerEntityIds.some((eid) => team.includes(eid));
        });

        const allCancelledJobs = [...buildingAndCraftingJobs, ...affectedMissionJobs];
        const allCancelledJobIds: string[] = allCancelledJobs.map((j: any) => j.id);

        // --- Collect all team entity IDs across every cancelled job plus worker IDs ---
        const allEntityIdsToIdle = new Set<string>(workerEntityIds);
        for (const job of allCancelledJobs) {
          const team: string[] = Array.isArray(job.team) ? job.team : [];
          for (const eid of team) allEntityIdsToIdle.add(eid);
        }

        // --- Set all affected entities to idle ---
        for (const entityId of allEntityIdsToIdle) {
          const entity = await (db as any).entity.findUnique({
            where: { id: entityId },
            select: { state: true },
          });
          if (entity) {
            const entityState = (entity.state as any) || {};
            await (db as any).entity.update({
              where: { id: entityId },
              data: { state: { ...entityState, status: "idle" } },
            });
          }
        }

        // --- Cancel jobs and archive their job_ready notifications ---
        if (allCancelledJobIds.length > 0) {
          await (db as any).job.updateMany({
            where: { id: { in: allCancelledJobIds } },
            data: { status: "cancelled" },
          });

          const staleNotifs = await (db as any).notification.findMany({
            where: {
              userId,
              sourceType: "job_ready",
              sourceId: { in: allCancelledJobIds },
              archivedAt: null,
            },
            select: { id: true },
          });
          if (staleNotifs.length > 0) {
            const now = new Date();
            await (db as any).notification.updateMany({
              where: { id: { in: staleNotifs.map((n: any) => n.id) } },
              data: { archivedAt: now, dismissedAt: now, readAt: now },
            });
          }
        }

        // --- Clear primary outpost if it pointed here ---
        await (db as any).user.updateMany({
          where: { id: userId, primaryLocationId: locationId },
          data: { primaryLocationId: null },
        });
      }

      await (db as any).locationInstance.update({
        where: { id: locationId },
        data: { enabled },
      });

      return { id: locationId, enabled };
    };

    return externalTx ? doWork(externalTx) : this.prisma.$transaction((tx) => doWork(tx));
  }

  async toggleBuildingEnabled(
    userId: string,
    locationId: string,
    buildingId: string,
    enabled: boolean,
  ) {
    const building = await this.prisma.locationBuildingInstance.findFirst({
      where: { id: buildingId, locationId, location: { ownerUserId: userId } },
    });
    if (!building) throw new NotFoundException("Building not found");

    const currentTickBig = BigInt(Math.floor(await this.tickService.getCurrentTick()));

    await this.prisma.$transaction(async (tx) => {
      await this.settlementService.settleLocationTx(tx, locationId, userId, currentTickBig);
      await (tx as any).locationBuildingInstance.update({
        where: { id: buildingId },
        data: { enabled },
      });
    });

    try {
      await this.settlementService.recalculateLocationMeta(locationId);
    } catch (err) {
      this.logger.warn(
        `Failed to recalculate location meta for ${locationId}: ${err}`,
      );
    }
    return { id: buildingId, enabled };
  }

  async toggleRoomEnabled(
    userId: string,
    locationId: string,
    roomId: string,
    enabled: boolean,
  ) {
    const room = await (this.prisma as any).locationRoomInstance.findFirst({
      where: {
        id: roomId,
        building: { locationId, location: { ownerUserId: userId } },
      },
    });
    if (!room) throw new NotFoundException("Room not found");

    const currentTickBig = BigInt(Math.floor(await this.tickService.getCurrentTick()));

    await this.prisma.$transaction(async (tx) => {
      await this.settlementService.settleLocationTx(tx, locationId, userId, currentTickBig);
      await (tx as any).locationRoomInstance.update({
        where: { id: roomId },
        data: { enabled },
      });
    });

    try {
      await this.settlementService.recalculateLocationMeta(locationId);
    } catch (err) {
      this.logger.warn(
        `Failed to recalculate location meta for ${locationId}: ${err}`,
      );
    }
    return { id: roomId, enabled };
  }
}
