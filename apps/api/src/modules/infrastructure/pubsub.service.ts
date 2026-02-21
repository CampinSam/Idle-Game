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

  publish(channel: string, message: PubSubMessage): void {
    this.logger.warn('RedisPubSubService.publish is a stub');
  }

  subscribe(
    channel: string,
    handler: (message: PubSubMessage) => void,
  ): () => void {
    this.logger.warn('RedisPubSubService.subscribe is a stub');
    return () => {};
  }
}
