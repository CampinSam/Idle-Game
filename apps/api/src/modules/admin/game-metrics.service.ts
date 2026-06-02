import { Injectable, Logger } from '@nestjs/common';
import { JobType } from '@prisma/client';
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
  'arcanium_generated', 'arcanium_spent',
  'essence_earned', 'essence_spent',
]);

@Injectable()
export class GameMetricsService {
  private readonly logger = new Logger(GameMetricsService.name);
  private cache: { data: GameHealthMetrics; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getGameHealthMetrics(): Promise<GameHealthMetrics> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }

    const now = new Date();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalPlayers,
      dau,
      wau,
      mau,
      totalJobs24h,
      completedMissionJobs24h,
      playersWithMissions24h,
      arcaniumLedger7d,
      essenceLedger7d,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { updatedAt: { gte: ago24h } } }),
      this.prisma.user.count({ where: { updatedAt: { gte: ago7d } } }),
      this.prisma.user.count({ where: { updatedAt: { gte: ago30d } } }),
      this.prisma.job.count({ where: { status: 'completed', updatedAt: { gte: ago24h } } }),
      this.prisma.job.count({ where: { type: JobType.MissionJob, status: 'completed', updatedAt: { gte: ago24h } } }),
      this.prisma.job.groupBy({
        by: ['userId'],
        where: { type: JobType.MissionJob, updatedAt: { gte: ago24h } },
      }).then(r => r.length),
      this.prisma.currencyLedger.aggregate({
        where: { currencyId: 'soft_arcanium', createdAt: { gte: ago7d } },
        _sum: { delta: true },
      }),
      this.prisma.currencyLedger.aggregate({
        where: { currencyId: 'hard_essence', createdAt: { gte: ago7d } },
        _sum: { delta: true },
      }),
    ]);

    const [
      arcaniumGenerated7d,
      arcaniumSpent7d,
      essenceEarned7d,
      essenceSpent7d,
    ] = await Promise.all([
      this.prisma.currencyLedger.aggregate({
        where: { currencyId: 'soft_arcanium', delta: { gt: 0 }, createdAt: { gte: ago7d } },
        _sum: { delta: true },
      }),
      this.prisma.currencyLedger.aggregate({
        where: { currencyId: 'soft_arcanium', delta: { lt: 0 }, createdAt: { gte: ago7d } },
        _sum: { delta: true },
      }),
      this.prisma.currencyLedger.aggregate({
        where: { currencyId: 'hard_essence', delta: { gt: 0 }, createdAt: { gte: ago7d } },
        _sum: { delta: true },
      }),
      this.prisma.currencyLedger.aggregate({
        where: { currencyId: 'hard_essence', delta: { lt: 0 }, createdAt: { gte: ago7d } },
        _sum: { delta: true },
      }),
    ]);

    const d1Retention = await this.computeRetention(1);
    const d7Retention = await this.computeRetention(7);
    const d30Retention = await this.computeRetention(30);

    const dauMauRatio = mau > 0 ? Math.round((dau / mau) * 1000) / 10 : null;
    const missionParticipationRate = dau > 0 ? Math.round((playersWithMissions24h / dau) * 1000) / 10 : null;
    const sessionsPerDay = dau > 0 ? Math.round((totalJobs24h / dau) * 10) / 10 : null;

    const arcGen = Number(arcaniumGenerated7d._sum.delta ?? 0);
    const arcSpent = Math.abs(Number(arcaniumSpent7d._sum.delta ?? 0));
    const essEarned = Number(essenceEarned7d._sum.delta ?? 0);
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
        name: 'sessions_per_day',
        value: sessionsPerDay,
        unit: 'jobs/player',
        label: 'Sessions Per Day',
        description: 'Approximate activity depth — completed jobs per active player in 24h',
        status: sessionsPerDay === null ? 'neutral' : this.statusThreshold(sessionsPerDay, 5, 2),
        benchmark: '≥5 green, ≥2 yellow',
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
        name: 'total_players',
        value: totalPlayers,
        unit: 'accounts',
        label: 'Total Registered',
        description: 'All registered player accounts',
        status: 'neutral',
        benchmark: 'No threshold',
      },
      {
        name: 'completed_missions_24h',
        value: completedMissionJobs24h,
        unit: 'missions',
        label: 'Missions Completed (24h)',
        description: 'Total mission jobs completed in the last 24 hours',
        status: this.statusThreshold(completedMissionJobs24h, 100, 20),
        benchmark: '≥100 green, ≥20 yellow',
      },
      {
        name: 'arcanium_generated',
        value: arcGen,
        unit: 'arc',
        label: 'Arcanium Generated (7d)',
        description: 'Total Arcanium credited across all wallets in last 7 days',
        status: 'neutral',
        benchmark: 'Informational',
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
        name: 'essence_earned',
        value: essEarned,
        unit: 'ess',
        label: 'Essence Earned (7d)',
        description: 'Total Essence credited across all wallets in last 7 days',
        status: 'neutral',
        benchmark: 'Informational',
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

  private statusThreshold(value: number, green: number, yellow: number): 'green' | 'yellow' | 'red' {
    if (value >= green) return 'green';
    if (value >= yellow) return 'yellow';
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

  invalidateCache(): void {
    this.cache = null;
  }
}
