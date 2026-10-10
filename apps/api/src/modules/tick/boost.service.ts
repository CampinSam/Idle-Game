import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from './tick.service';
import { NotificationService } from '../notification/notification.service';
import { PubSubService } from '../infrastructure/pubsub.service';

@Injectable()
export class BoostService {
  constructor(
    private prisma: PrismaService,
    private tickService: TickService,
    private notificationService: NotificationService,
    private pubsub: PubSubService,
  ) {}

  private get boostEvent() {
    return (this.prisma as any).boostEvent;
  }

  private get tickRateInterval() {
    return (this.prisma as any).tickRateInterval;
  }

  async getAllBoosts() {
    return this.boostEvent.findMany({
      orderBy: { startTime: 'desc' },
      take: 50,
    });
  }

  /**
   * Recomputes the combined tick rate from the unboosted base rate plus all
   * currently active percentBoost values (additive). Writes a new
   * TickRateInterval anchored to `anchorBoostId` (non-null) so it is never
   * mistaken for an admin-set base rate.
   *
   * Base rate = most recent TickRateInterval where boostEventId IS NULL.
   */
  private async recomputeActiveRate(atTime: Date, anchorBoostId: string): Promise<number> {
    const activeBoosts = await this.boostEvent.findMany({
      where: {
        status: 'active',
        startTime: { lte: atTime },
        endTime: { gt: atTime },
      },
      select: { percentBoost: true },
    });

    const combinedPercent = activeBoosts.reduce(
      (sum: number, b: { percentBoost: number }) => sum + b.percentBoost,
      0,
    );

    // Admin-set base rate: most recent interval that is NOT boost-generated
    const baseInterval = await this.tickRateInterval.findFirst({
      where: {
        boostEventId: null,
        effectiveFromTime: { lte: atTime },
      },
      orderBy: { effectiveFromTime: 'desc' },
    });
    const baseRate: number = baseInterval?.ticksPerSecond ?? 1.0;

    const multiplier = 1 + combinedPercent / 100;
    const newRate = baseRate * multiplier;
    const currentTick = await this.tickService.getCurrentTick(atTime);

    await this.tickRateInterval.create({
      data: {
        ticksPerSecond: newRate,
        effectiveFromTime: atTime,
        effectiveFromTick: currentTick,
        boostEventId: anchorBoostId,
      },
    });

    this.tickService.invalidateCache();
    return newRate;
  }

  private async publishBoostChanged(): Promise<void> {
    const now = new Date();
    const activeBoosts = await this.boostEvent.findMany({
      where: {
        status: 'active',
        startTime: { lte: now },
        endTime: { gt: now },
      },
      select: { id: true, name: true, percentBoost: true, endTime: true },
    });

    const combinedPercent = activeBoosts.reduce(
      (sum: number, b: { percentBoost: number }) => sum + b.percentBoost,
      0,
    );

    this.pubsub.publishBroadcast({
      type: 'boost.changed',
      active: activeBoosts.map((b: any) => ({
        id: b.id,
        name: b.name,
        percentBoost: b.percentBoost,
        endTime: b.endTime instanceof Date ? b.endTime.toISOString() : b.endTime,
      })),
      combinedPercent,
    });
  }

  async createBoost(data: {
    name: string;
    description?: string;
    multiplier: number;
    percentBoost?: number;
    durationMinutes: number;
    startTime?: Date;
    userId?: string;
  }) {
    if (data.multiplier <= 0 || data.multiplier > 10) {
      throw new BadRequestException('Multiplier must be between 0 and 10');
    }
    if (data.durationMinutes <= 0 || data.durationMinutes > 1440) {
      throw new BadRequestException('Duration must be between 1 and 1440 minutes');
    }

    const startTime = data.startTime || new Date();
    const endTime = new Date(startTime.getTime() + data.durationMinutes * 60 * 1000);
    const percentBoost = data.percentBoost ?? (data.multiplier - 1) * 100;

    const boost = await this.boostEvent.create({
      data: {
        name: data.name,
        description: data.description,
        multiplier: data.multiplier,
        percentBoost,
        startTime,
        endTime,
        status: 'active',
      },
    });

    const newRate = await this.recomputeActiveRate(startTime, boost.id);

    if (data.userId) {
      const pctFaster = Math.round(percentBoost);
      await this.notificationService.createNotification({
        userId: data.userId,
        type: 'boost_activated',
        category: 'boost',
        priority: 'high',
        title: 'Time Boost Activated!',
        body: `${data.name} — +${pctFaster}% faster for ${data.durationMinutes}m`,
        groupKey: `boost_activated_${data.userId}`,
      });
    }

    const boostNow = new Date();
    const boostCurrentTick = await this.tickService.getCurrentTick(boostNow);
    const currentActiveBoosts = await this.tickService.getActiveBoosts();
    this.pubsub.publishBroadcast({
      type: 'tick.sync',
      currentTick: boostCurrentTick,
      tickRate: newRate,
      serverTime: boostNow.toISOString(),
      boosts: currentActiveBoosts,
    });

    await this.publishBoostChanged();

    return boost;
  }

  async cancelBoost(boostId: string) {
    const boost = await this.boostEvent.findUnique({
      where: { id: boostId },
    });
    if (!boost) throw new BadRequestException('Boost not found');
    if (boost.status !== 'active') {
      throw new BadRequestException('Boost is not active');
    }

    const now = new Date();

    await this.boostEvent.update({
      where: { id: boostId },
      data: { status: 'cancelled', endTime: now },
    });

    // Pass boostId so the resulting interval is not mistaken for an admin base rate
    const newRate = await this.recomputeActiveRate(now, boostId);

    const cancelCurrentTick = await this.tickService.getCurrentTick(now);
    const currentActiveBoosts = await this.tickService.getActiveBoosts();
    this.pubsub.publishBroadcast({
      type: 'tick.sync',
      currentTick: cancelCurrentTick,
      tickRate: newRate,
      serverTime: now.toISOString(),
      boosts: currentActiveBoosts,
    });

    await this.publishBoostChanged();

    return { message: 'Boost cancelled' };
  }

  /**
   * Called on every tick poll cycle. Finds naturally expired boost events
   * (endTime <= now, status = 'active'), marks them expired, recomputes the
   * tick rate, and broadcasts tick.sync + boost.changed. Returns the count of
   * newly expired boosts.
   */
  async expireStaleBoosts(): Promise<number> {
    const now = new Date();
    const expiring = await this.boostEvent.findMany({
      where: { status: 'active', endTime: { lte: now } },
      select: { id: true },
    });

    if (expiring.length === 0) return 0;

    const ids: string[] = expiring.map((b: { id: string }) => b.id);

    await this.boostEvent.updateMany({
      where: { id: { in: ids } },
      data: { status: 'expired' },
    });

    // Anchor the resulting interval to the first expired boost (non-null marker)
    const newRate = await this.recomputeActiveRate(now, ids[0]);

    const currentTick = await this.tickService.getCurrentTick(now);
    const currentActiveBoosts = await this.tickService.getActiveBoosts();
    this.pubsub.publishBroadcast({
      type: 'tick.sync',
      currentTick,
      tickRate: newRate,
      serverTime: now.toISOString(),
      boosts: currentActiveBoosts,
    });

    await this.publishBoostChanged();
    return ids.length;
  }
}
