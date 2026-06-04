import { Module } from '@nestjs/common';
import { DustingService } from './dusting.service';
import { TickModule } from '../tick/tick.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CurrencyModule } from '../currency/currency.module';
import { GameRulesModule } from '../game-rules/game-rules.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [TickModule, InventoryModule, CurrencyModule, GameRulesModule, EventModule],
  providers: [DustingService],
  exports: [DustingService],
})
export class DustingModule {}
