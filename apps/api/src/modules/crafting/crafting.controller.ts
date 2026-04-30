import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { CraftingService } from './crafting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('crafting')
@UseGuards(JwtAuthGuard)
export class CraftingController {
  constructor(private craftingService: CraftingService) {}

  @Get('recipes')
  getRecipes(@CurrentUser() user: { id: string }) {
    return this.craftingService.getRecipes(user.id);
  }

  @Get('active')
  getActiveJobs(@CurrentUser() user: { id: string }) {
    return this.craftingService.getActiveJobs(user.id);
  }

  @Get('forecast')
  getLuckForecast(
    @CurrentUser() user: { id: string },
    @Query('includeAll') includeAll?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.craftingService.getLuckForecast(user.id, {
      includeAll: includeAll === '1' || includeAll === 'true',
      locationId: locationId || undefined,
    });
  }

  @Get('workshops')
  getWorkshops(@CurrentUser() user: { id: string }) {
    return this.craftingService.getWorkshops(user.id);
  }

  @Get('workshops/:locationId')
  getWorkshopAtLocation(
    @CurrentUser() user: { id: string },
    @Param('locationId') locationId: string,
  ) {
    return this.craftingService.assertWorkshopAtLocation(user.id, locationId);
  }

  @Post(':id/collect')
  collectCrafting(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.craftingService.collectCrafting(user.id, id);
  }
}
