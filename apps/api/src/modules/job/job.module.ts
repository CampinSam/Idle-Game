import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { TickModule } from '../tick/tick.module';
import { NotificationModule } from '../notification/notification.module';
import { CurrencyModule } from '../currency/currency.module';
import { EntityModule } from '../entity/entity.module';

@Module({
  imports: [TickModule, NotificationModule, CurrencyModule, EntityModule],
  controllers: [JobController],
  providers: [JobService],
  exports: [JobService],
})
export class JobModule {}
