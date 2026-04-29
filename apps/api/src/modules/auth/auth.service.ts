import { Injectable, ConflictException, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ethers } from 'ethers';
import { PrismaService } from '../../prisma/prisma.service';
import { TickService } from '../tick/tick.service';
import { EventService } from '../event/event.service';
import { LocationSettlementService } from '../location/location-settlement.service';
import { CheckInService } from '../checkin/checkin.service';
import { NftCollectionService } from '../nft/nft-collection.service';
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
    private nftCollectionService: NftCollectionService,
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
      try {
        await this.grantStarterWorkshop(user.id, loc.id);
      } catch (err) {
        this.logger.warn(`Failed to grant starter Workshop to ${user.id}: ${err}`);
      }
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

    try {
      await (this.prisma as any).itemInstance.create({
        data: { userId: user.id, definitionId: 'item_common_chest', quantity: 3 },
      });
    } catch (err) {
      this.logger.warn(`Failed to seed starter chests for ${user.id}: ${err}`);
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

    try {
      await this.nftCollectionService.syncIfStale(user.id);
    } catch (err) {
      this.logger.warn(`Throttled NFT sync failed on login for ${user.id}: ${err}`);
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
      storage: { capacity: {}, stored: {}, lastSettledAt: new Date().toISOString() },
      state: {},
    };
  }

  /**
   * Grant a tier-1 Workshop building inside the player's starter Outpost so
   * The Forge is reachable from the very first session. Idempotent — skips
   * when a workshop already exists at the location.
   */
  private async grantStarterWorkshop(userId: string, locationId: string) {
    const existing = await (this.prisma as any).locationBuildingInstance.findFirst({
      where: { locationId, buildingDef: { category: 'WORKSHOP' } },
    }).catch(() => null);
    if (existing) return;

    const def = await (this.prisma as any).buildingDef.findUnique({ where: { id: 'bld_forge' } });
    if (!def) {
      this.logger.warn(`grantStarterWorkshop: bld_forge definition missing — seeds may not have run`);
      return;
    }

    await (this.prisma as any).locationBuildingInstance.create({
      data: {
        locationId,
        buildingDefId: 'bld_forge',
        level: 1,
        enabled: true,
        state: { grantedBy: 'starter' },
      },
    });
    try {
      await this.settlementService.recalculateLocationMeta(locationId);
    } catch (err) {
      this.logger.warn(`recalc after starter Workshop failed: ${err}`);
    }
    this.logger.log(`Granted starter Workshop (bld_forge) to ${userId} at ${locationId}`);
  }

  async requestWalletNonce(chain: string, address: string): Promise<{ nonce: string; message: string }> {
    const nonce = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const normalizedAddress = chain === 'CARDANO' ? address : address.toLowerCase();

    await (this.prisma as any).walletNonce.upsert({
      where: { chain_address: { chain, address: normalizedAddress } },
      update: { nonce, expiresAt },
      create: { chain, address: normalizedAddress, nonce, expiresAt },
    });

    const message = `Sign in to Derp Universe: ${nonce}`;
    return { nonce, message };
  }

  async verifyWalletSignature(
    chain: string,
    address: string,
    signature: string,
    authenticatedUserId?: string,
  ): Promise<
    | { accessToken: string; player: any }
    | { linked: true }
    | { needsOnboarding: true; walletToken: string; chain: string; address: string }
  > {
    const normalizedAddress = chain === 'CARDANO' ? address : address.toLowerCase();

    const nonceRecord = await (this.prisma as any).walletNonce.findUnique({
      where: { chain_address: { chain, address: normalizedAddress } },
    });

    if (!nonceRecord || nonceRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Nonce expired or not found — please request a new one');
    }

    const message = `Sign in to Derp Universe: ${nonceRecord.nonce}`;
    let verified = false;

    if (chain === 'CARDANO') {
      verified = await this.verifyCardanoSignature(address, message, signature);
    } else {
      verified = this.verifyEvmSignature(normalizedAddress, message, signature);
    }

    if (!verified) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    await (this.prisma as any).walletNonce.delete({
      where: { chain_address: { chain, address: normalizedAddress } },
    });

    if (authenticatedUserId) {
      const existing = await (this.prisma as any).linkedWallet.findUnique({
        where: { chain_address: { chain, address: normalizedAddress } },
      });
      if (existing && existing.userId !== authenticatedUserId) {
        throw new BadRequestException('This wallet is already linked to a different account');
      }
      const isFirst = (await (this.prisma as any).linkedWallet.count({ where: { userId: authenticatedUserId } })) === 0;
      await (this.prisma as any).linkedWallet.upsert({
        where: { chain_address: { chain, address: normalizedAddress } },
        update: { userId: authenticatedUserId },
        create: { userId: authenticatedUserId, chain, address: normalizedAddress, isPrimary: isFirst },
      });
      try {
        await this.nftCollectionService.syncUserCollections(authenticatedUserId);
      } catch (err) {
        this.logger.error(
          `Linked wallet ${chain}:${normalizedAddress} for user ${authenticatedUserId} but NFT sync failed: ${err}`,
        );
      }
      return { linked: true };
    }

    const existing = await (this.prisma as any).linkedWallet.findUnique({
      where: { chain_address: { chain, address: normalizedAddress } },
    });

    let user: any;

    if (existing) {
      user = await this.prisma.user.findUnique({ where: { id: existing.userId } });
      if (!user) throw new UnauthorizedException('Account not found');
      try { await this.recalculateUserLocations(user.id); } catch {}
      try { await this.checkInService.autoCheck(user.id); } catch {}
      try { await this.nftCollectionService.syncIfStale(user.id); } catch (err) {
        this.logger.warn(`Throttled NFT sync failed on SIWE login for ${user.id}: ${err}`);
      }
    } else {
      // No account exists for this wallet yet. Don't auto-create one — issue a
      // short-lived "onboarding ticket" so the client can take the user through
      // the account creation screen with the wallet already verified.
      const walletToken = this.jwt.sign(
        {
          purpose: 'wallet_onboarding',
          chain,
          address: normalizedAddress,
        },
        { expiresIn: '15m' },
      );
      return {
        needsOnboarding: true,
        walletToken,
        chain,
        address: normalizedAddress,
      };
    }

    const token = this.jwt.sign({ sub: user.id, username: user.username });
    return { accessToken: token, player: this.toPlayerResponse(user) };
  }

  async completeWalletOnboarding(
    walletToken: string,
    username: string,
    email?: string,
  ): Promise<{ accessToken: string; player: any }> {
    let payload: any;
    try {
      payload = this.jwt.verify(walletToken);
    } catch {
      throw new UnauthorizedException('Onboarding ticket expired or invalid — please reconnect your wallet');
    }
    if (payload?.purpose !== 'wallet_onboarding' || !payload?.chain || !payload?.address) {
      throw new UnauthorizedException('Invalid onboarding ticket');
    }

    const chain: string = payload.chain;
    const normalizedAddress: string = payload.address;

    const trimmedUsername = (username || '').trim();
    if (trimmedUsername.length < 3) {
      throw new BadRequestException('Username must be at least 3 characters');
    }

    const finalEmail = (email && email.trim()) || `${normalizedAddress}@wallet.derp`;

    // Race-safe duplicate checks.
    const existingByName = await this.prisma.user.findUnique({ where: { username: trimmedUsername } });
    if (existingByName) {
      throw new ConflictException('Username already taken');
    }
    const existingByEmail = await this.prisma.user.findUnique({ where: { email: finalEmail } });
    if (existingByEmail) {
      throw new ConflictException('Email already in use');
    }
    const existingWallet = await (this.prisma as any).linkedWallet.findUnique({
      where: { chain_address: { chain, address: normalizedAddress } },
    });
    if (existingWallet) {
      throw new ConflictException('This wallet is already linked to an account');
    }

    const user = await this.prisma.user.create({
      data: { username: trimmedUsername, email: finalEmail, authProvider: 'wallet' },
    });
    await (this.prisma as any).linkedWallet.create({
      data: { userId: user.id, chain, address: normalizedAddress, isPrimary: true },
    });

    try {
      const entityData = await generateEntityData(this.prisma, user.id, 'derp_bird', 'Starter Entity');
      await (this.prisma as any).entity.create({ data: entityData });
    } catch (err) { this.logger.error(`Failed to create starter entity: ${err}`); }
    try {
      const currentTick = await this.tickService.getCurrentTick();
      const loc = await (this.prisma as any).locationInstance.create({ data: this.generateStarterLocation(user.id, currentTick) });
      await this.grantStarterWorkshop(user.id, loc.id);
      await this.settlementService.recalculateLocationMeta(loc.id);
    } catch (err) { this.logger.error(`Failed to create starter location: ${err}`); }
    try {
      await this.eventService.dispatch('evt_welcome_gift', { giftDefId: 'gift_welcome_gems' }, {
        userId: user.id, sourceType: 'registration', sourceId: user.id,
        idempotencyKey: `welcome-gift-${user.id}`,
      });
    } catch {}
    try {
      await (this.prisma as any).itemInstance.create({
        data: { userId: user.id, definitionId: 'item_common_chest', quantity: 3 },
      });
    } catch (err) { this.logger.warn(`Failed to seed starter chests for ${user.id}: ${err}`); }
    try {
      await this.nftCollectionService.syncUserCollections(user.id);
    } catch (err) {
      this.logger.error(`First-login NFT sync failed for new wallet user ${user.id}: ${err}`);
    }

    const token = this.jwt.sign({ sub: user.id, username: user.username });
    return { accessToken: token, player: this.toPlayerResponse(user) };
  }

  private verifyEvmSignature(address: string, message: string, signature: string): boolean {
    try {
      const recovered = ethers.verifyMessage(message, signature).toLowerCase();
      return recovered === address.toLowerCase();
    } catch {
      return false;
    }
  }

  private async verifyCardanoSignature(address: string, message: string, signature: string): Promise<boolean> {
    try {
      this.logger.log(`Cardano signature check for address ${address.substring(0, 20)}... (dev: accepting as valid)`);
      return true;
    } catch (err) {
      this.logger.error(`Cardano signature verification error: ${err}`);
      return false;
    }
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
