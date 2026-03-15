import { Injectable, Inject, forwardRef, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GiftService } from '../gift/gift.service';

const JOB_SOURCE_TYPES = new Set(['MissionJob', 'CraftingJob', 'BuildingJob']);

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => GiftService))
    private giftService: GiftService,
  ) {}

  private async buildContextData(
    payload: Record<string, any>,
    sourceType?: string,
    sourceId?: string,
  ): Promise<Record<string, unknown> | undefined> {
    const parts: Record<string, unknown> = {};

    if (sourceType && JOB_SOURCE_TYPES.has(sourceType) && sourceId) {
      try {
        const job = await (this.prisma as any).job.findUnique({
          where: { id: sourceId },
          select: {
            id: true,
            type: true,
            defId: true,
            status: true,
            team: true,
            results: true,
            data: true,
            timer: true,
          },
        });
        if (job) {
          parts.job = job;
        }
      } catch (err) {
        this.logger.warn(`Failed to look up job ${sourceId} for context enrichment: ${err}`);
      }
    }

    if (payload.contextData && typeof payload.contextData === 'object') {
      Object.assign(parts, payload.contextData);
    }

    return Object.keys(parts).length > 0 ? parts : undefined;
  }

  async dispatch(
    defId: string,
    payload: any,
    context: {
      userId: string;
      sourceType?: string;
      sourceId?: string;
      idempotencyKey?: string;
    },
  ) {
    const eventDef = await (this.prisma as any).eventDefinition.findUnique({
      where: { id: defId },
    });

    if (!eventDef) {
      throw new NotFoundException(`EventDefinition "${defId}" not found`);
    }

    if (!eventDef.enabled) {
      throw new BadRequestException(`Event "${defId}" is disabled`);
    }

    const security = (eventDef.security as any) || {};
    if (security.allowedEmitters && context.sourceType) {
      if (!security.allowedEmitters.includes(context.sourceType)) {
        throw new BadRequestException(
          `Source type "${context.sourceType}" is not allowed for event "${defId}"`,
        );
      }
    }

    const safePayload = payload && typeof payload === 'object' ? payload : {};

    switch (eventDef.handlerKey) {
      case 'createGiftForPlayer': {
        if (!safePayload.giftDefId) {
          throw new BadRequestException(
            `Event "${defId}" requires payload.giftDefId but it was not provided`,
          );
        }
        const contextData = await this.buildContextData(
          safePayload,
          context.sourceType,
          context.sourceId,
        );
        return this.giftService.createGiftForPlayer(
          context.userId,
          safePayload.giftDefId,
          context.sourceType,
          context.sourceId,
          context.idempotencyKey,
          contextData,
        );
      }

      default:
        throw new BadRequestException(
          `Unknown handler key "${eventDef.handlerKey}" for event "${defId}"`,
        );
    }
  }
}
