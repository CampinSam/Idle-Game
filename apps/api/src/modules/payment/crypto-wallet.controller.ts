import { Controller, Get, Post, Body, Request, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CryptoWalletService } from './crypto-wallet.service';
import { PrismaService } from '../../prisma/prisma.service';

const CNT_POLICY_ID_DEFAULT = 'd9d59e71eb99e653a493956a6826a406060706bd8c9a2427b3564f6';
const CNT_ASSET_NAME_DEFAULT = '45525020434f494e';

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
    const policyId = config.cntPolicyId || CNT_POLICY_ID_DEFAULT;
    const assetName = config.cntAssetName || CNT_ASSET_NAME_DEFAULT;
    return {
      hotWalletAddress: config.hotWalletAddress || null,
      currencyId: 'crypto_derp',
      cntAssetId: `${policyId}${assetName}`,
      note: 'Send DERP COIN to the deposit address from your linked Cardano wallet to receive in-game DERP.',
      minWithdrawalType: config.minWithdrawalType,
      minWithdrawalAmount: config.minWithdrawalAmount,
      withdrawalFee: config.withdrawalFee.toString(),
      autoApprovalThreshold: config.autoApprovalThreshold.toString(),
      cntCurrencies: [
        {
          id: 'crypto_derp',
          label: 'DERP COIN',
          policyId,
          assetName,
        },
      ],
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

  @Post('build-deposit-tx')
  async buildDepositTx(
    @Request() req: any,
    @Body() body: { amount: number; utxosCborHex: string[]; policyId?: string; assetName?: string },
  ) {
    if (!body.amount || body.amount <= 0) throw new BadRequestException('amount must be a positive integer');
    if (!Array.isArray(body.utxosCborHex) || body.utxosCborHex.length === 0) {
      throw new BadRequestException('utxosCborHex must be a non-empty array of CBOR hex strings');
    }
    const tokenOverride = (body.policyId && body.assetName)
      ? { policyId: body.policyId.trim(), assetName: body.assetName.trim() }
      : undefined;
    return this.cryptoWalletService.buildDepositTx(
      req.user.id,
      BigInt(Math.floor(body.amount)),
      body.utxosCborHex,
      tokenOverride,
    );
  }

  @Post('submit-deposit-tx')
  async submitDepositTx(
    @Request() req: any,
    @Body() body: { signedTxCborHex: string },
  ) {
    if (!body.signedTxCborHex?.trim()) throw new BadRequestException('signedTxCborHex is required');
    return this.cryptoWalletService.submitDepositTx(body.signedTxCborHex.trim());
  }

  @Post('decode-address')
  async decodeAddress(
    @Body() body: { hexAddress: string },
  ) {
    if (!body.hexAddress?.trim()) throw new BadRequestException('hexAddress is required');
    return this.cryptoWalletService.decodeCardanoAddressHex(body.hexAddress.trim());
  }

  @Post('build-purchase-tx')
  async buildPurchaseTx(
    @Request() req: any,
    @Body() body: { purchaseId: string; utxosCborHex: string[] },
  ) {
    if (!body.purchaseId?.trim()) throw new BadRequestException('purchaseId is required');
    if (!Array.isArray(body.utxosCborHex) || body.utxosCborHex.length === 0) {
      throw new BadRequestException('utxosCborHex must be a non-empty array of CBOR hex strings');
    }
    return this.cryptoWalletService.buildPurchaseTx(req.user.id, body.purchaseId.trim(), body.utxosCborHex);
  }

  @Post('submit-purchase-tx')
  async submitPurchaseTx(
    @Request() req: any,
    @Body() body: { purchaseId: string; signedTxCborHex: string },
  ) {
    if (!body.purchaseId?.trim()) throw new BadRequestException('purchaseId is required');
    if (!body.signedTxCborHex?.trim()) throw new BadRequestException('signedTxCborHex is required');
    return this.cryptoWalletService.submitPurchaseTx(
      req.user.id,
      body.purchaseId.trim(),
      body.signedTxCborHex.trim(),
    );
  }
}
