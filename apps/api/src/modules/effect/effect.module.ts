import { Module, Global, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EffectService } from './effect.service';
import { EffectController } from './effect.controller';
import { TickModule } from '../tick/tick.module';

@Global()
@Module({
  imports: [TickModule],
  controllers: [EffectController],
  providers: [EffectService],
  exports: [EffectService],
})
export class EffectModule implements OnModuleInit, OnModuleDestroy {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly CLEANUP_INTERVAL_MS = 60_000;

  constructor(private effectService: EffectService) {}

  onModuleInit() {
    this.cleanupInterval = setInterval(
      () => this.effectService.cleanupExpired().catch(() => {}),
      EffectModule.CLEANUP_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
