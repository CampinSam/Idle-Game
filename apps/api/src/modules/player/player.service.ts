import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { XP_PER_LEVEL } from '@derp/shared';

@Injectable()
export class PlayerService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('Player not found');

    const entityCount = await (this.prisma as any).entity.count({ where: { ownerUserId: userId } });
    const locationCount = await (this.prisma as any).locationInstance.count({ where: { ownerUserId: userId } });

    const activeMissionCount = await (this.prisma as any).job.count({
      where: { userId, type: 'MissionJob', status: 'active' },
    });

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      keeperLevel: user.keeperLevel,
      keeperXp: Number(user.keeperXp),
      xpToNextLevel: XP_PER_LEVEL(user.keeperLevel),
      prestigeTokens: user.prestigeTokens,
      entityCount,
      locationCount,
      flags: user.flags ?? {},
      activeMissions: activeMissionCount,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async addKeeperXp(userId: string, xp: number, tx?: any) {
    const db = tx || this.prisma;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Player not found');

    let newXp = Number(user.keeperXp) + xp;
    let newLevel = user.keeperLevel;

    while (newLevel < 100 && newXp >= XP_PER_LEVEL(newLevel)) {
      newXp -= XP_PER_LEVEL(newLevel);
      newLevel++;
    }

    await db.user.update({
      where: { id: userId },
      data: { keeperXp: BigInt(newXp), keeperLevel: newLevel },
    });

    return { keeperLevel: newLevel, keeperXp: newXp };
  }
}
