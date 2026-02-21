import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminKey = request.headers['x-admin-key'];
    const expected = process.env.ADMIN_SECRET || 'derp-admin-2026';

    if (!adminKey || adminKey !== expected) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }
}
