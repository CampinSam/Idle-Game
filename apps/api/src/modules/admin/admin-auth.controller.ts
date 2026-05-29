import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    if (!body.username || !body.password) {
      throw new UnauthorizedException('Username and password are required');
    }
    return this.adminAuthService.login(body.username, body.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout() {
    // JWT is stateless — token invalidation is handled client-side (clear sessionStorage).
    // For short-TTL tokens this is sufficient. A denylist can be added here if needed.
    return { success: true };
  }
}
