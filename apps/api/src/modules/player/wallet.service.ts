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
