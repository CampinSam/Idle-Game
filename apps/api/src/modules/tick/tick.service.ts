import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  getCurrentTick,
  durationMinutesToTicks,
  getRemainingMs,
  isComplete as tickIsComplete,
  type TickRateInterval as MathTickRateInterval,
} from '@derp/math';

@Injectable()
export class TickService {
  private cachedIntervals: MathTickRateInterval[] | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 5000;

  constructor(private prisma: PrismaService) {}

  async getRateHistory(): Promise<MathTickRateInterval[]> {
    const now = Date.now();
    if (this.cachedIntervals && now < this.cacheExpiry) {
      return this.cachedIntervals;
    }

    const intervals = await (this.prisma as any).tickRateInterval.findMany({
      orderBy: { effectiveFromTime: 'asc' },
    });

    this.cachedIntervals = intervals.map((i: any) => ({
      effectiveFromTime: i.effectiveFromTime,
      effectiveFromTick: i.effectiveFromTick,
      ticksPerSecond: i.ticksPerSecond,
    }));
    this.cacheExpiry = now + this.CACHE_TTL_MS;

    return this.cachedIntervals!;
  }

  invalidateCache() {
    this.cachedIntervals = null;
    this.cacheExpiry = 0;
  }

  async getCurrentTick(now?: Date): Promise<number> {
    const history = await this.getRateHistory();
    return getCurrentTick(now || new Date(), history);
  }

  async getCurrentRate(): Promise<number> {
    const history = await this.getRateHistory();
    if (history.length === 0) return 1.0;

    const now = new Date();
    const sorted = [...history].sort(
      (a, b) =>
        new Date(a.effectiveFromTime).getTime() -
        new Date(b.effectiveFromTime).getTime(),
    );

    let currentRate = 1.0;
    for (const interval of sorted) {
      if (new Date(interval.effectiveFromTime).getTime() <= now.getTime()) {
        currentRate = interval.ticksPerSecond;
      } else {
        break;
      }
    }
    return currentRate;
  }

  async getTickInfo() {
    const now = new Date();
    const [currentTick, currentRate] = await Promise.all([
      this.getCurrentTick(now),
      this.getCurrentRate(),
    ]);
    return {
      currentTick,
      currentRate,
      serverTime: now.toISOString(),
    };
  }

  convertDurationToTicks(durationMinutes: number): number {
    return durationMinutesToTicks(durationMinutes, 1.0);
  }

  async getProjectedCompletionTime(
    startTick: number,
    durationTicks: number,
  ): Promise<Date> {
    const now = new Date();
    const currentTick = await this.getCurrentTick(now);
    const currentRate = await this.getCurrentRate();
    const remainingMs = getRemainingMs(startTick, durationTicks, currentTick, currentRate);
    return new Date(now.getTime() + remainingMs);
  }

  async isTaskComplete(startTick: number, durationTicks: number): Promise<boolean> {
    const currentTick = await this.getCurrentTick();
    return tickIsComplete(startTick, durationTicks, currentTick);
  }
}
