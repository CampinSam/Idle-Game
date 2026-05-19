import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  // Liveness probe target used by Replit autoscale / Cloud Run.
  //
  // Always returns a small JSON payload so Cloud Run's promote-step health
  // check succeeds regardless of which headers the probe sends. The frontend
  // SPA is served by ServeStaticModule for all unmatched routes; browsers
  // that hit "/" directly will be caught by that handler. We no longer try
  // to sendFile index.html here — that HTML response was causing the promote
  // step to fail because Cloud Run expects a fast, non-HTML 200.
  @Get()
  root() {
    return { status: 'ok', service: 'derp-universe' };
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
