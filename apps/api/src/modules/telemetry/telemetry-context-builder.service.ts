import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SelectionContext, SelectionEntityContext, SelectionMissionContext } from '../selection/selection.types';

export interface ContextBuilderOptions {
  entityIds?: string[];
  missionContext?: SelectionMissionContext;
}

@Injectable()
export class TelemetryContextBuilderService {
  private readonly logger = new Logger(TelemetryContextBuilderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async buildContext(
    userId: string,
    options: ContextBuilderOptions = {},
  ): Promise<SelectionContext> {
    const { entityIds = [], missionContext } = options;

    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { keeperLevel: true, flags: true },
    });

    const player = {
      keeperLevel: user?.keeperLevel ?? 0,
      flags: (user?.flags as Record<string, unknown>) ?? {},
    };

    let entities: SelectionEntityContext[] = [];
    if (entityIds.length > 0) {
      const rows = await (this.prisma as any).entity.findMany({
        where: { id: { in: entityIds } },
        select: {
          id: true,
          role: true,
          traits: true,
          stats: true,
          progression: true,
          definitionId: true,
          nftCollectionDefId: true,
        },
      });

      entities = rows.map((e: any) => {
        const traits = (e.traits as Record<string, string>) ?? {};
        const stats = (e.stats as Record<string, number>) ?? {};
        const level = (e.progression as any)?.level ?? 1;
        return {
          id: e.id as string,
          entityType: (e.role as string | undefined) ?? undefined,
          speciesId: (e.definitionId as string | undefined) ?? undefined,
          collectionId: (e.nftCollectionDefId as string | undefined) ?? undefined,
          traits,
          stats,
          level: Number(level),
          rarity: (traits.rarity as string | undefined) ?? undefined,
        } satisfies SelectionEntityContext;
      });
    }

    return {
      player,
      entities,
      inventory: { currencies: {}, items: {} },
      locations: [],
      missionContext,
    };
  }
}
