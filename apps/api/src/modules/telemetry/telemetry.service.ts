import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface TelemetryEvent {
  id: bigint;
  userId: string;
  eventType: string;
  key: string | null;
  amount: number;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface TelemetrySubscriber {
  processEvent(userId: string, event: TelemetryEvent, tx?: any): Promise<void>;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private subscribers: TelemetrySubscriber[] = [];

  constructor(private prisma: PrismaService) {}

  registerSubscriber(sub: TelemetrySubscriber): void {
    this.subscribers.push(sub);
  }

  async record(
    userId: string,
    eventType: string,
    key?: string | null,
    amount: number = 1,
    data: Record<string, unknown> = {},
    tx?: any,
  ): Promise<TelemetryEvent> {
    const db = tx || this.prisma;

    const event = await (db as any).playerEvent.create({
      data: {
        userId,
        eventType,
        key: key ?? null,
        amount,
        data,
      },
    });

    const typedEvent: TelemetryEvent = {
      id: event.id,
      userId: event.userId,
      eventType: event.eventType,
      key: event.key,
      amount: event.amount,
      data: (event.data as Record<string, unknown>) ?? {},
      createdAt: event.createdAt,
    };

    for (const sub of this.subscribers) {
      try {
        await sub.processEvent(userId, typedEvent, tx);
      } catch (err) {
        this.logger.error(
          `TelemetrySubscriber ${sub.constructor.name} failed for event ${eventType}: ${err}`,
        );
      }
    }

    return typedEvent;
  }
}
