import { Module, Global } from '@nestjs/common';
import { EffectService } from './effect.service';
import { TickModule } from '../tick/tick.module';

@Global()
@Module({
  imports: [TickModule],
  providers: [EffectService],
  exports: [EffectService],
})
export class EffectModule {}
