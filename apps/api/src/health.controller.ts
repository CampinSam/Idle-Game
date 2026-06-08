import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { join } from 'path';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  // Dual-purpose root handler:
  //
  // • Replit autoscale / Cloud Run liveness probe → GET / with no text/html
  //   Accept header (typically Accept: */*).  We return a fast JSON 200 so the
  //   promote-step health check passes.
  //
  // • Real browser → GET / with Accept: text/html.  ServeStaticModule would
  //   normally handle this, but NestJS controller routes take priority over it,
  //   so we explicitly send index.html here instead.  Without this, browsers
  //   land on the health-check JSON rather than the React app.
  @Get()
  root(@Req() req: Request, @Res() res: Response) {
    const accept = (req.headers['accept'] as string) ?? '';
    if (accept.includes('text/html')) {
      const spaIndex = join(__dirname, '..', '..', 'web', 'dist', 'index.html');
      return res.sendFile(spaIndex);
    }
    return res.json({ status: 'ok', service: 'derp-universe' });
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  // Readiness — does the app have everything it needs to serve traffic?
  // The only out-of-process dependency that matters at MVP scope is Postgres.
  // Returns 503 with a structured reason if the DB ping fails or times out
  // (1s budget) so load balancers can drain this instance.
  @Get('health/ready')
  async ready() {
    const start = Date.now();
    try {
      const result = await Promise.race([
        this.prisma.$queryRaw`SELECT 1 AS ok`,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DB ping timed out')), 1000),
        ),
      ]);
      const elapsedMs = Date.now() - start;
      return {
        status: 'ready',
        checks: {
          db: { ok: true, elapsedMs },
        },
        result,
      };
    } catch (err) {
      const elapsedMs = Date.now() - start;
      const message = (err as Error)?.message ?? String(err);
      this.logger.error(
        { err, elapsedMs },
        `Readiness probe failed: ${message}`,
      );
      throw new HttpException(
        {
          status: 'not_ready',
          checks: {
            db: { ok: false, elapsedMs, error: message },
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
