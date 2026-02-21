import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { TickModule } from '../tick/tick.module';
import { NotificationModule } from '../notification/notification.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [TickModule, NotificationModule, CurrencyModule],
  controllers: [JobController],
})
export class JobModule {}
