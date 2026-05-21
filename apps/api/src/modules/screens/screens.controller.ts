import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { ScreensService } from './screens.service';
import { AdminGuard } from '../admin/admin.guard';

@Controller('screens')
export class ScreensController {
  constructor(private readonly screensService: ScreensService) {}

  @Get(':screenKey')
  resolveActive(@Param('screenKey') screenKey: string) {
    return this.screensService.resolveActive(screenKey);
  }

  @Get(':screenKey/preview')
  @UseGuards(AdminGuard)
  resolvePreview(
    @Param('screenKey') screenKey: string,
    @Query('version', new DefaultValuePipe(1), ParseIntPipe) version: number,
  ) {
    return this.screensService.resolvePreview(screenKey, version);
  }
}
