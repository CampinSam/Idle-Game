import { Injectable, Logger } from '@nestjs/common';

export interface PubSubMessage {
  userId: string;
  deltaId: string;
}

export abstract class PubSubService {
  abstract publish(channel: string, message: PubSubMessage): void;
  abstract subscribe(
    channel: string,
    handler: (message: PubSubMessage) => void,
  ): () => void;
}

@Injectable()
export class InMemoryPubSubService extends PubSubService {
  private readonly logger = new Logger(InMemoryPubSubService.name);
  private listeners = new Map<string, Set<(msg: PubSubMessage) => void>>();

  publish(channel: string, message: PubSubMessage): void {
    const subs = this.listeners.get(channel);
    if (subs) {
      for (const handler of subs) {
        try {
          handler(message);
        } catch (err) {
          this.logger.error(`PubSub handler error on ${channel}`, err);
        }
      }
    }
  }

  subscribe(
    channel: string,
    handler: (message: PubSubMessage) => void,
  ): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(handler);
    return () => {
      this.listeners.get(channel)?.delete(handler);
    };
  }
}

@Injectable()
export class RedisPubSubService extends PubSubService {
  private readonly logger = new Logger(RedisPubSubService.name);

  // TODO: Install ioredis (`pnpm add ioredis --filter @derp/api`) and replace
  // stub methods below with real pub/sub using two ioredis clients (one for
  // publish, one for subscribe). The redisUrl is stored here for when that
  // wiring is completed.
  private readonly redisUrl: string;

  constructor(redisUrl: string) {
    super();
    this.redisUrl = redisUrl;
    this.logger.log(`RedisPubSubService initialized (url=${redisUrl}). Install ioredis to activate.`);
  }

  publish(channel: string, _message: PubSubMessage): void {
    this.logger.warn(`RedisPubSubService.publish called on channel=${channel} — ioredis not yet wired`);
  }

  subscribe(
    channel: string,
    _handler: (message: PubSubMessage) => void,
  ): () => void {
    this.logger.warn(`RedisPubSubService.subscribe called on channel=${channel} — ioredis not yet wired`);
    return () => {};
  }
}
