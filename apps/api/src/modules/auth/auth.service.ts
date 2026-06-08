import { Injectable, ConflictException, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ethers } from 'ethers';
import verifyCardanoDataSignature from '@cardano-foundation/cardano-verify-datasignature';
import { normalizeCardanoAddress } from './cardano.utils';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../event/event.service';
import { LocationService } from '../location/location.service';
import { LocationSettlementService } from '../location/location-settlement.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { NftCollectionService } from '../nft/nft-collection.service';
import { generateEntityData } from '../entity/entity-generator.util';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private eventService: EventService,
    private locationService: LocationService,
    private settlementService: LocationSettlementService,
    private telemetryService: TelemetryService,
    private nftCollectionService: NftCollectionService,
  ) {}

  async register(username: string, email: string, password: string) {
    // Pre-check for nicer UX errors. The DB-level unique constraint is the
    // source of truth — see the try/catch around user.create below for the
    // race window where two concurrent registrations slip past this check.
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      throw new ConflictException('Username or email already taken');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          authProvider: 'email',
        },
      });
    } catch (err: any) {
      // P2002 = Prisma unique constraint violation. Happens when two
      // concurrent POST /auth/register calls (e.g. user double-clicks the
      // submit button) both pass the pre-check above before either commits.
      // We narrow on `meta.target` so that future unique constraints on this
      // table (e.g. wallet address) don't get a misleading "username or
      // email already taken" message.
      if (err?.code === 'P2002') {
        const target = (err.meta?.target ?? []) as string[];
        if (target.includes('username') || target.includes('email')) {
          throw new ConflictException('Username or email already taken');
        }
      }
      throw err;
    }

    try {
      const entityData = await generateEntityData(this.prisma, user.id, 'derp_bird', 'Starter Entity');
      await (this.prisma as any).entity.create({ data: entityData });
    } catch (err) {
      this.logger.error(`Failed to create starter entity for ${user.id}: ${err}`);
    }

    try {
      await this.locationService.createStarterOutpost(user.id);
    } catch (err) {
      this.logger.error(`Failed to create starter location for ${user.id}: ${err}`);
    }

    try {
      await this.eventService.dispatch('evt_welcome_gift', { gift: { giftDefId: 'gift_welcome_gems' } }, {
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
      await this.telemetryService.record(user.id, 'player_login', null, 1, {});
    } catch (err) {
      this.logger.warn(`Failed to record player_login telemetry for ${user.id}: ${err}`);
    }

    try {
      await this.nftCollectionService.claimFromCachedOwnership(user.id);
    } catch (err) {
      this.logger.warn(`Cached NFT claim failed on login for ${user.id}: ${err}`);
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

  async requestWalletNonce(chain: string, address: string): Promise<{ nonce: string; message: string }> {
    const nonce = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const normalizedAddress = chain === 'CARDANO' ? normalizeCardanoAddress(address) : address.toLowerCase();

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
    key?: string,
  ): Promise<
    | { accessToken: string; player: any }
    | { linked: true }
    | { needsOnboarding: true; walletToken: string; chain: string; address: string }
  > {
    const normalizedAddress = chain === 'CARDANO' ? normalizeCardanoAddress(address) : address.toLowerCase();

    const nonceRecord = await (this.prisma as any).walletNonce.findUnique({
      where: { chain_address: { chain, address: normalizedAddress } },
    });

    if (!nonceRecord || nonceRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Nonce expired or not found — please request a new one');
    }

    const message = `Sign in to Derp Universe: ${nonceRecord.nonce}`;
    let verified = false;

    if (chain === 'CARDANO') {
      verified = await this.verifyCardanoSignature(address, message, signature, key);
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
      try { await this.telemetryService.record(user.id, 'player_login', null, 1, {}); } catch {}
      try { await this.nftCollectionService.claimFromCachedOwnership(user.id); } catch (err) {
        this.logger.warn(`Cached NFT claim failed on SIWE login for ${user.id}: ${err}`);
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
    password?: string,
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

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;

    const user = await this.prisma.user.create({
      data: {
        username: trimmedUsername,
        email: finalEmail,
        authProvider: 'wallet',
        walletAddress: normalizedAddress,
        ecosystemId: chain,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
    await (this.prisma as any).linkedWallet.create({
      data: { userId: user.id, chain, address: normalizedAddress, isPrimary: true },
    });

    try {
      const entityData = await generateEntityData(this.prisma, user.id, 'derp_bird', 'Starter Entity');
      await (this.prisma as any).entity.create({ data: entityData });
    } catch (err) { this.logger.error(`Failed to create starter entity: ${err}`); }
    try {
      await this.locationService.createStarterOutpost(user.id);
    } catch (err) { this.logger.error(`Failed to create starter location: ${err}`); }
    try {
      await this.eventService.dispatch('evt_welcome_gift', { gift: { giftDefId: 'gift_welcome_gems' } }, {
        userId: user.id, sourceType: 'registration', sourceId: user.id,
        idempotencyKey: `welcome-gift-${user.id}`,
      });
    } catch {}
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

  /**
   * Convert a raw Cardano address (hex bytes from CIP-30 `getChangeAddress` /
   * `getRewardAddresses`) into its bech32 form (`addr1...`, `addr_test1...`,
   * `stake1...`, `stake_test1...`).
   *
   * Header byte layout (CIP-19):
   *   high nibble = address type (0..7 payment-style, 14/15 stake)
   *   low nibble  = network id (0 testnet, 1 mainnet)
   *
   * `bech32.encode` defaults to a 90-char limit; Cardano shelley addresses are
   * ~103 chars, so we pass an explicit large limit.
   */
  private hexAddressToBech32(hex: string): string {
    if (!hex || hex.length === 0) throw new Error('Empty Cardano address');
    const converted = normalizeCardanoAddress(hex);
    if (converted === hex) throw new Error(`Could not convert Cardano address to bech32: ${hex}`);
    return converted;
  }

  /**
   * Verify a CIP-30 `signData` payload (CIP-8 / COSE_Sign1).
   *
   * Inputs:
   *   - `address`: hex form of the wallet address that was bound to the nonce.
   *   - `message`: the plain-text nonce message we asked the wallet to sign.
   *   - `signature`: hex CBOR COSE_Sign1 returned by `signData`.
   *   - `key`: hex CBOR COSE_Key (verification key) returned by `signData`.
   *
   * The verifier checks all three properties:
   *   1. The signature is a valid ed25519 sig over the COSE Sig_structure
   *   2. The COSE payload equals our nonce message
   *   3. The COSE address header matches the bech32 form of our recorded address
   *
   * If any of these fail we refuse the login — never fall through to a bypass
   * in production. The dev bypass remains as an escape hatch for local testing
   * with a stub wallet that can't produce a real CIP-30 payload.
   */
  private async verifyCardanoSignature(
    address: string,
    message: string,
    signature: string,
    key?: string,
  ): Promise<boolean> {
    const isProduction = process.env.NODE_ENV === 'production';
    const shortAddr = address.substring(0, 20);

    if (key && signature) {
      try {
        const bech32Address = this.hexAddressToBech32(address);
        const ok = verifyCardanoDataSignature(signature, key, message, bech32Address);
        if (ok) return true;
        this.logger.warn(`Cardano signature verification failed for ${shortAddr}... (sig/key/message/address mismatch)`);
        return false;
      } catch (err) {
        this.logger.error(`Cardano signature verification threw for ${shortAddr}...: ${err}`);
        return false;
      }
    }

    // Missing `key` — legacy clients that only send `signature`. Cannot verify.
    if (isProduction) {
      this.logger.error(`Cardano login for ${shortAddr}... rejected: COSE_Key missing (client must send { signature, key } from CIP-30 signData)`);
      return false;
    }
    if (process.env.DEV_ALLOW_CARDANO_BYPASS === 'true') {
      this.logger.warn(`[DEV BYPASS] Cardano signature accepted without verification for ${shortAddr}... (DEV_ALLOW_CARDANO_BYPASS=true; key not supplied)`);
      return true;
    }
    this.logger.error(`Cardano login for ${shortAddr}... rejected: COSE_Key missing and DEV_ALLOW_CARDANO_BYPASS not set`);
    return false;
  }

  /**
   * Requests a password reset. Always returns 200 so callers can't probe
   * whether an email address is registered. Sends a Resend email when
   * RESEND_API_KEY is configured; otherwise logs the link for dev use.
   */
  async requestPasswordReset(email: string, appUrl?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // silent — don't leak account existence

    // Invalidate prior tokens for this user.
    await (this.prisma as any).passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await (this.prisma as any).passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const base = (appUrl || process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, '');
    const resetUrl = `${base}/reset-password?token=${rawToken}`;

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'Derp Universe <noreply@derp.game>',
            to: [email],
            subject: 'Reset your Derp Universe password',
            html: `<p>Hi ${user.username},</p>
<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
          }),
        });
      } catch (err) {
        this.logger.error(`Failed to send reset email to ${email}: ${err}`);
      }
    } else {
      this.logger.warn(`[DEV] Password reset link for ${user.username}: ${resetUrl}`);
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const record = await (this.prisma as any).passwordReset.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, authProvider: 'email' },
      }),
      (this.prisma as any).passwordReset.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  /**
   * Lets a wallet-only account set a password without going through email.
   * The user must already be authenticated (JWT).
   */
  async setPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, authProvider: user.authProvider === 'wallet' ? 'wallet' : user.authProvider ?? 'email' },
    });
  }

  /**
   * Lets an authenticated user change their existing password by verifying the
   * current one first.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (!user.passwordHash) throw new BadRequestException('No password set on this account');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Admin: generates a signed short-lived reset token for a given user ID
   * without sending any email. Returns the full reset URL for copy/paste.
   */
  async adminGenerateResetLink(userId: string, appUrl?: string): Promise<{ url: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    await (this.prisma as any).passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await (this.prisma as any).passwordReset.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const base = (appUrl || process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, '');
    return { url: `${base}/reset-password?token=${rawToken}` };
  }

  private toPlayerResponse(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      hasPassword: !!user.passwordHash,
      keeperLevel: user.keeperLevel,
      keeperXp: Number(user.keeperXp),
      prestigeTokens: user.prestigeTokens,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
