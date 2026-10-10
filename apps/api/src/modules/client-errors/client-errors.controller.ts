import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ThrottlerGuard, SkipThrottle } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';

const MAX_LOGGED_STACK_CHARS = 4000;
const MAX_LOGGED_MESSAGE_CHARS = 500;

/**
 * Strip everything after `?` or `#` from a URL so query-param session
 * tokens / passwords / OAuth state never end up in our log stream.
 * We log only path + origin.
 */
function safeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw, 'http://_');
    return `${u.origin === 'http://_' ? '' : u.origin}${u.pathname}`;
  } catch {
    const cut = raw.split(/[?#]/)[0];
    return cut.slice(0, 500);
  }
}

function clip(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined;
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

class ClientErrorDto {
  @IsString()
  @MaxLength(500)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  componentStack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fallbackTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  release?: string;
}

// Sink for frontend errors caught by `<ErrorBoundary>` and the global
// `window.onerror` / `unhandledrejection` listeners. We send these into
// the same pino stream as backend errors so a future log-aggregator
// (Sentry / Logtail / Axiom) sees both halves of the stack — vendor
// choice deferred, but the wire-up is in place.
//
// Throttle harder than auth (60/min/IP): a misbehaving client could
// spam its own ErrorBoundary in a tight render loop. Cap the blast
// radius before we even hit the logger.
// Skip the unrelated named scopes so only the `clientErrors` budget
// (configured in `app.module.ts`) actually counts. Note: an earlier
// draft used `@Throttle({ default: ... })`, but no `default` scope is
// registered globally — that produced no effective limit. The named
// scope below is what's actually enforced.
@Controller('v1')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ commands: true, auth: true, synergyPreview: true })
export class ClientErrorsController {
  private readonly logger = new Logger('ClientError');

  @Post('client-errors')
  @HttpCode(HttpStatus.NO_CONTENT)
  report(
    @Body() dto: ClientErrorDto,
    @Req() req: Request & { user?: { id?: string } },
  ): void {
    this.logger.error(
      {
        userId: req.user?.id,
        url: safeUrl(dto.url),
        userAgent: req.headers['user-agent'],
        fallbackTitle: dto.fallbackTitle,
        release: dto.release,
        stack: clip(dto.stack, MAX_LOGGED_STACK_CHARS),
        componentStack: clip(dto.componentStack, 500),
        ip: req.ip,
      },
      `Client error: ${clip(dto.message, MAX_LOGGED_MESSAGE_CHARS)}`,
    );
  }
}
