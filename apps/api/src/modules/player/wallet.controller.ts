import { Controller, Get, Delete, Post, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WalletService } from './wallet.service';

@Controller('player/wallets')
@UseGuards(AuthGuard('jwt'))
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  listWallets(@Request() req: any) {
    return this.walletService.listWallets(req.user.id);
  }

  @Delete(':id')
  removeWallet(@Request() req: any, @Param('id') id: string) {
    return this.walletService.removeWallet(req.user.id, id);
  }

  @Post(':id/primary')
  setPrimary(@Request() req: any, @Param('id') id: string) {
    return this.walletService.setPrimary(req.user.id, id);
  }
}
