import {
  Controller,
  Get,
  Headers,
  Query,
  Res,
  Request,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PubSubService, PubSubMessage } from '../infrastructure/pubsub.service';
import { PrismaService } from '../../prisma/prisma.service';

const HEARTBEAT_INTERVAL = 15000;
const MAX_REPLAY = 100;

@Controller('v1')
export class StreamController {
  private readonly logger = new Logger(StreamController.name);

  constructor(
    private pubsub: PubSubService,
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  @Get('stream')
  async stream(
    @Request() req: any,
    @Res() res: Response,
    @Headers('last-event-id') lastEventId?: string,
    @Query('cursor') cursorParam?: string,
    @Query('token') tokenParam?: string,
  ) {
    let userId: string;

    if (req.user?.id) {
      userId = req.user.id;
    } else if (tokenParam) {
      try {
        const payload = this.jwtService.verify(tokenParam);
        userId = payload.sub;
      } catch {
        throw new UnauthorizedException('Invalid token');
      }
    } else {
      throw new UnauthorizedException('Token required');
    }
    const cursor = lastEventId || cursorParam;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.sendEvent(res, 'hello', { userId, serverTime: Date.now() });

    if (cursor) {
      await this.replayMissed(res, userId, cursor);
    }

    const heartbeat = setInterval(() => {
      this.sendEvent(res, 'ping', { time: Date.now() });
    }, HEARTBEAT_INTERVAL);

    const unsubscribe = this.pubsub.subscribe(
      `player:${userId}`,
      (msg: PubSubMessage) => {
        this.sendEvent(res, 'delta.available', { delta: msg.deltaId }, msg.deltaId);
      },
    );

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  private sendEvent(
    res: Response,
    event: string,
    data: any,
    id?: string,
  ): void {
    try {
      if (id) {
        res.write(`id: ${id}\n`);
      }
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
    }
  }

  private async replayMissed(
    res: Response,
    userId: string,
    cursor: string,
  ): Promise<void> {
    try {
      const since = BigInt(cursor);

      if (since > BigInt(0)) {
        const oldest = await this.prisma.playerDelta.findFirst({
          where: { userId },
          orderBy: { id: 'asc' },
          select: { id: true },
        });

        if (oldest && since < oldest.id) {
          this.sendEvent(res, 'reset.required', {
            reason: 'cursor_expired',
            message: 'Delta history expired, please bootstrap',
          });
          return;
        }
      }

      const deltas = await this.prisma.playerDelta.findMany({
        where: {
          userId,
          id: { gt: since },
        },
        orderBy: { id: 'asc' },
        take: MAX_REPLAY,
        select: { id: true },
      });

      for (const delta of deltas) {
        this.sendEvent(
          res,
          'delta.available',
          { delta: delta.id.toString() },
          delta.id.toString(),
        );
      }

      const total = await this.prisma.playerDelta.count({
        where: { userId, id: { gt: since } },
      });

      if (total > MAX_REPLAY) {
        this.sendEvent(res, 'reset.required', {
          reason: 'too_many_deltas',
          message: 'Too many missed deltas, please bootstrap',
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to replay deltas for user ${userId}`, err);
    }
  }
}
