import { Module, forwardRef } from '@nestjs/common';
import { EventService } from './event.service';
import { GiftModule } from '../gift/gift.module';

@Module({
  imports: [forwardRef(() => GiftModule)],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule {}
