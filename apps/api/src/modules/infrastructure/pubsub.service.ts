import { Injectable, Logger } from '@nestjs/common';

export interface PubSubMessage {
  userId: string;
  deltaId: string;
}

export type BroadcastMessage =
  | {
      // Authoritative tick anchor broadcast every ~30 s and on rate changes.
      // Carries enough data for the client to re-anchor its interpolation clock.
      type: 'tick.sync';
      currentTick: number;
      tickRate: number;
      serverTime: string;
      boosts: Array<{ id: string; name: string; multiplier: number; endTime: string }>;
    }
  | {
      // Whole-list replacement of the active home banner set. Emitted by the
      // admin service after a HomeBannerDef create/update/delete so every
      // connected client refreshes its carousel without a re-bootstrap.
      type: 'home_banners.updated';
      banners: any[];
    }
  | {
      // Broadcast when a global active power is created, cancelled, or expires.
      // `active` is the current list of all active powers after the change.
      // `changes` lists each power that started or ended in this event.
      type: 'global_power.changed';
      active: Array<{
        id: string;
        label: string;
        powerType: string;
        value: number;
        valueMode: string;
        durationMinutes: number;
        startTime: string;
        endTime: string;
        status: string;
        triggeredByUserId?: string;
      }>;
      changes: Array<{
        event: 'started' | 'ended';
        id: string;
        powerType: string;
        label: string;
        durationMinutes: number;
      }>;
    };

export abstract class PubSubService {
  abstract publish(channel: string, message: PubSubMessage): void;
  abstract subscribe(
    channel: string,
    handler: (message: PubSubMessage) => void,
  ): () => void;
  abstract publishBroadcast(message: BroadcastMessage): void;
  abstract subscribeBroadcast(handler: (message: BroadcastMessage) => void): () => void;
}

@Injectable()
export class InMemoryPubSubService extends PubSubService {
  private readonly logger = new Logger(InMemoryPubSubService.name);
  private listeners = new Map<string, Set<(msg: PubSubMessage) => void>>();
  private broadcastListeners = new Set<(msg: BroadcastMessage) => void>();

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

  publishBroadcast(message: BroadcastMessage): void {
    for (const handler of this.broadcastListeners) {
      try {
        handler(message);
      } catch (err) {
        this.logger.error(`Broadcast handler error`, err);
      }
    }
  }

  subscribeBroadcast(handler: (message: BroadcastMessage) => void): () => void {
    this.broadcastListeners.add(handler);
    return () => {
      this.broadcastListeners.delete(handler);
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

  publishBroadcast(_message: BroadcastMessage): void {
    this.logger.warn(`RedisPubSubService.publishBroadcast called — ioredis not yet wired`);
  }

  subscribeBroadcast(_handler: (message: BroadcastMessage) => void): () => void {
    this.logger.warn(`RedisPubSubService.subscribeBroadcast called — ioredis not yet wired`);
    return () => {};
  }
}
