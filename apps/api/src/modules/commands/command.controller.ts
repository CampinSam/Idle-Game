import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { assertCommandRequest } from '@derp/shared';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CommandService, CommandInput } from './command.service';

@Controller('v1')
export class CommandController {
  constructor(private commandService: CommandService) {}

  @Post('commands')
  @UseGuards(UserThrottlerGuard, JwtAuthGuard)
  @SkipThrottle({ auth: true, synergyPreview: true, clientErrors: true, forgotPassword: true })
  async executeCommand(@Request() req: any, @Body() body: unknown) {
    try {
      assertCommandRequest(body);
    } catch (error) {
      throw new BadRequestException(
        `Invalid command request: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const commandBody = body;
    const input: CommandInput = {
      type: commandBody.type,
      payload: commandBody.payload ?? {},
      idempotencyKey: commandBody.idempotencyKey,
    };

    return this.commandService.execute(req.user.id, input);
  }
}
