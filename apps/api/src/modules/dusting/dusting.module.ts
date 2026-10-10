import { Module } from '@nestjs/common';
import { DustingService } from './dusting.service';
import { TickModule } from '../tick/tick.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CurrencyModule } from '../currency/currency.module';
import { GameRulesModule } from '../game-rules/game-rules.module';
import { EventModule } from '../event/event.module';
import { NotificationModule } from '../notification/notification.module';
import { EffectModule } from '../effect/effect.module';

@Module({
  imports: [TickModule, InventoryModule, CurrencyModule, GameRulesModule, EventModule, NotificationModule, EffectModule],
  providers: [DustingService],
  exports: [DustingService],
})
export class DustingModule {}
