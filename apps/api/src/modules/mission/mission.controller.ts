import { Controller, Get, Post, Param, Body, UseGuards, Headers } from '@nestjs/common';
import { IsString, IsArray, ArrayMinSize } from 'class-validator';
import { SkipThrottle } from '@nestjs/throttler';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { MissionService } from './mission.service';
import { UiService } from '../ui/ui.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyService } from '../infrastructure/idempotency.service';

class StartMissionDto {
  @IsString()
  defId: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  entityIds: string[];
}

class SynergyPreviewDto {
  @IsString()
  defId: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  entityIds: string[];
}

@Controller('missions')
@UseGuards(JwtAuthGuard)
export class MissionController {
  constructor(
    private missionService: MissionService,
    private uiService: UiService,
    private idempotency: IdempotencyService,
  ) {}

  @Get('categories')
  getCategories(@CurrentUser() user: { id: string }) {
    return this.missionService.getMissionCategoryDefs(user.id);
  }

  @Get('definitions')
  getDefinitions(@CurrentUser() user: { id: string }) {
    return this.missionService.getMissionDefinitions(user.id);
  }

  @Get('active')
  getActiveMissions(@CurrentUser() user: { id: string }) {
    return this.missionService.getActiveMissions(user.id);
  }

  @Get('history')
  getMissionHistory(@CurrentUser() user: { id: string }) {
    return this.missionService.getMissionHistory(user.id);
  }

  @Post('start')
  startMission(
    @CurrentUser() user: { id: string },
    @Body() dto: StartMissionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      'POST:/missions/start',
      idempotencyKey,
      { defId: dto.defId, entityIds: dto.entityIds },
      () => this.missionService.startMission(user.id, dto.defId, dto.entityIds),
    );
  }

  @Post(':id/complete')
  completeMission(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      `POST:/missions/${id}/complete`,
      idempotencyKey,
      { missionId: id },
      () => this.missionService.completeMission(user.id, id),
    );
  }

  @Post('synergy-preview')
  @UseGuards(UserThrottlerGuard)
  @SkipThrottle({ commands: true, auth: true, clientErrors: true })
  getSynergyPreview(
    @CurrentUser() user: { id: string },
    @Body() dto: SynergyPreviewDto,
  ) {
    return this.missionService.getMissionSynergyPreview(user.id, dto.defId, dto.entityIds);
  }

  @Get(':jobId/stats')
  getMissionJobStats(
    @CurrentUser() user: { id: string },
    @Param('jobId') jobId: string,
  ) {
    return this.missionService.getMissionJobStats(user.id, jobId);
  }

  @Get(':defId/lead-in')
  getMissionLeadIn(
    @CurrentUser() user: { id: string },
    @Param('defId') defId: string,
  ) {
    return this.uiService.buildLeadInModalForMission(user.id, defId);
  }

}
