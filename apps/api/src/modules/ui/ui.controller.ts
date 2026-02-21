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

    throw new BadRequestException('One of jobId, notificationId, or giftId is required');
  }
}
