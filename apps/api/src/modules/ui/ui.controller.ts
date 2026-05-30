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
    @Query('locationId') locationId?: string,
    @Query('depositXp') depositXp?: string,
    @Query('levelUp') levelUp?: string,
  ) {
    const userId = user.id || user.userId;

    // Location-scoped intents must be matched BEFORE the generic notificationId
    // branch — callers from notification taps pass `notificationId` purely as
    // contextual metadata (so the level-up builder can resolve fromLevel/toLevel
    // and mark it read), and we don't want that to be swallowed by the generic
    // notification modal builder.
    if (locationId && levelUp === 'true') {
      return this.uiService.buildModalForLocationLevelUp(userId, locationId, notificationId);
    }

    if (locationId && depositXp === 'true') {
      return this.uiService.buildModalForLocationDepositXp(userId, locationId);
    }

    if (jobId) {
      return this.uiService.buildModalForJob(userId, jobId);
    }

    if (notificationId) {
      return this.uiService.buildModalForNotification(userId, notificationId);
    }

    if (giftId) {
      return this.uiService.buildModalForGift(userId, giftId);
    }

    throw new BadRequestException('One of jobId, notificationId, giftId, or locationId is required');
  }
}
