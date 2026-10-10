import { Module } from '@nestjs/common';
import { UiController } from './ui.controller';
import { UiService } from './ui.service';
import { TickModule } from '../tick/tick.module';
import { GameRulesModule } from '../game-rules/game-rules.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [TickModule, GameRulesModule, CurrencyModule],
  controllers: [UiController],
  providers: [UiService],
  exports: [UiService],
})
export class UiModule {}
