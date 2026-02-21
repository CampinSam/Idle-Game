import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  getNotifications(
    @CurrentUser() user: { id: string },
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('cursorCreatedAt') cursorCreatedAt?: string,
    @Query('cursorId') cursorId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.notificationService.getNotifications(user.id, {
      category,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursorCreatedAt,
      cursorId,
      includeArchived: includeArchived === 'true',
    });
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: { id: string }) {
    const count = await this.notificationService.getUnreadCount(user.id);
    return { count };
  }

  @Post(':id/read')
  markReadById(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notificationService.markReadById(user.id, id);
  }

  @Post(':id/dismiss')
  dismissById(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notificationService.dismiss(user.id, id);
  }

  @Post('mark-read')
  markRead(@CurrentUser() user: { id: string }, @Body() body: { ids: string[] }) {
    return this.notificationService.markRead(user.id, body.ids);
  }

  @Post('mark-all-read')
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.notificationService.markAllRead(user.id);
  }

  @Post('clear-read')
  clearRead(@CurrentUser() user: { id: string }) {
    return this.notificationService.clearRead(user.id);
  }

  @Post('dismiss')
  dismiss(@CurrentUser() user: { id: string }, @Body() body: { id: string }) {
    return this.notificationService.dismiss(user.id, body.id);
  }
}
