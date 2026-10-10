import { Controller, Get, Post, Param, Query, UseGuards, Headers } from '@nestjs/common';
import { GiftService } from './gift.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyService } from '../infrastructure/idempotency.service';

@Controller('gifts')
@UseGuards(JwtAuthGuard)
export class GiftController {
  constructor(
    private giftService: GiftService,
    private idempotency: IdempotencyService,
  ) {}

  @Get()
  getGifts(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
  ) {
    return this.giftService.getGifts(user.id, status);
  }

  @Get(':id')
  getGift(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.giftService.getGift(user.id, id);
  }

  @Post(':id/claim')
  claimGift(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      'POST:/gifts/:id/claim',
      idempotencyKey,
      { giftId: id },
      () => this.giftService.claimGift(user.id, id),
    );
  }
}
