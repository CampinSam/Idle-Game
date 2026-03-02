import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GiftService } from '../gift/gift.service';
import { TelemetryService } from '../telemetry/telemetry.service';

function getWindowStart(frequency: any, now: Date): Date {
  const type = frequency?.type ?? 'daily';
  const interval = frequency?.interval ?? 1;

  if (type === 'daily') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  if (type === 'every_x_days') {
    const epochMs = now.getTime();
    const windowMs = interval * 24 * 60 * 60 * 1000;
    const windowStart = Math.floor(epochMs / windowMs) * windowMs;
    return new Date(windowStart);
  }

  if (type === 'weekly') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    const diffToMonday = (day === 0 ? 6 : day - 1);
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    return d;
  }

  if (type === 'monthly') {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getWindowDurationMs(frequency: any): number {
  const type = frequency?.type ?? 'daily';
  const interval = frequency?.interval ?? 1;

  if (type === 'daily') return 24 * 60 * 60 * 1000;
  if (type === 'every_x_days') return interval * 24 * 60 * 60 * 1000;
  if (type === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  if (type === 'monthly') return 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function windowsMissed(lastClaimedAt: Date | null, frequency: any, now: Date): number {
  if (!lastClaimedAt) return 1;
  const lastWindowStart = getWindowStart(frequency, lastClaimedAt);
  const currentWindowStart = getWindowStart(frequency, now);
  const durationMs = getWindowDurationMs(frequency);
  const diff = currentWindowStart.getTime() - lastWindowStart.getTime();
  return Math.floor(diff / durationMs);
}

@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    private prisma: PrismaService,
    private giftService: GiftService,
    private telemetryService: TelemetryService,
  ) {}

  async autoCheck(userId: string, tx?: any): Promise<string[]> {
    const db = tx || this.prisma;
    const now = new Date();

    const defs = await (db as any).checkInDef.findMany({ where: { enabled: true } });
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

    if (reward?.giftDefId) {
      try {
        const gift = await this.giftService.createGiftForPlayer(
          userId,
          reward.giftDefId,
          'checkin',
          def.id,
          `checkin-${def.id}-${userId}-${streak}`,
        );
        giftId = gift.id;
      } catch (err: any) {
        if (!err?.message?.includes('limit')) {
          this.logger.warn(`Failed to issue check-in gift for ${def.id}: ${err}`);
        }
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
      await this.telemetryService.record(
        userId,
        'checkin_completed',
        def.id,
        newStreak,
        { day: dayIndex, track: def.id },
        db,
      );
    } catch (err) {
      this.logger.warn(`Failed to record check-in telemetry: ${err}`);
    }

    return giftId;
  }
}
