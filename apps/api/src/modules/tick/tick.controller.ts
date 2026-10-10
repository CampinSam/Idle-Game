import { Controller, Get } from '@nestjs/common';
import { TickService } from './tick.service';

@Controller('tick')
export class TickController {
  constructor(
    private tickService: TickService,
  ) {}

  @Get('current')
  async getCurrentTick() {
    return this.tickService.getTickInfo();
  }
}
