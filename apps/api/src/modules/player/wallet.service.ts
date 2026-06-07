import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NftCollectionService } from '../nft/nft-collection.service';
import { normalizeCardanoAddress, isCardanoHexAddress } from '../auth/cardano.utils';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private nftCollectionService: NftCollectionService,
  ) {}

  async listWallets(userId: string) {
    return (this.prisma as any).linkedWallet.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async removeWallet(userId: string, walletId: string) {
    const wallet = await (this.prisma as any).linkedWallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const totalWallets = await (this.prisma as any).linkedWallet.count({ where: { userId } });

    if (totalWallets <= 1 && !user?.passwordHash) {
      throw new BadRequestException(
        'Cannot remove your only linked wallet without a password set on your account',
      );
    }

    await (this.prisma as any).linkedWallet.delete({ where: { id: walletId } });

    if (wallet.isPrimary && totalWallets > 1) {
      const next = await (this.prisma as any).linkedWallet.findFirst({
        where: { userId, id: { not: walletId } },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await (this.prisma as any).linkedWallet.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { success: true };
  }

  async addManualWallet(userId: string, chain: string, address: string) {
    if (!chain || typeof chain !== 'string') {
      throw new BadRequestException('Chain is required');
    }
    if (!address || typeof address !== 'string' || !address.trim()) {
      throw new BadRequestException('Address is required');
    }

    const trimmed = address.trim();
    const normalizedAddress = chain === 'CARDANO' ? normalizeCardanoAddress(trimmed) : trimmed.toLowerCase();

    const existing = await (this.prisma as any).linkedWallet.findUnique({
      where: { chain_address: { chain, address: normalizedAddress } },
    });
    if (existing && existing.userId !== userId) {
      throw new BadRequestException('This wallet is already linked to a different account');
    }

    const isFirst =
      (await (this.prisma as any).linkedWallet.count({ where: { userId } })) === 0;

    await (this.prisma as any).linkedWallet.upsert({
      where: { chain_address: { chain, address: normalizedAddress } },
      update: { userId },
      create: { userId, chain, address: normalizedAddress, isPrimary: isFirst },
    });

    let sync: { claimed: number; alreadyClaimed: number; notImported: number; unclaimed: number } | null = null;
    try {
      const result = await this.nftCollectionService.syncUserCollections(userId);
      sync = {
        claimed: result.claimed,
        alreadyClaimed: result.alreadyClaimed,
        notImported: result.notImported,
        unclaimed: result.unclaimed,
      };
    } catch (err) {
      this.logger.error(
        `Linked wallet ${chain}:${normalizedAddress} for user ${userId} but NFT sync failed: ${err}`,
      );
    }

    return { linked: true, sync };
  }

  async adminRemoveWallet(userId: string, walletId: string) {
    const wallet = await (this.prisma as any).linkedWallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    await (this.prisma as any).linkedWallet.delete({ where: { id: walletId } });

    if (wallet.isPrimary) {
      const next = await (this.prisma as any).linkedWallet.findFirst({
        where: { userId, id: { not: walletId } },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await (this.prisma as any).linkedWallet.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { success: true };
  }

  async normalizeWalletAddress(userId: string, walletId: string) {
    const wallet = await (this.prisma as any).linkedWallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.chain !== 'CARDANO') {
      throw new BadRequestException('Address normalization is only applicable to CARDANO wallets');
    }
    if (!isCardanoHexAddress(wallet.chain, wallet.address)) {
      return { success: true, changed: false, address: wallet.address };
    }

    const normalized = normalizeCardanoAddress(wallet.address);

    const conflict = await (this.prisma as any).linkedWallet.findUnique({
      where: { chain_address: { chain: wallet.chain, address: normalized } },
    });
    if (conflict && conflict.id !== walletId) {
      throw new BadRequestException(
        'A wallet with the converted bech32 address already exists for this account',
      );
    }

    await (this.prisma as any).linkedWallet.update({
      where: { id: walletId },
      data: { address: normalized },
    });

    return { success: true, changed: true, address: normalized };
  }

  async setPrimary(userId: string, walletId: string) {
    const wallet = await (this.prisma as any).linkedWallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    await (this.prisma as any).linkedWallet.updateMany({
      where: { userId },
      data: { isPrimary: false },
    });
    await (this.prisma as any).linkedWallet.update({
      where: { id: walletId },
      data: { isPrimary: true },
    });

    return { success: true };
  }
}
