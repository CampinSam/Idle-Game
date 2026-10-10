import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GiftService } from '../gift/gift.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { TelemetryContextBuilderService } from '../telemetry/telemetry-context-builder.service';
import { windowsMissed } from '../../common/util/cadence';
import type { GiftSpec } from '@derp/shared';
import { DefinitionCacheService } from '../definition-cache/definition-cache.service';

@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    private prisma: PrismaService,
    private giftService: GiftService,
    private telemetryService: TelemetryService,
    private telemetryContextBuilder: TelemetryContextBuilderService,
    private definitionCache: DefinitionCacheService,
  ) {}

  async ensureInstances(userId: string): Promise<void> {
    const defs = this.definitionCache.getAll('checkInDef').filter((d: any) => d.enabled);
    for (const def of defs) {
      try {
        await (this.prisma as any).checkInInstance.upsert({
          where: { userId_checkInDefId: { userId, checkInDefId: def.id } },
          create: { userId, checkInDefId: def.id, streak: 0, totalClaimed: 0 },
          update: {},
        });
      } catch (err) {
        this.logger.warn(`ensureInstances: failed to upsert checkIn instance for def ${def.id}: ${err}`);
      }
    }
  }

  async autoCheck(userId: string, tx?: any): Promise<string[]> {
    const db = tx || this.prisma;

    // Serialize concurrent check-ins for the same user within this transaction.
    // pg_advisory_xact_lock blocks until it can acquire the lock and releases
    // automatically when the transaction ends, so a second rapid tap will wait,
    // then re-read the already-claimed state and return 0 gifts → 400.
    await (db as any).$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${userId}))`;

    const now = new Date();

    const defs = this.definitionCache.getAll('checkInDef').filter((d: any) => d.enabled);
    const issuedGiftIds: string[] = [];

    for (const def of defs) {
      try {
        const giftId = await this.processOneTrack(userId, def, now, db);
        if (giftId) issuedGiftIds.push(giftId);
      } catch (err) {
        this.logger.warn(`Check-in track ${def.id} failed for user ${userId.slice(0, 8)}: ${err}`);
      }
    }

    return issuedGiftIds;
  }

  private async processOneTrack(userId: string, def: any, now: Date, db: any): Promise<string | null> {
    const frequency = (def.frequency as any) ?? { type: 'daily' };
    const rewards: any[] = Array.isArray(def.rewards) ? def.rewards : [];
    const cycleLength = def.cycleLength ?? 7;
    const requireStreak = def.requireStreak ?? false;
    const allowReclaim = def.allowReclaim ?? false;

    let instance = await (db as any).checkInInstance.findUnique({
      where: { userId_checkInDefId: { userId, checkInDefId: def.id } },
    });

    if (!instance) {
      instance = await (db as any).checkInInstance.create({
        data: { userId, checkInDefId: def.id, streak: 0, totalClaimed: 0 },
      });
    }

    const missed = windowsMissed(instance.lastClaimedAt, frequency, now);

    if (missed === 0) return null;

    let streak = instance.streak;
    let didReset = false;

    if (requireStreak && missed > 1) {
      streak = 0;
      didReset = true;
    }

    if (didReset && !allowReclaim && streak === 0 && instance.totalClaimed > 0) {
      const firstDayReward = rewards.find((r: any) => r.day === 0 || r.day === 1);
      if (!firstDayReward) {
        streak = 0;
      }
    }

    const dayIndex = streak % cycleLength;
    const reward = rewards.find(
      (r: any) => r.day === dayIndex || r.day === dayIndex + 1,
    ) ?? rewards[dayIndex] ?? null;

    let giftId: string | null = null;

    const giftSpec: GiftSpec | null = reward?.gift ?? null;

    if (giftSpec) {
      try {
        const gift = await this.giftService.createGiftForPlayer(
          userId,
          giftSpec,
          'checkin',
          def.id,
          `checkin-${def.id}-${userId}-${streak}`,
          { checkin: { streak, trackId: def.id, day: dayIndex } },
        );
        giftId = gift.id;
      } catch (err: any) {
        this.logger.warn(`Failed to issue check-in gift for track ${def.id} streak ${streak}: ${err}`);
        return null;
      }
    }

    const newStreak = streak + 1;
    await (db as any).checkInInstance.update({
      where: { id: instance.id },
      data: {
        streak: newStreak,
        totalClaimed: { increment: 1 },
        lastClaimedAt: now,
      },
    });

    try {
      let selectionContext;
      try {
        selectionContext = await this.telemetryContextBuilder.buildContext(userId);
      } catch (ctxErr) {
        this.logger.warn(`Failed to build selection context for check-in telemetry: ${ctxErr}`);
      }
      await this.telemetryService.record(
        userId,
        'checkin_completed',
        def.id,
        newStreak,
        { day: dayIndex, track: def.id },
        db,
        selectionContext,
      );
    } catch (err) {
      this.logger.warn(`Failed to record check-in telemetry: ${err}`);
    }

    return giftId;
  }
}
