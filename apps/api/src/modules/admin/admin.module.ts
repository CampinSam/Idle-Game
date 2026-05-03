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
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PrismaModule, TickModule, NotificationModule, EventModule, GiftModule, LocationModule, NftModule, MissionModule, InventoryModule, HomeBannerModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
