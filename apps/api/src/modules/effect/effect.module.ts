import { Module, Global } from '@nestjs/common';
import { EffectService } from './effect.service';

@Global()
@Module({
  providers: [EffectService],
  exports: [EffectService],
})
export class EffectModule {}
