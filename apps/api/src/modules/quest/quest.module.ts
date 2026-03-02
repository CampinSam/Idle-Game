import { Module } from '@nestjs/common';
import { QuestService } from './quest.service';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { NotificationModule } from '../notification/notification.module';
import { CurrencyModule } from '../currency/currency.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [TelemetryModule, NotificationModule, CurrencyModule, InventoryModule],
  providers: [QuestService],
  exports: [QuestService],
})
export class QuestModule {}
