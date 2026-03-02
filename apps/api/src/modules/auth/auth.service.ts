import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { EventService } from '../event/event.service';
import { LocationSettlementService } from '../location/location-settlement.service';
import { CheckInService } from '../checkin/checkin.service';
import { generateEntityData } from '../entity/entity-generator.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private tickService: TickService,
    private eventService: EventService,
    private settlementService: LocationSettlementService,
    private checkInService: CheckInService,
  ) {}

  async register(username: string, email: string, password: string) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      throw new ConflictException('Username or email already taken');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        authProvider: 'email',
      },
    });

    try {
      const entityData = await generateEntityData(this.prisma, user.id, 'derp_bird', 'Starter Entity');
      await (this.prisma as any).entity.create({ data: entityData });
    } catch (err) {
      this.logger.error(`Failed to create starter entity for ${user.id}: ${err}`);
    }

    try {
      const currentTick = await this.tickService.getCurrentTick();
      const locData = this.generateStarterLocation(user.id, currentTick);
      const loc = await (this.prisma as any).locationInstance.create({
        data: locData,
      });
      await this.settlementService.recalculateLocationMeta(loc.id);
    } catch (err) {
      this.logger.error(`Failed to create starter location for ${user.id}: ${err}`);
    }

    try {
      await this.eventService.dispatch('evt_welcome_gift', { giftDefId: 'gift_welcome_gems' }, {
        userId: user.id,
        sourceType: 'registration',
        sourceId: user.id,
        idempotencyKey: `welcome-gift-${user.id}`,
      });
    } catch (err) {
      this.logger.warn(`Failed to send welcome gift to ${user.id}: ${err}`);
    }

    const token = this.jwt.sign({ sub: user.id, username: user.username });

    return {
      accessToken: token,
      player: this.toPlayerResponse(user),
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses a different login method');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      await this.recalculateUserLocations(user.id);
    } catch (err) {
      this.logger.warn(`Failed to recalculate location meta on login for ${user.id}: ${err}`);
    }

    try {
      await this.checkInService.autoCheck(user.id);
    } catch (err) {
      this.logger.warn(`Failed to auto check-in for ${user.id}: ${err}`);
    }

    const token = this.jwt.sign({ sub: user.id, username: user.username });

    return {
      accessToken: token,
      player: this.toPlayerResponse(user),
    };
  }

  private async recalculateUserLocations(userId: string) {
    const locations = await (this.prisma as any).locationInstance.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    for (const loc of locations) {
      try {
        await this.settlementService.recalculateLocationMeta(loc.id);
      } catch (err) {
        this.logger.warn(`Failed to recalculate location ${loc.id}: ${err}`);
      }
    }
  }

  private generateStarterLocation(userId: string, currentTick: number) {
    return {
      ownerUserId: userId,
      definitionId: 'derp_outpost',
      kind: 'outpost_fungible',
      level: 1,
      lastCollectionTick: BigInt(Math.floor(currentTick)),
      storage: { capacity: {}, stored: {} },
      state: {},
    };
  }

  private toPlayerResponse(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      keeperLevel: user.keeperLevel,
      keeperXp: Number(user.keeperXp),
      prestigeTokens: user.prestigeTokens,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
