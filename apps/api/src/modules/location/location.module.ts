import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationSettlementService } from './location-settlement.service';
import { LocationController } from './location.controller';
import { TickModule } from '../tick/tick.module';
import { CurrencyModule } from '../currency/currency.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationModule } from '../notification/notification.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { SynergyModule } from '../synergy/synergy.module';

@Module({
  imports: [TickModule, CurrencyModule, InventoryModule, NotificationModule, TelemetryModule, SynergyModule],
  providers: [LocationService, LocationSettlementService],
  controllers: [LocationController],
  exports: [LocationService, LocationSettlementService],
})
export class LocationModule {}
