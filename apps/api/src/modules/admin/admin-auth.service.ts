import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionFlags, AdminAccountUser } from './admin-permissions';

export interface AdminLoginResult {
  token: string;
  account: AdminAccountDto;
}

export interface AdminAccountDto {
  id: string;
  username: string;
  roleId: string;
  role: {
    id: string;
    name: string;
    slug: string;
    permissionFlags: PermissionFlags;
  };
  contentScopes: string[];
  permissionFlagsOverride: Partial<PermissionFlags>;
  effectivePermissions: PermissionFlags;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string): Promise<AdminLoginResult> {
    const account = await this.prisma.adminAccount.findUnique({
      where: { username },
      include: { role: true },
    });

    if (!account || !account.enabled) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const rolePerms = account.role.permissionFlags as unknown as PermissionFlags;
    const override = (account.permissionFlagsOverride ?? {}) as unknown as Partial<PermissionFlags>;
    const perms: PermissionFlags = { ...rolePerms };
    for (const key of Object.keys(override) as Array<keyof PermissionFlags>) {
      if (override[key] === true) perms[key] = true;
    }
    const token = this.jwt.sign(
      {
        sub: account.id,
        username: account.username,
        role: account.role.slug,
        perms,
        scopes: account.contentScopes,
        type: 'admin',
      },
      { expiresIn: '4h' },
    );

    return {
      token,
      account: this.toDto(account),
    };
  }

  buildUserFromJwt(payload: any): AdminAccountUser {
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      perms: payload.perms as PermissionFlags,
      scopes: payload.scopes ?? [],
      isBootstrap: false,
    };
  }

  async getMe(adminId: string): Promise<AdminAccountDto> {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: adminId },
      include: { role: true },
    });
    if (!account) throw new NotFoundException('Admin account not found');
    return this.toDto(account);
  }

  async listRoles() {
    return this.prisma.adminRole.findMany({ orderBy: { name: 'asc' } });
  }

  async listAccounts(): Promise<AdminAccountDto[]> {
    const accounts = await this.prisma.adminAccount.findMany({
      include: { role: true },
      orderBy: { username: 'asc' },
    });
    return accounts.map((a) => this.toDto(a));
  }

  async createAccount(data: {
    username: string;
    password: string;
    roleId: string;
    contentScopes?: string[];
  }): Promise<AdminAccountDto> {
    const existing = await this.prisma.adminAccount.findUnique({ where: { username: data.username } });
    if (existing) throw new ConflictException(`Username '${data.username}' is already taken`);

    const role = await this.prisma.adminRole.findFirst({ where: { OR: [{ id: data.roleId }, { slug: data.roleId }] } });
    if (!role) throw new BadRequestException(`Role '${data.roleId}' not found`);

    if (!data.password || data.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const account = await this.prisma.adminAccount.create({
      data: {
        username: data.username,
        passwordHash,
        roleId: role.id,
        contentScopes: data.contentScopes ?? [],
      },
      include: { role: true },
    });

    this.logger.log(`Admin account created: ${account.username} (role: ${role.slug})`);
    return this.toDto(account);
  }

  async updateAccount(
    id: string,
    data: {
      username?: string;
      password?: string;
      roleId?: string;
      contentScopes?: string[];
      enabled?: boolean;
      permissionFlagsOverride?: Partial<PermissionFlags>;
    },
    requestingAdminId: string,
  ): Promise<AdminAccountDto> {
    const account = await this.prisma.adminAccount.findUnique({ where: { id }, include: { role: true } });
    if (!account) throw new NotFoundException('Account not found');

    const updates: any = {};

    if (data.username !== undefined) {
      if (data.username !== account.username) {
        const clash = await this.prisma.adminAccount.findUnique({ where: { username: data.username } });
        if (clash) throw new ConflictException(`Username '${data.username}' is already taken`);
      }
      updates.username = data.username;
    }

    if (data.password !== undefined) {
      if (data.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
      updates.passwordHash = await bcrypt.hash(data.password, 12);
    }

    if (data.roleId !== undefined) {
      const role = await this.prisma.adminRole.findFirst({ where: { OR: [{ id: data.roleId }, { slug: data.roleId }] } });
      if (!role) throw new BadRequestException(`Role '${data.roleId}' not found`);
      updates.roleId = role.id;
    }

    if (data.contentScopes !== undefined) updates.contentScopes = data.contentScopes;
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    if (data.permissionFlagsOverride !== undefined) updates.permissionFlagsOverride = data.permissionFlagsOverride;

    const updated = await this.prisma.adminAccount.update({
      where: { id },
      data: updates,
      include: { role: true },
    });

    return this.toDto(updated);
  }

  async changeOwnPassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const account = await this.prisma.adminAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    const valid = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.adminAccount.update({ where: { id }, data: { passwordHash } });
  }

  async deleteAccount(id: string, requestingAdminId: string): Promise<void> {
    if (id === requestingAdminId) {
      throw new BadRequestException('Cannot delete your own account');
    }
    const account = await this.prisma.adminAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    await this.prisma.adminAccount.delete({ where: { id } });
    this.logger.log(`Admin account deleted: ${account.username}`);
  }

  private mergePerms(rolePerms: PermissionFlags, override: Partial<PermissionFlags>): PermissionFlags {
    const merged: PermissionFlags = { ...rolePerms };
    for (const key of Object.keys(override) as Array<keyof PermissionFlags>) {
      if (override[key] === true) merged[key] = true;
    }
    return merged;
  }

  private toDto(account: any): AdminAccountDto {
    const rolePerms = account.role.permissionFlags as unknown as PermissionFlags;
    const override = (account.permissionFlagsOverride ?? {}) as unknown as Partial<PermissionFlags>;
    return {
      id: account.id,
      username: account.username,
      roleId: account.roleId,
      role: {
        id: account.role.id,
        name: account.role.name,
        slug: account.role.slug,
        permissionFlags: rolePerms,
      },
      contentScopes: account.contentScopes,
      permissionFlagsOverride: override,
      effectivePermissions: this.mergePerms(rolePerms, override),
      enabled: account.enabled,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
