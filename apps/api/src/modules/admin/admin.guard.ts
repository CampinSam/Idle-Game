import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { resolveRequiredPermission, buildUserFromJwt, AdminAccountUser, PermissionFlags } from './admin-permissions';

const BOOTSTRAP_PERMS: PermissionFlags = {
  read: true,
  write: true,
  approve: true,
  player_read: true,
  player_write: true,
  system_tools: true,
};

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private warnedDevFallback = false;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Try JWT Bearer token first
    const authHeader = request.headers['authorization'] as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new UnauthorizedException('JWT_SECRET not configured');
      }
      let payload: any;
      try {
        payload = jwt.verify(token, secret);
      } catch {
        throw new UnauthorizedException('Invalid or expired admin token');
      }
      if (payload.type !== 'admin') {
        throw new UnauthorizedException('Not an admin token');
      }
      request.adminUser = buildUserFromJwt(payload);
      return this.checkPermission(request);
    }

    // 2. Bootstrap fallback: ADMIN_SECRET via x-admin-key header
    const adminKey = request.headers['x-admin-key'];
    const isProduction = process.env.NODE_ENV === 'production';
    const expected = process.env.ADMIN_SECRET;

    if (!expected) {
      if (isProduction) {
        throw new UnauthorizedException('Admin access not configured');
      }
      if (!this.warnedDevFallback) {
        this.warnedDevFallback = true;
        this.logger.warn('ADMIN_SECRET not set — using dev fallback. DO NOT USE IN PROD.');
      }
    }

    const compareTo = expected || 'derp-admin-2026';
    if (!adminKey || adminKey !== compareTo) {
      throw new UnauthorizedException('Authentication required');
    }

    // Bootstrap user: full Super Admin access
    request.adminUser = {
      id: '__bootstrap__',
      username: '__bootstrap__',
      role: 'super_admin',
      perms: BOOTSTRAP_PERMS,
      scopes: [],
      isBootstrap: true,
    } satisfies AdminAccountUser;

    return this.checkPermission(request);
  }

  private checkPermission(request: any): boolean {
    const adminUser: AdminAccountUser = request.adminUser;
    const rawPath: string = request.path ?? '';

    // Strip /api/admin prefix to get the admin-relative path
    const adminPath = rawPath.replace(/^\/api\/admin/, '') || '/';

    const result = resolveRequiredPermission(adminPath, request.method, adminUser);
    if (!result.allowed) {
      throw new ForbiddenException(result.reason || 'Insufficient permissions');
    }
    return true;
  }
}
