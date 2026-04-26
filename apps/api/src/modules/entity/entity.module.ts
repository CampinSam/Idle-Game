import { Module } from '@nestjs/common';
import { EntityService } from './entity.service';
import { EntityController } from './entity.controller';
import { EffectModule } from '../effect/effect.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [EffectModule, NotificationModule],
  providers: [EntityService],
  controllers: [EntityController],
  exports: [EntityService],
})
export class EntityModule {}
