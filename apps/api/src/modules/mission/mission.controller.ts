import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsArray, ArrayMinSize } from 'class-validator';
import { MissionService } from './mission.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class StartMissionDto {
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
  constructor(private missionService: MissionService) {}

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
  startMission(@CurrentUser() user: { id: string }, @Body() dto: StartMissionDto) {
    return this.missionService.startMission(user.id, dto.defId, dto.entityIds);
  }

  @Post(':id/complete')
  completeMission(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.missionService.completeMission(user.id, id);
  }

}
