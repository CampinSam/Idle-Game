import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma/prisma.service';
import { SeedSyncService } from './seeds/seed-sync.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private prisma: PrismaService,
    private seedSyncService: SeedSyncService,
  ) {}

  async onModuleInit() {
    // Run unified seed from Object Storage on every startup (non-fatal).
    // Falls back to prisma/seed-data.json if Object Storage is unavailable.
    try {
      await this.seedSyncService.runSeed();
    } catch (err: any) {
      this.logger.warn(`Auto-seed on startup failed (non-fatal): ${err?.message}`);
    }

    // Always ensure built-in admin roles exist (idempotent upsert).
    // Self-heals after accidental db-push truncation of admin_roles.
    try {
      await this.seedBuiltInRoles();
    } catch (err: any) {
      this.logger.warn(`seedBuiltInRoles failed (non-fatal): ${err?.message}`);
    }

    // Only seed the default dev admin account in non-production environments.
    if (process.env.NODE_ENV !== 'production') {
      try {
        await this.seedDevAdmin();
      } catch (err: any) {
        this.logger.warn(`seedDevAdmin failed (non-fatal): ${err?.message}`);
      }
    }
  }

  private async seedBuiltInRoles(): Promise<void> {
    const SUPER_ADMIN_ROLE_ID = 'role_super_admin';
    await this.prisma.adminRole.upsert({
      where: { key: SUPER_ADMIN_ROLE_ID },
      update: {},
      create: {
        key: SUPER_ADMIN_ROLE_ID,
        name: 'Super Admin',
        slug: 'super_admin',
        permissionFlags: { read: true, write: true, approve: true, player_read: true, player_write: true, system_tools: true, metrics_read: true },
        isBuiltIn: true,
      },
    });
    this.logger.log('Built-in admin roles verified.');
  }

  private async seedDevAdmin(): Promise<void> {
    const SUPER_ADMIN_ROLE_ID = 'role_super_admin';
    const DEV_USERNAME = 'superadmin';
    const DEV_PASSWORD = 'admin';

    const superAdminRole = await this.prisma.adminRole.findUnique({ where: { key: SUPER_ADMIN_ROLE_ID } });
    if (!superAdminRole) {
      this.logger.warn('seedDevAdmin: super_admin role not found — seedBuiltInRoles must run first.');
      return;
    }

    const existing = await this.prisma.adminAccount.findUnique({ where: { username: DEV_USERNAME } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
    await this.prisma.adminAccount.create({
      data: {
        username: DEV_USERNAME,
        passwordHash,
        roleId: superAdminRole.id,
        contentScopes: [],
      },
    });
    this.logger.log(`Dev admin account created: ${DEV_USERNAME}`);
  }
}
