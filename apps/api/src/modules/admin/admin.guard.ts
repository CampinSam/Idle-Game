import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private warnedDevFallback = false;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminKey = request.headers['x-admin-key'];
    const isProduction = process.env.NODE_ENV === 'production';
    const expected = process.env.ADMIN_SECRET;

    if (!expected) {
      if (isProduction) {
        // Production must be configured. Refuse all admin access rather
        // than fall back to a known string (previously 'derp-admin-2026').
        throw new UnauthorizedException('Admin access not configured');
      }
      if (!this.warnedDevFallback) {
        this.warnedDevFallback = true;
        this.logger.warn('ADMIN_SECRET not set — using dev fallback. DO NOT USE IN PROD.');
      }
    }

    const compareTo = expected || 'derp-admin-2026';
    if (!adminKey || adminKey !== compareTo) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }
}
