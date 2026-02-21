import { Injectable, Inject, forwardRef, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GiftService } from '../gift/gift.service';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => GiftService))
    private giftService: GiftService,
  ) {}

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
        return this.giftService.createGiftForPlayer(
          context.userId,
          safePayload.giftDefId,
          context.sourceType,
          context.sourceId,
          context.idempotencyKey,
        );
      }

      default:
        throw new BadRequestException(
          `Unknown handler key "${eventDef.handlerKey}" for event "${defId}"`,
        );
    }
  }
}
