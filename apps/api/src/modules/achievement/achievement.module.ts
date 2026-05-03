import { Module } from '@nestjs/common';
import { AchievementService } from './achievement.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { CurrencyModule } from '../currency/currency.module';
import { InventoryModule } from '../inventory/inventory.module';
import { GameRulesModule } from '../game-rules/game-rules.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    TelemetryModule,
    CurrencyModule,
    InventoryModule,
    GameRulesModule,
    NotificationModule,
  ],
  providers: [AchievementService],
  exports: [AchievementService],
})
export class AchievementModule {}
