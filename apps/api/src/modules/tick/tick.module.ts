import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TickService } from './tick.service';
import { BoostService } from './boost.service';
import { TickController } from './tick.controller';
import { NotificationModule } from '../notification/notification.module';
import { GlobalPowerModule } from '../global-power/global-power.module';
import { TickEventProcessorService } from './tick-event-processor.service';

@Module({
  imports: [NotificationModule, GlobalPowerModule],
  providers: [TickService, BoostService, TickEventProcessorService],
  controllers: [TickController],
  exports: [TickService, TickEventProcessorService],
})
export class TickModule {}
