import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
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
import { NftModule } from './modules/nft/nft.module';
import { ShopModule } from './modules/shop/shop.module';
import { PaymentModule } from './modules/payment/payment.module';
import { EffectModule } from './modules/effect/effect.module';
import { AudioModule } from './modules/audio/audio.module';
import { ClientErrorsModule } from './modules/client-errors/client-errors.module';
import { SynergyModule } from './modules/synergy/synergy.module';
import { SelectionModule } from './modules/selection/selection.module';
import { ScreensModule } from './modules/screens/screens.module';
import { ContentDocumentModule } from './modules/content-document/content-document.module';

const isProductionLog = process.env.NODE_ENV === 'production';

const imports: any[] = [
  ConfigModule.forRoot({ isGlobal: true }),
  // Structured JSON logging in prod, pretty-printed in dev. Per-request
  // child logger carries the `req.id` so any log emitted while servicing
  // a request can be traced back to that request — critical for debugging
  // command-pipeline failures in production.
  LoggerModule.forRoot({
    pinoHttp: {
      level: process.env.LOG_LEVEL || (isProductionLog ? 'info' : 'debug'),
      genReqId: (req) =>
        (req.headers['x-request-id'] as string | undefined) || randomUUID(),
      customLogLevel: (_req, res, err) => {
        const status = res.statusCode;
        if (err || status >= 500) return 'error';
        if (status >= 400) return 'warn';
        return 'info';
      },
      // Never log credentials, even by accident. The redact paths cover
      // both Express request shape and arbitrary nested payloads we might
      // log directly via `logger.info({ user, ... })`.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-admin-key"]',
          '*.password',
          '*.token',
          '*.accessToken',
          '*.refreshToken',
          '*.JWT_SECRET',
          '*.ADMIN_SECRET',
        ],
        censor: '[REDACTED]',
      },
      transport: isProductionLog
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: false,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,req,res,responseTime',
            },
          },
    },
  }),
  ThrottlerModule.forRoot([
    {
      name: 'commands',
      ttl: 60_000,   // 1 minute window
      limit: 120,    // max 120 commands per minute per user (~2/sec)
    },
    {
      // Per-IP throttle on the auth surface (login, register, wallet verify).
      // 10/min is well above legitimate use (a human logs in at most a
      // handful of times per minute) and well below what's useful for
      // brute-forcing a password or hammering wallet-nonce generation.
      name: 'auth',
      ttl: 60_000,
      limit: 10,
    },
    {
      // Cap on `/v1/client-errors` so a misbehaving client (or attacker
      // probing the endpoint) can't fill our log stream. 60/min/IP is
      // generous for a real session — the client also caps at 25 per
      // session in `clientErrorReporter.ts`.
      name: 'clientErrors',
      ttl: 60_000,
      limit: 60,
    },
    {
      // Synergy-preview runs full resolver evaluation (DB + matching logic)
      // on every debounced team change. 30/min is well above normal gameplay
      // (a player picks a team at most a few times per minute) while
      // preventing a malicious client from hammering the DB.
      name: 'synergyPreview',
      ttl: 60_000,
      limit: 30,
    },
  ]),
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
  NftModule,
  ShopModule,
  PaymentModule,
  EffectModule,
  AudioModule,
  ClientErrorsModule,
  SynergyModule,
  SelectionModule,
  ScreensModule,
  ContentDocumentModule,
];

if (process.env.NODE_ENV === 'production') {
  imports.push(
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/(.*)', '/v1/(.*)', '/media/(.*)'],
      serveStaticOptions: {
        // The service worker and web manifest must never be cached by the
        // browser; otherwise a stale SW pins the site to an old build.
        // Hashed JS/CSS bundles still get the express.static defaults.
        setHeaders: (res, filePath) => {
          const base = filePath.split(/[\\/]/).pop() ?? '';
          if (
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.webmanifest'
          ) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          }
        },
      },
    }),
  );
}

@Module({
  imports,
  controllers: [HealthController],
  providers: [BootstrapService],
})
export class AppModule {}
