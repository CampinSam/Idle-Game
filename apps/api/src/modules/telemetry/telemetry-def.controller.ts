import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TelemetryDefService } from './telemetry-def.service';
import { AdminGuard } from '../admin/admin.guard';

@Controller()
export class TelemetryDefController {
  constructor(private readonly telemetryDefService: TelemetryDefService) {}

  @Get('telemetry/:id')
  getPublicCounts(@Param('id') id: string) {
    return this.telemetryDefService.getDefWithCounts(id);
  }

  @Get('admin/telemetry')
  @UseGuards(AdminGuard)
  listDefs() {
    return this.telemetryDefService.listDefs();
  }

  @Post('admin/telemetry')
  @UseGuards(AdminGuard)
  createDef(@Body() body: any) {
    return this.telemetryDefService.createDef(body);
  }

  @Put('admin/telemetry/:id')
  @UseGuards(AdminGuard)
  updateDef(@Param('id') id: string, @Body() body: any) {
    return this.telemetryDefService.updateDef(id, body);
  }

  @Delete('admin/telemetry/:id')
  @UseGuards(AdminGuard)
  deleteDef(@Param('id') id: string) {
    return this.telemetryDefService.deleteDef(id);
  }

  @Post('admin/telemetry/:id/reset')
  @UseGuards(AdminGuard)
  resetCounts(@Param('id') id: string) {
    return this.telemetryDefService.resetCounts(id);
  }

  @Get('admin/telemetry/:id')
  @UseGuards(AdminGuard)
  getDefWithCounts(@Param('id') id: string) {
    return this.telemetryDefService.getDefWithCounts(id);
  }
}
