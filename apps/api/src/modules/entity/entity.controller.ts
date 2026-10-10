import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { EntityService } from './entity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('entities')
@UseGuards(JwtAuthGuard)
export class EntityController {
  constructor(private entityService: EntityService) {}

  @Get()
  getEntities(@CurrentUser() user: { id: string }) {
    return this.entityService.getEntities(user.id);
  }

  @Get(':id')
  getEntity(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.entityService.getEntity(user.id, id);
  }

  @Get(':id/events')
  getEntityEvents(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.entityService.getEntityEvents(id, user.id);
  }

  @Get(':id/power-usage')
  getPowerUsage(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.entityService.getPowerUsage(user.id, id);
  }
}
