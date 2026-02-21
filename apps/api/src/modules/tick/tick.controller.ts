import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { TickService } from './tick.service';
import { BoostService } from './boost.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('tick')
export class TickController {
  constructor(
    private tickService: TickService,
    private boostService: BoostService,
  ) {}

  @Get('current')
  async getCurrentTick() {
    return this.tickService.getTickInfo();
  }

  @Get('boosts')
  async getActiveBoosts() {
    return this.boostService.getActiveBoosts();
  }

  @Get('boosts/all')
  @UseGuards(JwtAuthGuard)
  async getAllBoosts() {
    return this.boostService.getAllBoosts();
  }

  @Post('boosts')
  @UseGuards(JwtAuthGuard)
  async createBoost(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      name: string;
      description?: string;
      multiplier: number;
      durationMinutes: number;
    },
  ) {
    return this.boostService.createBoost({ ...body, userId: user.id });
  }

  @Delete('boosts/:id')
  @UseGuards(JwtAuthGuard)
  async cancelBoost(@Param('id') id: string) {
    return this.boostService.cancelBoost(id);
  }
}
