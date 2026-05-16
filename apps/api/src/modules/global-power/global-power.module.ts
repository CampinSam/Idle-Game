import { Module } from '@nestjs/common';
import { GlobalPowerService } from './global-power.service';

@Module({
  providers: [GlobalPowerService],
  exports: [GlobalPowerService],
})
export class GlobalPowerModule {}
