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

  async createBoost(data: {
    name: string;
    description?: string;
    multiplier: number;
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

    const activeBoosts = await this.tickService.getActiveBoosts();
    if (activeBoosts.length > 0) {
      throw new BadRequestException(
        'A boost is already active. Cancel it first or wait for it to end.',
      );
    }

    const startTime = data.startTime || new Date();
    const endTime = new Date(startTime.getTime() + data.durationMinutes * 60 * 1000);

    const startTick = await this.tickService.getCurrentTick(startTime);
    const priorRate = await this.tickService.getCurrentRate();
    const boostedRate = priorRate * data.multiplier;

    const boostDurationSec = data.durationMinutes * 60;
    const endTick = startTick + boostDurationSec * boostedRate;

    const boost = await this.boostEvent.create({
      data: {
        name: data.name,
        description: data.description,
        multiplier: data.multiplier,
        startTime,
        endTime,
        status: 'active',
      },
    });

    await this.tickRateInterval.create({
      data: {
        ticksPerSecond: boostedRate,
        effectiveFromTime: startTime,
        effectiveFromTick: startTick,
        boostEventId: boost.id,
      },
    });

    await this.tickRateInterval.create({
      data: {
        ticksPerSecond: priorRate,
        effectiveFromTime: endTime,
        effectiveFromTick: endTick,
        boostEventId: boost.id,
      },
    });

    this.tickService.invalidateCache();

    if (data.userId) {
      const pctFaster = Math.round((data.multiplier - 1) * 100);
      await this.notificationService.createNotification({
        userId: data.userId,
        type: 'boost_activated',
        category: 'boost',
        priority: 'high',
        title: 'Time Boost Activated!',
        body: `${data.name} — ${pctFaster}% faster for ${data.durationMinutes}m`,
        groupKey: `boost_activated_${data.userId}`,
      });
    }

    const boostNow = new Date();
    const boostCurrentTick = await this.tickService.getCurrentTick(boostNow);
    this.pubsub.publishBroadcast({
      type: 'tick.sync',
      currentTick: boostCurrentTick,
      tickRate: boostedRate,
      serverTime: boostNow.toISOString(),
      boosts: [
        {
          id: boost.id,
          name: boost.name,
          multiplier: boost.multiplier,
          endTime: endTime.toISOString(),
        },
      ],
    });

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
    const currentTick = await this.tickService.getCurrentTick(now);

    const history = await this.tickService.getRateHistory();
    const sorted = [...history].sort(
      (a, b) =>
        new Date(a.effectiveFromTime).getTime() -
        new Date(b.effectiveFromTime).getTime(),
    );

    let priorRate = 1.0;
    for (const interval of sorted) {
      const intervalTime = new Date(interval.effectiveFromTime).getTime();
      if (intervalTime < boost.startTime.getTime()) {
        priorRate = interval.ticksPerSecond;
      }
    }

    await this.tickRateInterval.create({
      data: {
        ticksPerSecond: priorRate,
        effectiveFromTime: now,
        effectiveFromTick: currentTick,
        boostEventId: boost.id,
      },
    });

    await this.boostEvent.update({
      where: { id: boostId },
      data: { status: 'cancelled', endTime: now },
    });

    this.tickService.invalidateCache();

    const cancelNow = new Date();
    const cancelCurrentTick = await this.tickService.getCurrentTick(cancelNow);
    this.pubsub.publishBroadcast({
      type: 'tick.sync',
      currentTick: cancelCurrentTick,
      tickRate: priorRate,
      serverTime: cancelNow.toISOString(),
      boosts: [],
    });

    return { message: 'Boost cancelled' };
  }
}
