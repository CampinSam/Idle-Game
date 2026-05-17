import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Next,
  Res,
} from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  // Liveness — cheap, no I/O. Used by orchestrators to decide if the process
  // is still up. If this ever does I/O, a slow DB will cause the
  // orchestrator to kill a perfectly healthy app.
  //
  // Replit's deployment health probe always sends `x-replit-healthcheck: 1`.
  // Real browser visits do not. We return JSON only for probe requests so
  // that ServeStaticModule can serve index.html to first-time visitors who
  // don't yet have a cached PWA service worker.
  @Get()
  root(
    @Headers('x-replit-healthcheck') healthCheck: string,
    @Res() res: Response,
    @Next() next: NextFunction,
  ): void {
    if (healthCheck) {
      res.json({ status: 'ok', service: 'derp-universe' });
    } else {
      next();
    }
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
