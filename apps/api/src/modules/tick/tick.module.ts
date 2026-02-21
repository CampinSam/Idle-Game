import { Module } from '@nestjs/common';
import { TickService } from './tick.service';
import { BoostService } from './boost.service';
import { TickController } from './tick.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  providers: [TickService, BoostService],
  controllers: [TickController],
  exports: [TickService, BoostService],
})
export class TickModule {}
