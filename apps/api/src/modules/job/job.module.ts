import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { JobPreviewService } from './job-preview.service';
import { TickModule } from '../tick/tick.module';
import { NotificationModule } from '../notification/notification.module';
import { CurrencyModule } from '../currency/currency.module';
import { EntityModule } from '../entity/entity.module';
import { SynergyModule } from '../synergy/synergy.module';
import { EffectModule } from '../effect/effect.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TickModule,
    NotificationModule,
    CurrencyModule,
    EntityModule,
    SynergyModule,
    EffectModule,
    InventoryModule,
  ],
  controllers: [JobController],
  providers: [JobService, JobPreviewService],
  exports: [JobService],
})
export class JobModule {}
