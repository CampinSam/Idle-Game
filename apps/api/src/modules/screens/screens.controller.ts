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
import { ScreensService } from './screens.service';
import { AdminGuard } from '../admin/admin.guard';
import type { PlatformKey } from '@derp/shared';

@Controller('screens')
export class ScreensController {
  constructor(private readonly screensService: ScreensService) {}

  @Get(':screenKey')
  async resolveActive(
    @Param('screenKey') screenKey: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-platform') xPlatform?: string,
  ) {
    const userId = this.extractUserId(authHeader);
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

  private extractUserId(authHeader?: string): string | undefined {
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    try {
      const token = authHeader.slice(7);
      const parts = token.split('.');
      if (parts.length !== 3) return undefined;
      const padding = '='.repeat((4 - (parts[1].length % 4)) % 4);
      const payload = JSON.parse(
        Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/') + padding, 'base64').toString('utf8'),
      ) as { sub?: string };
      return payload?.sub;
    } catch {
      return undefined;
    }
  }
}
