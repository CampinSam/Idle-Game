import { Module } from '@nestjs/common';
import { GlobalPowerService } from './global-power.service';
import { PowerDefService } from './power-def.service';

@Module({
  providers: [GlobalPowerService, PowerDefService],
  exports: [GlobalPowerService, PowerDefService],
})
export class GlobalPowerModule {}
