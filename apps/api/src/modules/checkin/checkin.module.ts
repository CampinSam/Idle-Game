import { Module } from '@nestjs/common';
import { CheckInService } from './checkin.service';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { GiftModule } from '../gift/gift.module';

@Module({
  imports: [TelemetryModule, GiftModule],
  providers: [CheckInService],
  exports: [CheckInService],
})
export class CheckInModule {}
