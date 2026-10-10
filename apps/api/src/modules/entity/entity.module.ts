import { Module } from '@nestjs/common';
import { EntityService } from './entity.service';
import { EntityController } from './entity.controller';
import { EffectModule } from '../effect/effect.module';
import { NotificationModule } from '../notification/notification.module';
import { LocationModule } from '../location/location.module';

@Module({
  imports: [EffectModule, NotificationModule, LocationModule],
  providers: [EntityService],
  controllers: [EntityController],
  exports: [EntityService],
})
export class EntityModule {}
