import { Module } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [CurrencyModule],
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}
