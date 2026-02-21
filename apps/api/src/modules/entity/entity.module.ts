import { Module } from '@nestjs/common';
import { EntityService } from './entity.service';
import { EntityController } from './entity.controller';

@Module({
  providers: [EntityService],
  controllers: [EntityController],
  exports: [EntityService],
})
export class EntityModule {}
