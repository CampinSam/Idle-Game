import { Module } from '@nestjs/common';
import { MissionService } from './mission.service';
import { MissionController } from './mission.controller';
import { EntityModule } from '../entity/entity.module';
import { CurrencyModule } from '../currency/currency.module';
import { PlayerModule } from '../player/player.module';
import { TickModule } from '../tick/tick.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationModule } from '../notification/notification.module';
import { EventModule } from '../event/event.module';
@Module({
  imports: [EntityModule, CurrencyModule, PlayerModule, TickModule, InventoryModule, NotificationModule, EventModule],
  providers: [MissionService],
  controllers: [MissionController],
  exports: [MissionService],
})
export class MissionModule {}
