import { Module } from '@nestjs/common';
import { SynergyResolverService } from './synergy-resolver.service';
import { SynergyAdminController } from './synergy-admin.controller';

@Module({
  controllers: [SynergyAdminController],
  providers: [SynergyResolverService],
  exports: [SynergyResolverService],
})
export class SynergyModule {}
