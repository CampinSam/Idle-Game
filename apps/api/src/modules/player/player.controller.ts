import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlayerService } from './player.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('player')
@UseGuards(JwtAuthGuard)
export class PlayerController {
  constructor(private playerService: PlayerService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: { id: string }) {
    return this.playerService.getProfile(user.id);
  }
}
