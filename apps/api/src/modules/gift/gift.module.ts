import { Module, forwardRef } from '@nestjs/common';
import { GiftService } from './gift.service';
import { GiftController } from './gift.controller';
import { EventModule } from '../event/event.module';
import { NotificationModule } from '../notification/notification.module';
import { CurrencyModule } from '../currency/currency.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [
    forwardRef(() => EventModule),
    NotificationModule,
    CurrencyModule,
    InventoryModule,
    TelemetryModule,
  ],
  providers: [GiftService],
  controllers: [GiftController],
  exports: [GiftService],
})
export class GiftModule {}
