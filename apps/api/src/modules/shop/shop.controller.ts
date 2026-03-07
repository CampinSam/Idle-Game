import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Headers, UnauthorizedException } from '@nestjs/common';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller()
export class ShopController {
  constructor(private shopService: ShopService) {}

  @UseGuards(JwtAuthGuard)
  @Get('shop/items')
  async getItems() {
    return this.shopService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('shop/items/:id')
  async getItem(@Param('id') id: string) {
    return this.shopService.findOne(id);
  }

  @Post('admin/shop')
  async createItem(@Body() body: any, @Headers('x-admin-key') adminKey: string) {
    const expected = process.env.ADMIN_SECRET ?? 'derp-admin-2026';
    if (adminKey !== expected) throw new UnauthorizedException('Invalid admin key');
    return this.shopService.create(body);
  }

  @Put('admin/shop/:id')
  async updateItem(@Param('id') id: string, @Body() body: any, @Headers('x-admin-key') adminKey: string) {
    const expected = process.env.ADMIN_SECRET ?? 'derp-admin-2026';
    if (adminKey !== expected) throw new UnauthorizedException('Invalid admin key');
    return this.shopService.update(id, body);
  }

  @Delete('admin/shop/:id')
  async deleteItem(@Param('id') id: string, @Headers('x-admin-key') adminKey: string) {
    const expected = process.env.ADMIN_SECRET ?? 'derp-admin-2026';
    if (adminKey !== expected) throw new UnauthorizedException('Invalid admin key');
    return this.shopService.remove(id);
  }
}
