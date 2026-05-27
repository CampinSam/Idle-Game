import { Controller, Get, Post, Body, Request, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CryptoWalletService } from './crypto-wallet.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('crypto')
@UseGuards(AuthGuard('jwt'))
export class CryptoWalletController {
  constructor(
    private readonly cryptoWalletService: CryptoWalletService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('deposit-info')
  async getDepositInfo() {
    const config = await this.cryptoWalletService.getConfig();
    return {
      hotWalletAddress: config.hotWalletAddress || null,
      currencyId: 'crypto_derp',
      cntAssetId: `${config.cntPolicyId}${config.cntAssetName}`,
      note: 'Send DERP COIN to the deposit address from your linked Cardano wallet to receive in-game DERP.',
      // Withdrawal policy fields for player UI display
      minWithdrawalType: config.minWithdrawalType,
      minWithdrawalAmount: config.minWithdrawalAmount,
      withdrawalFee: config.withdrawalFee.toString(),
      autoApprovalThreshold: config.autoApprovalThreshold.toString(),
    };
  }

  @Post('withdraw')
  async requestWithdrawal(
    @Request() req: any,
    @Body() body: { amount: number; destinationAddress?: string },
  ) {
    const userId: string = req.user.id;
    let destinationAddress = body.destinationAddress?.trim();

    if (!destinationAddress) {
      const primaryWallet = await (this.prisma as any).linkedWallet.findFirst({
        where: { userId, chain: 'CARDANO', isPrimary: true },
      });
      if (!primaryWallet) {
        const anyWallet = await (this.prisma as any).linkedWallet.findFirst({
          where: { userId, chain: 'CARDANO' },
        });
        if (anyWallet) destinationAddress = anyWallet.address;
      } else {
        destinationAddress = primaryWallet.address;
      }
    }

    if (!destinationAddress) {
      throw new BadRequestException('destinationAddress is required (no linked Cardano wallet found)');
    }

    return this.cryptoWalletService.requestWithdrawal(userId, body.amount, destinationAddress);
  }

  @Get('withdrawals')
  getWithdrawals(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.cryptoWalletService.getPlayerWithdrawals(req.user.id, parseInt(limit || '20', 10));
  }

  @Get('deposits')
  getDeposits(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.cryptoWalletService.getPlayerDepositHistory(req.user.id, parseInt(limit || '20', 10));
  }
}
