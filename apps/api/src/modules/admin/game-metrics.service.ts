import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JobType, PurchaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface MetricValue {
  name: string;
  value: number | null;
  unit: string;
  label: string;
  description: string;
  status: 'green' | 'yellow' | 'red' | 'neutral';
  benchmark: string;
}

export interface GameHealthMetrics {
  computedAt: string;
  metrics: MetricValue[];
}

export interface MetricHistoryPoint {
  date: string;
  value: number;
}

export interface MetricHistoryResult {
  [metricName: string]: MetricHistoryPoint[];
}

const TIME_SERIES_METRICS = new Set([
  'dau', 'wau', 'mau',
  'd1_retention', 'd7_retention', 'd30_retention',
  'avg_session_length', 'mission_participation_rate',
  'outpost_collection_rate', 'battle_pass_completion_rate',
  'arcanium_spent', 'essence_spent',
  'revenue_per_active_user', 'time_to_first_ascension',
]);

@Injectable()
export class GameMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameMetricsService.name);
  private cache: { data: GameHealthMetrics; expiresAt: number } | null = null;
  private snapshotTimeoutRef: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.scheduleNextSnapshot();
  }

  onModuleDestroy() {
    if (this.snapshotTimeoutRef) {
      clearTimeout(this.snapshotTimeoutRef);
      this.snapshotTimeoutRef = null;
    }
  }

  private scheduleNextSnapshot() {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
    ));
    const msUntilMidnight = nextMidnight.getTime() - Date.now();

    this.snapshotTimeoutRef = setTimeout(async () => {
      try {
        await this.recordDailySnapshot();
        this.logger.log('Daily metric snapshot recorded automatically');
      } catch (err) {
        this.logger.warn(`Daily snapshot failed: ${err}`);
      }
      this.scheduleNextSnapshot();
    }, msUntilMidnight);

    this.logger.log(
      `Next daily snapshot scheduled in ${Math.round(msUntilMidnight / 1000 / 60)}m (${nextMidnight.toISOString()})`,
    );
  }

  async getGameHealthMetrics(): Promise<GameHealthMetrics> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }

    const now = new Date();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Core engagement / retention
    const [
      dau,
      wau,
      mau,
      completedMissionJobs24h,
      playersWithMissions24h,
    ] = await Promise.all([
      this.prisma.user.count({ where: { updatedAt: { gte: ago24h } } }),
      this.prisma.user.count({ where: { updatedAt: { gte: ago7d } } }),
      this.prisma.user.count({ where: { updatedAt: { gte: ago30d } } }),
      this.prisma.job.count({ where: { type: JobType.MissionJob, status: 'completed', updatedAt: { gte: ago24h } } }),
      this.prisma.job.groupBy({
        by: ['userId'],
        where: { type: JobType.MissionJob, updatedAt: { gte: ago24h } },
      }).then(r => r.length),
    ]);

    // Economy
    const [arcaniumSpent7d, essenceSpent7d] = await Promise.all([
      this.prisma.currencyLedger.aggregate({
        where: { currencyId: 'soft_arcanium', delta: { lt: 0 }, createdAt: { gte: ago7d } },
        _sum: { delta: true },
      }),
      this.prisma.currencyLedger.aggregate({
        where: { currencyId: 'hard_essence', delta: { lt: 0 }, createdAt: { gte: ago7d } },
        _sum: { delta: true },
      }),
    ]);

    // Retention
    const d1Retention = await this.computeRetention(1);
    const d7Retention = await this.computeRetention(7);
    const d30Retention = await this.computeRetention(30);

    // Game-specific metrics
    const [
      avgSessionLength,
      battlePassCompletionRate,
      outpostCollectionRate,
      timeToFirstAscension,
      revenuePerActiveUser,
    ] = await Promise.all([
      this.computeAvgSessionLength(ago24h),
      this.computeBattlePassCompletionRate(ago24h, dau),
      this.computeOutpostCollectionRate(ago24h, dau),
      this.computeTimeToFirstAscension(),
      this.computeRevenuePerActiveUser(ago7d, mau),
    ]);

    const dauMauRatio = mau > 0 ? Math.round((dau / mau) * 1000) / 10 : null;
    const missionParticipationRate = dau > 0 ? Math.round((playersWithMissions24h / dau) * 1000) / 10 : null;
    const arcSpent = Math.abs(Number(arcaniumSpent7d._sum.delta ?? 0));
    const essSpent = Math.abs(Number(essenceSpent7d._sum.delta ?? 0));

    const metrics: MetricValue[] = [
      {
        name: 'dau',
        value: dau,
        unit: 'players',
        label: 'Daily Active Users',
        description: 'Players active in the last 24 hours',
        status: this.statusThreshold(dau, 50, 10),
        benchmark: '≥50 green, ≥10 yellow',
      },
      {
        name: 'wau',
        value: wau,
        unit: 'players',
        label: 'Weekly Active Users',
        description: 'Players active in the last 7 days',
        status: this.statusThreshold(wau, 200, 50),
        benchmark: '≥200 green, ≥50 yellow',
      },
      {
        name: 'mau',
        value: mau,
        unit: 'players',
        label: 'Monthly Active Users',
        description: 'Players active in the last 30 days',
        status: this.statusThreshold(mau, 500, 100),
        benchmark: '≥500 green, ≥100 yellow',
      },
      {
        name: 'dau_mau_ratio',
        value: dauMauRatio,
        unit: '%',
        label: 'DAU/MAU Ratio',
        description: 'Stickiness — ratio of daily to monthly active players',
        status: dauMauRatio === null ? 'neutral' : this.statusThreshold(dauMauRatio, 20, 10),
        benchmark: '≥20% green, ≥10% yellow',
      },
      {
        name: 'd1_retention',
        value: d1Retention,
        unit: '%',
        label: 'D1 Retention',
        description: 'Players who returned on day 1 after registration',
        status: d1Retention === null ? 'neutral' : this.statusThreshold(d1Retention, 40, 20),
        benchmark: '≥40% green, ≥20% yellow',
      },
      {
        name: 'd7_retention',
        value: d7Retention,
        unit: '%',
        label: 'D7 Retention',
        description: 'Players who returned on day 7 after registration',
        status: d7Retention === null ? 'neutral' : this.statusThreshold(d7Retention, 20, 10),
        benchmark: '≥20% green, ≥10% yellow',
      },
      {
        name: 'd30_retention',
        value: d30Retention,
        unit: '%',
        label: 'D30 Retention',
        description: 'Players who returned on day 30 after registration',
        status: d30Retention === null ? 'neutral' : this.statusThreshold(d30Retention, 10, 5),
        benchmark: '≥10% green, ≥5% yellow',
      },
      {
        name: 'avg_session_length',
        value: avgSessionLength,
        unit: 'min',
        label: 'Avg Session Length',
        description: 'Average active window per player in the last 24 h (first job created → last job updated)',
        status: avgSessionLength === null ? 'neutral' : this.statusThreshold(avgSessionLength, 30, 10),
        benchmark: '≥30 min green, ≥10 min yellow',
      },
      {
        name: 'mission_participation_rate',
        value: missionParticipationRate,
        unit: '%',
        label: 'Mission Participation',
        description: 'Share of daily active players who ran at least one mission',
        status: missionParticipationRate === null ? 'neutral' : this.statusThreshold(missionParticipationRate, 50, 20),
        benchmark: '≥50% green, ≥20% yellow',
      },
      {
        name: 'outpost_collection_rate',
        value: outpostCollectionRate,
        unit: '%',
        label: 'Outpost Collection Rate',
        description: 'Share of daily active players who interacted with an outpost in the last 24 h',
        status: outpostCollectionRate === null ? 'neutral' : this.statusThreshold(outpostCollectionRate, 60, 30),
        benchmark: '≥60% green, ≥30% yellow',
      },
      {
        name: 'time_to_first_ascension',
        value: timeToFirstAscension,
        unit: 'days',
        label: 'Time to First Ascension',
        description: 'Median days from registration to first entity level-up (proxy for ascension)',
        status: timeToFirstAscension === null ? 'neutral' : this.statusThresholdLower(timeToFirstAscension, 3, 7),
        benchmark: '≤3d green, ≤7d yellow (lower is better)',
      },
      {
        name: 'battle_pass_completion_rate',
        value: battlePassCompletionRate,
        unit: '%',
        label: 'Daily Check-In Rate',
        description: 'Share of daily active players who completed their daily check-in',
        status: battlePassCompletionRate === null ? 'neutral' : this.statusThreshold(battlePassCompletionRate, 50, 20),
        benchmark: '≥50% green, ≥20% yellow',
      },
      {
        name: 'arcanium_spent',
        value: arcSpent,
        unit: 'arc',
        label: 'Arcanium Spent (7d)',
        description: 'Total Arcanium debited across all wallets in last 7 days',
        status: 'neutral',
        benchmark: 'Informational',
      },
      {
        name: 'revenue_per_active_user',
        value: revenuePerActiveUser,
        unit: 'gems/100',
        label: 'Revenue per Active User',
        description: 'Gem purchases completed per 100 monthly active users (7-day window)',
        status: revenuePerActiveUser === null ? 'neutral' : this.statusThreshold(revenuePerActiveUser, 5, 1),
        benchmark: '≥5 green, ≥1 yellow',
      },
      {
        name: 'essence_spent',
        value: essSpent,
        unit: 'ess',
        label: 'Essence Spent (7d)',
        description: 'Total Essence debited across all wallets in last 7 days',
        status: 'neutral',
        benchmark: 'Informational',
      },
    ];

    const result: GameHealthMetrics = {
      computedAt: now.toISOString(),
      metrics,
    };

    this.cache = { data: result, expiresAt: Date.now() + 5 * 60 * 1000 };
    return result;
  }

  async recordDailySnapshot(): Promise<void> {
    const health = await this.getGameHealthMetrics();
    const today = this.utcMidnight(new Date());

    const upserts = health.metrics
      .filter(m => TIME_SERIES_METRICS.has(m.name) && m.value !== null)
      .map(m =>
        this.prisma.metricSnapshot.upsert({
          where: { metricName_date: { metricName: m.name, date: today } },
          create: { metricName: m.name, date: today, value: m.value! },
          update: { value: m.value! },
        }),
      );

    await Promise.all(upserts);
    this.logger.log(`Recorded ${upserts.length} metric snapshots for ${today.toISOString()}`);
  }

  async getMetricHistory(metricNames: string[], days: number): Promise<MetricHistoryResult> {
    const clampedDays = Math.min(days, 90);
    const since = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.metricSnapshot.findMany({
      where: {
        metricName: { in: metricNames },
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    });

    const result: MetricHistoryResult = {};
    for (const name of metricNames) {
      result[name] = [];
    }
    for (const row of rows) {
      if (result[row.metricName]) {
        result[row.metricName].push({
          date: row.date.toISOString().split('T')[0],
          value: row.value,
        });
      }
    }
    return result;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private statusThreshold(value: number, green: number, yellow: number): 'green' | 'yellow' | 'red' {
    if (value >= green) return 'green';
    if (value >= yellow) return 'yellow';
    return 'red';
  }

  /** Lower-is-better threshold (e.g. time to first ascension). */
  private statusThresholdLower(value: number, green: number, yellow: number): 'green' | 'yellow' | 'red' {
    if (value <= green) return 'green';
    if (value <= yellow) return 'yellow';
    return 'red';
  }

  private utcMidnight(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async computeRetention(days: number): Promise<number | null> {
    const cohortStart = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
    const cohortEnd = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const returnWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [cohortSize, returned] = await Promise.all([
      this.prisma.user.count({
        where: { createdAt: { gte: cohortStart, lt: cohortEnd } },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: cohortStart, lt: cohortEnd },
          updatedAt: { gte: returnWindow },
        },
      }),
    ]);

    if (cohortSize === 0) return null;
    return Math.round((returned / cohortSize) * 1000) / 10;
  }

  /** Average session window (minutes) per DAU player in the last 24 h.
   *  Approximated as: mean of (max(job.updatedAt) - min(job.createdAt)) per userId. */
  private async computeAvgSessionLength(since: Date): Promise<number | null> {
    try {
      const rows = await this.prisma.job.groupBy({
        by: ['userId'],
        where: { updatedAt: { gte: since } },
        _max: { updatedAt: true },
        _min: { createdAt: true },
      });
      if (rows.length === 0) return null;
      const durations = rows
        .map(r => {
          const start = r._min.createdAt?.getTime() ?? 0;
          const end = r._max.updatedAt?.getTime() ?? 0;
          return (end - start) / 60_000;
        })
        .filter(d => d >= 0);
      if (durations.length === 0) return null;
      return Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
    } catch {
      return null;
    }
  }

  /** % of DAU players who checked in today. */
  private async computeBattlePassCompletionRate(since: Date, dau: number): Promise<number | null> {
    if (dau === 0) return null;
    try {
      const checkedInCount = await this.prisma.checkInInstance.groupBy({
        by: ['userId'],
        where: { lastClaimedAt: { gte: since } },
      }).then(r => r.length);
      return Math.round((checkedInCount / dau) * 1000) / 10;
    } catch {
      return null;
    }
  }

  /** % of DAU players who interacted with a location/outpost today. */
  private async computeOutpostCollectionRate(since: Date, dau: number): Promise<number | null> {
    if (dau === 0) return null;
    try {
      const activeOwners = await this.prisma.locationInstance.groupBy({
        by: ['ownerUserId'],
        where: {
          ownerUserId: { not: null },
          updatedAt: { gte: since },
        },
      }).then(r => r.filter(x => x.ownerUserId !== null).length);
      return Math.round((activeOwners / dau) * 1000) / 10;
    } catch {
      return null;
    }
  }

  /** Median days from user.createdAt to their first entity's createdAt (proxy for "time to first ascension"). */
  private async computeTimeToFirstAscension(): Promise<number | null> {
    try {
      // Get the earliest entity createdAt per user, joined with their user createdAt.
      const entityRows = await this.prisma.entity.groupBy({
        by: ['ownerUserId'],
        where: { ownerUserId: { not: null } },
        _min: { createdAt: true },
      });
      if (entityRows.length === 0) return null;

      const userIds = entityRows.map(r => r.ownerUserId!).filter(Boolean);
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, createdAt: true },
      });
      const userMap = new Map(users.map(u => [u.id, u.createdAt]));

      const diffs = entityRows
        .filter(r => r.ownerUserId && userMap.has(r.ownerUserId))
        .map(r => {
          const userCreated = userMap.get(r.ownerUserId!)!.getTime();
          const entityCreated = r._min.createdAt?.getTime() ?? userCreated;
          return (entityCreated - userCreated) / (24 * 60 * 60 * 1000);
        })
        .filter(d => d >= 0)
        .sort((a, b) => a - b);

      if (diffs.length === 0) return null;
      const mid = Math.floor(diffs.length / 2);
      const median = diffs.length % 2 === 0
        ? (diffs[mid - 1] + diffs[mid]) / 2
        : diffs[mid];
      return Math.round(median * 10) / 10;
    } catch {
      return null;
    }
  }

  /** Completed gem purchases per 100 MAU in the last 7 days. */
  private async computeRevenuePerActiveUser(since: Date, mau: number): Promise<number | null> {
    if (mau === 0) return null;
    try {
      const purchaseCount = await this.prisma.purchase.count({
        where: { status: PurchaseStatus.CONFIRMED, createdAt: { gte: since } },
      });
      return Math.round((purchaseCount / mau) * 100 * 10) / 10;
    } catch {
      return null;
    }
  }
}
