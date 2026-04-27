import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

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
    const normalizedAddress = chain === 'CARDANO' ? trimmed : trimmed.toLowerCase();

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

    return { linked: true };
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
