import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { AdaRateService } from './ada-rate.service';

@Controller('admin/crypto/rates')
@UseGuards(AdminGuard)
export class CryptoRatesAdminController {
  constructor(private readonly adaRateService: AdaRateService) {}

  @Get('ada/current')
  async getCurrentRate() {
    return this.adaRateService.getCurrentStatus();
  }
}
