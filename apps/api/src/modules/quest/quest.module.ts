import { Module } from '@nestjs/common';
import { QuestService } from './quest.service';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { NotificationModule } from '../notification/notification.module';
import { CurrencyModule } from '../currency/currency.module';
import { InventoryModule } from '../inventory/inventory.module';
import { GameRulesModule } from '../game-rules/game-rules.module';
import { SelectionModule } from '../selection/selection.module';

@Module({
  imports: [TelemetryModule, NotificationModule, CurrencyModule, InventoryModule, GameRulesModule, SelectionModule],
  providers: [QuestService],
  exports: [QuestService],
})
export class QuestModule {}
