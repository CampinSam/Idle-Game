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
import { MissionModule } from '../mission/mission.module';
import { CraftingModule } from '../crafting/crafting.module';
import { LocationModule } from '../location/location.module';
import { DustingModule } from '../dusting/dusting.module';
import { GameConstantsModule } from '../game-constants/game-constants.module';

@Module({
  imports: [
    TickModule,
    NotificationModule,
    CurrencyModule,
    EntityModule,
    SynergyModule,
    EffectModule,
    InventoryModule,
    MissionModule,
    CraftingModule,
    LocationModule,
    DustingModule,
    GameConstantsModule,
  ],
  controllers: [JobController],
  providers: [JobService, JobPreviewService],
  exports: [JobService],
})
export class JobModule {}
