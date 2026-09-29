import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  assertBootstrapResponse,
  assertDeltaResetResponse,
  assertDeltaResponse,
} from '@derp/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { QueryService } from './query.service';

function serializeWireValue(value: unknown): unknown {
  try {
    const json = JSON.stringify(value, (_key, entry) =>
      typeof entry === 'bigint' ? entry.toString() : entry,
    );
    if (json === undefined) throw new TypeError('Response is not JSON serializable');
    return JSON.parse(json);
  } catch (error) {
    throw new InternalServerErrorException(
      `Query response could not be serialized: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

@Controller('v1')
export class QueryController {
  constructor(private queryService: QueryService) {}

  @Get('bootstrap')
  @UseGuards(JwtAuthGuard)
  async bootstrap(@Request() req: any) {
    const response = serializeWireValue(await this.queryService.bootstrap(req.user.id));
    try {
      assertBootstrapResponse(response);
    } catch (error) {
      throw new InternalServerErrorException(
        `Bootstrap produced an invalid response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return response;
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

    const response = serializeWireValue(await this.queryService.getDelta(req.user.id, since));
    try {
      if (response !== null && typeof response === 'object' && 'resetRequired' in response) {
        assertDeltaResetResponse(response);
      } else {
        assertDeltaResponse(response);
      }
    } catch (error) {
      throw new InternalServerErrorException(
        `Delta query produced an invalid response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return response;
  }
}
