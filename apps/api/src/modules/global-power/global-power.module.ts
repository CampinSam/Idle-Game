import { Module } from '@nestjs/common';
import { GlobalPowerService } from './global-power.service';
import { PowerDefService } from './power-def.service';
import { PowerGrantService } from './power-grant.service';
import { PowerChargeService } from './power-charge.service';

@Module({
  providers: [GlobalPowerService, PowerDefService, PowerGrantService, PowerChargeService],
  exports: [GlobalPowerService, PowerDefService, PowerGrantService, PowerChargeService],
})
export class GlobalPowerModule {}
