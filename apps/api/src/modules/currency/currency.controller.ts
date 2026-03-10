import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrencyService } from './currency.service';

@Controller('currencies')
@UseGuards(AuthGuard('jwt'))
export class CurrencyController {
  constructor(private currencyService: CurrencyService) {}

  @Get()
  async listCurrencies() {
    const currencies = await this.currencyService.listCurrencies();
    return currencies.map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      iconKey: c.iconKey,
      type: c.type,
      seasonId: c.seasonId,
      isTradeable: c.isTradeable,
      isSpendable: c.isSpendable,
      decimals: c.decimals,
    }));
  }

  @Get('balances')
  async getBalances(@Req() req: any) {
    return this.currencyService.getBalances(req.user.id);
  }

  @Get(':id/ledger')
  async getLedger(
    @Req() req: any,
    @Param('id') currencyId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.currencyService.getLedger(
      req.user.id,
      currencyId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
