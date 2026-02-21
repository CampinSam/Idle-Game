import { Module, Global } from '@nestjs/common';
import { PubSubService, InMemoryPubSubService } from './pubsub.service';
import { PlayerLockService } from './player-lock.service';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  providers: [
    {
      provide: PubSubService,
      useClass: InMemoryPubSubService,
    },
    PlayerLockService,
    IdempotencyService,
  ],
  exports: [PubSubService, PlayerLockService, IdempotencyService],
})
export class InfrastructureModule {}
