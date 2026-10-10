import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  DefaultValuePipe,
  Headers,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ScreensService } from './screens.service';
import { AdminGuard } from '../admin/admin.guard';
import type { PlatformKey } from '@derp/shared';

@Controller('screens')
export class ScreensController {
  constructor(
    private readonly screensService: ScreensService,
    private readonly jwtService: JwtService,
  ) {}

  @Get(':screenKey')
  async resolveActive(
    @Param('screenKey') screenKey: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-platform') xPlatform?: string,
  ) {
    const userId = this.extractVerifiedUserId(authHeader);
    const platform = (xPlatform ?? 'web') as PlatformKey;

    let userCtx: Awaited<ReturnType<typeof this.screensService.loadUserContext>>;
    if (userId) {
      userCtx = await this.screensService.loadUserContext(userId);
    }

    return this.screensService.resolveScreen(screenKey, {
      user: userCtx,
      platform,
    });
  }

  @Get(':screenKey/preview')
  @UseGuards(AdminGuard)
  resolvePreview(
    @Param('screenKey') screenKey: string,
    @Query('version', new DefaultValuePipe(1), ParseIntPipe) version: number,
  ) {
    return this.screensService.resolvePreview(screenKey, version);
  }

  private extractVerifiedUserId(authHeader?: string): string | undefined {
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    try {
      const token = authHeader.slice(7);
      const payload = this.jwtService.verify<{ sub?: string }>(token);
      return payload?.sub;
    } catch {
      return undefined;
    }
  }
}
