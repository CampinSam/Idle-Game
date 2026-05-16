import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TickService } from './tick.service';
import { BoostService } from './boost.service';
import { TickController } from './tick.controller';
import { NotificationModule } from '../notification/notification.module';
import { TickEventProcessorService } from './tick-event-processor.service';

@Module({
  imports: [NotificationModule],
  providers: [TickService, BoostService, TickEventProcessorService],
  controllers: [TickController],
  exports: [TickService, BoostService, TickEventProcessorService],
})
export class TickModule {}
