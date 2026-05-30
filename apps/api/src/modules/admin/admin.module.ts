import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TickModule } from '../tick/tick.module';
import { NotificationModule } from '../notification/notification.module';
import { EventModule } from '../event/event.module';
import { GiftModule } from '../gift/gift.module';
import { LocationModule } from '../location/location.module';
import { NftModule } from '../nft/nft.module';
import { MissionModule } from '../mission/mission.module';
import { InventoryModule } from '../inventory/inventory.module';
import { HomeBannerModule } from '../home-banner/home-banner.module';
import { GlobalPowerModule } from '../global-power/global-power.module';
import { CraftingModule } from '../crafting/crafting.module';
import { CommandsModule } from '../commands/commands.module';
import { PlayerModule } from '../player/player.module';
import { AuthModule } from '../auth/auth.module';
import { ScreensModule } from '../screens/screens.module';
import { SelectionModule } from '../selection/selection.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { PaymentModule } from '../payment/payment.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminDraftService } from './admin-draft.service';
import { ScreensService } from '../screens/screens.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [
    PrismaModule,
    TickModule,
    NotificationModule,
    EventModule,
    GiftModule,
    LocationModule,
    NftModule,
    MissionModule,
    InventoryModule,
    HomeBannerModule,
    GlobalPowerModule,
    CraftingModule,
    CommandsModule,
    PlayerModule,
    AuthModule,
    ScreensModule,
    SelectionModule,
    TelemetryModule,
    PaymentModule,
  ],
  controllers: [AdminController, AdminAuthController],
  providers: [AdminService, AdminAuthService, AdminAuditService, AdminDraftService, ScreensService, AdminGuard],
  exports: [AdminGuard],
})
export class AdminModule {}
