import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { PlayerModule } from './modules/player/player.module';
import { EntityModule } from './modules/entity/entity.module';
import { LocationModule } from './modules/location/location.module';
import { MissionModule } from './modules/mission/mission.module';
import { CraftingModule } from './modules/crafting/crafting.module';
import { EconomyModule } from './modules/economy/economy.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { TickModule } from './modules/tick/tick.module';
import { NotificationModule } from './modules/notification/notification.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AdminModule } from './modules/admin/admin.module';
import { GameRulesModule } from './modules/game-rules/game-rules.module';
import { JobModule } from './modules/job/job.module';
import { EventModule } from './modules/event/event.module';
import { GiftModule } from './modules/gift/gift.module';
import { UiModule } from './modules/ui/ui.module';
import { MetaModule } from './modules/meta/meta.module';
import { InfrastructureModule } from './modules/infrastructure/infrastructure.module';
import { CommandsModule } from './modules/commands/commands.module';
import { QueryModule } from './modules/query/query.module';
import { StreamModule } from './modules/stream/stream.module';
import { BootstrapService } from './bootstrap.service';
import { ObjectStorageModule } from './integrations/object-storage/object-storage.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { CheckInModule } from './modules/checkin/checkin.module';
import { QuestModule } from './modules/quest/quest.module';

const imports: any[] = [
  ConfigModule.forRoot({ isGlobal: true }),
  ThrottlerModule.forRoot([{
    name: 'commands',
    ttl: 60_000,   // 1 minute window
    limit: 120,    // max 120 commands per minute per user (~2/sec)
  }]),
  PrismaModule,
  GameRulesModule,
  InfrastructureModule,
  AuthModule,
  PlayerModule,
  EntityModule,
  LocationModule,
  MissionModule,
  CraftingModule,
  EconomyModule,
  CurrencyModule,
  TickModule,
  NotificationModule,
  InventoryModule,
  AdminModule,
  JobModule,
  EventModule,
  GiftModule,
  UiModule,
  MetaModule,
  CommandsModule,
  QueryModule,
  StreamModule,
  ObjectStorageModule,
  TelemetryModule,
  CheckInModule,
  QuestModule,
];

if (process.env.NODE_ENV === 'production') {
  imports.push(
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/(.*)', '/v1/(.*)', '/media/(.*)'],
    }),
  );
}

@Module({
  imports,
  controllers: [HealthController],
  providers: [BootstrapService],
})
export class AppModule {}
