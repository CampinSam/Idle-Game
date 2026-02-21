import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CraftingService } from './crafting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class StartCraftingDto {
  @IsString()
  recipeId: string;

  @IsString()
  entityId: string;
}

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

  @Post('start')
  startCrafting(@CurrentUser() user: { id: string }, @Body() dto: StartCraftingDto) {
    return this.craftingService.startCrafting(user.id, dto.recipeId, dto.entityId);
  }

  @Post(':id/collect')
  collectCrafting(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.craftingService.collectCrafting(user.id, id);
  }
}
