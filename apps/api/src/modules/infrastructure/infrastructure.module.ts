import { Module, Global } from '@nestjs/common';
import { PubSubService, InMemoryPubSubService, RedisPubSubService } from './pubsub.service';
import { PlayerLockService } from './player-lock.service';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  providers: [
    {
      provide: PubSubService,
      useFactory: () => {
        if (process.env.REDIS_URL) {
          return new RedisPubSubService(process.env.REDIS_URL);
        }
        return new InMemoryPubSubService();
      },
    },
    PlayerLockService,
    IdempotencyService,
  ],
  exports: [PubSubService, PlayerLockService, IdempotencyService],
})
export class InfrastructureModule {}
