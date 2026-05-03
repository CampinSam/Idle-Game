import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface HomeBannerSnapshot {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  backgroundImage: string | null;
  ctaLabel: string | null;
  ctaRoute: string | null;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  seasonId: string | null;
  config: Record<string, any>;
}

@Injectable()
export class HomeBannerService {
  private readonly logger = new Logger(HomeBannerService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Resolves the list of active banners for the homescreen carousel.
   *
   * Rules:
   * - Banner row must have status === 'active'.
   * - Banner row's startsAt/endsAt window must include `now` (null bounds = open).
   * - If `config.deriveFromActiveSeason` is true and there is no active Season,
   *   the banner is hidden. When there IS an active Season, the banner's
   *   `title`, `subtitle`, `endsAt`, `seasonId`, and `config.tagline` are
   *   substituted from the Season row, preserving the existing season-banner
   *   visual parity through the new pipeline.
   *
   * The active-season substitution lives here (server side) rather than in the
   * client so client code stays a dumb renderer of `HomeBannerSnapshot` rows
   * and the source of truth (DB row + Season) is owned by the API.
   */
  async listActive(_userId: string, now: Date = new Date()): Promise<HomeBannerSnapshot[]> {
    const [rows, activeSeason] = await Promise.all([
      (this.prisma as any).homeBannerDef.findMany({
        where: {
          status: 'active',
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
        orderBy: [{ priority: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.season.findFirst({
        where: { status: 'active', startsAt: { lte: now }, endsAt: { gt: now } },
        orderBy: { endsAt: 'asc' },
      }),
    ]);

    const result: HomeBannerSnapshot[] = [];
    for (const row of rows as any[]) {
      const cfg = (row.config && typeof row.config === 'object') ? row.config : {};
      const deriveFromSeason = cfg.deriveFromActiveSeason === true;

      if (deriveFromSeason && !activeSeason) continue;

      let title = row.title;
      let subtitle = row.subtitle;
      let endsAt = row.endsAt ? row.endsAt.toISOString() : null;
      let startsAt = row.startsAt ? row.startsAt.toISOString() : null;
      let seasonId = row.seasonId ?? null;
      let mergedCfg = { ...cfg };

      if (deriveFromSeason && activeSeason) {
        title = activeSeason.name || title;
        endsAt = activeSeason.endsAt.toISOString();
        startsAt = activeSeason.startsAt.toISOString();
        seasonId = activeSeason.id;
        const seasonCfg = (activeSeason.config && typeof activeSeason.config === 'object')
          ? activeSeason.config as Record<string, any>
          : {};
        if (seasonCfg.tagline && !mergedCfg.tagline) {
          mergedCfg.tagline = seasonCfg.tagline;
        }
      }

      result.push({
        id: row.id,
        title,
        subtitle,
        description: row.description,
        backgroundImage: row.backgroundImage,
        ctaLabel: row.ctaLabel,
        ctaRoute: row.ctaRoute,
        priority: row.priority,
        startsAt,
        endsAt,
        seasonId,
        config: mergedCfg,
      });
    }

    return result;
  }
}
