import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UiService } from './ui.service';

@Controller('ui')
@UseGuards(JwtAuthGuard)
export class UiController {
  constructor(private uiService: UiService) {}

  @Get('modal')
  async getModal(
    @CurrentUser() user: any,
    @Query('jobId') jobId?: string,
    @Query('notificationId') notificationId?: string,
    @Query('giftId') giftId?: string,
    @Query('buildingDefId') buildingDefId?: string,
    @Query('locationId') locationId?: string,
    @Query('buildingId') buildingId?: string,
  ) {
    const userId = user.id || user.userId;

    if (jobId) {
      return this.uiService.buildModalForJob(userId, jobId);
    }

    if (notificationId) {
      return this.uiService.buildModalForNotification(userId, notificationId);
    }

    if (giftId) {
      return this.uiService.buildModalForGift(userId, giftId);
    }

    if (buildingDefId && locationId && buildingId) {
      return this.uiService.buildModalForUpgradeBuilding(userId, locationId, buildingId, buildingDefId);
    }

    if (buildingDefId && locationId) {
      return this.uiService.buildModalForBuildBuilding(userId, locationId, buildingDefId);
    }

    throw new BadRequestException('One of jobId, notificationId, giftId, or buildingDefId is required');
  }
}
