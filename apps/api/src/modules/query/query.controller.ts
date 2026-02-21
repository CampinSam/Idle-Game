import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { QueryService } from './query.service';

@Controller('v1')
export class QueryController {
  constructor(private queryService: QueryService) {}

  @Get('bootstrap')
  @UseGuards(JwtAuthGuard)
  async bootstrap(@Request() req: any) {
    return this.queryService.bootstrap(req.user.id);
  }

  @Get('delta')
  @UseGuards(JwtAuthGuard)
  async getDelta(@Request() req: any, @Query('since') since: string) {
    if (!since) {
      throw new BadRequestException('since query parameter is required');
    }

    try {
      BigInt(since);
    } catch {
      throw new BadRequestException('since must be a valid integer');
    }

    return this.queryService.getDelta(req.user.id, since);
  }
}
