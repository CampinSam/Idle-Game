import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { IsString, IsObject, IsNotEmpty, IsOptional } from 'class-validator';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CommandService, CommandInput } from './command.service';

class CommandDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsObject()
  @IsOptional()
  payload: Record<string, any> = {};

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}

@Controller('v1')
export class CommandController {
  constructor(private commandService: CommandService) {}

  @Post('commands')
  @UseGuards(UserThrottlerGuard, JwtAuthGuard)
  @SkipThrottle({ auth: true, synergyPreview: true, clientErrors: true, forgotPassword: true })
  async executeCommand(@Request() req: any, @Body() body: CommandDto) {
    const input: CommandInput = {
      type: body.type,
      payload: body.payload ?? {},
      idempotencyKey: body.idempotencyKey,
    };

    return this.commandService.execute(req.user.id, input);
  }
}
