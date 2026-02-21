import { Controller, Get } from '@nestjs/common';
import { MetaService } from './meta.service';

@Controller('meta')
export class MetaController {
  constructor(private metaService: MetaService) {}

  @Get('enums')
  getEnums() {
    return this.metaService.getEnums();
  }

  @Get('rules')
  getRules() {
    return this.metaService.getRules();
  }
}
