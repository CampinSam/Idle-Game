import { Injectable } from '@nestjs/common';
import { CurrencyService } from '../currency/currency.service';

@Injectable()
export class EconomyService {
  constructor(private currencyService: CurrencyService) {}

  async getBalance(userId: string): Promise<number> {
    return this.currencyService.getBalance(userId, 'soft_arcanium');
  }

  async spendArcanium(userId: string, amount: number, reason: string): Promise<number> {
    return this.currencyService.spend({
      userId,
      currencyId: 'soft_arcanium',
      amount,
      reason,
      sourceType: 'legacy',
    });
  }

  async earnArcanium(userId: string, amount: number, reason: string): Promise<number> {
    return this.currencyService.credit({
      userId,
      currencyId: 'soft_arcanium',
      amount,
      reason,
      sourceType: 'legacy',
    });
  }
}
