import { Module } from '@nestjs/common';
import { CraftingService } from './crafting.service';
import { CraftingController } from './crafting.controller';
import { EntityModule } from '../entity/entity.module';
import { CurrencyModule } from '../currency/currency.module';
import { TickModule } from '../tick/tick.module';
import { NotificationModule } from '../notification/notification.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PlayerModule } from '../player/player.module';
import { EventModule } from '../event/event.module';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [EntityModule, CurrencyModule, TickModule, NotificationModule, InventoryModule, PlayerModule, EventModule, TelemetryModule],
  providers: [CraftingService],
  controllers: [CraftingController],
  exports: [CraftingService],
})
export class CraftingModule {}
