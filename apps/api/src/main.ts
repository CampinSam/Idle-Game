import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

function parseCorsOrigin(raw: string | undefined, isProduction: boolean): boolean | string | string[] {
  if (!raw) return isProduction ? false : '*';
  // Comma-separated list of explicit origins. We deliberately reject '*' in
  // production further up; here we just split + trim.
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return isProduction ? false : '*';
  if (parts.length === 1) return parts[0];
  return parts;
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  // Fail loudly in production if critical security env vars are missing
  // rather than booting with insecure defaults that the rest of the app
  // would silently rely on. Dev keeps permissive defaults for local DX.
  if (isProduction) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET must be set in production');
    }
    if (!process.env.ADMIN_SECRET) {
      throw new Error('ADMIN_SECRET must be set in production');
    }
    if (!process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN must be set in production (no wildcard)');
    }
    const corsParts = process.env.CORS_ORIGIN.split(',').map((s) => s.trim());
    if (corsParts.includes('*')) {
      throw new Error('CORS_ORIGIN must not contain "*" in production');
    }
  }

  // Never buffer logs. With bufferLogs:true, every Pino log line is held in
  // memory until app.useLogger() is called. If NestFactory.create() throws
  // (e.g. an OnModuleInit failure in BootstrapService or the tick pipeline),
  // the buffer is silently discarded — the process exits with no output at all,
  // making the root cause completely invisible in deployment logs. Keeping it
  // false means the default Nest console logger handles the boot sequence and
  // every log line hits stdout immediately. After app.useLogger() is called,
  // all subsequent output goes through pino as usual.
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Trust the first proxy hop so `req.ip` reflects the real client IP
  // (forwarded via `x-forwarded-for` by Replit's edge / Cloudflare-style
  // fronts) instead of the proxy's loopback address. Without this every
  // request looks like it came from `127.0.0.1` and the per-IP throttlers
  // become a global throttler, which is much worse for legitimate users
  // sharing an exit IP. We trust EXACTLY one hop — `true` would let any
  // attacker spoof their IP via a crafted `x-forwarded-for` header.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Replace the default Nest logger with the structured pino logger we wired
  // in AppModule so every framework-emitted line is JSON-able and carries
  // the request-id we attach via pino-http.
  app.useLogger(app.get(PinoLogger));

  // Security headers. Defaults give us X-Content-Type-Options, X-Frame-Options
  // (DENY), Referrer-Policy, and HSTS in production. We disable CSP because
  // the SPA bundle is served by ServeStaticModule with inline scripts/styles
  // and the dev preview is iframed via Replit's proxy — a strict CSP needs
  // its own design pass before turning on.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Bound request bodies. Defaults are generous (~100kb for JSON in modern
  // express) but we want an explicit, low cap so a single malicious POST
  // can't wedge memory. Media uploads go through their own multipart route
  // (object-storage) which streams to GCS and isn't affected by this cap.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  if (isProduction) {
    // '/' is the liveness probe target used by Replit autoscale / Cloud Run.
    // Without this exclusion the HealthController's root @Get() is prefixed to
    // GET /api, so GET / falls through to ServeStaticModule which returns HTML.
    // Cloud Run's health probe checks GET / and expects a fast, non-HTML 200;
    // returning HTML causes the container to fail the promote step.
    app.setGlobalPrefix('api', {
      exclude: ['/', '/health', '/health/ready', '/media/(.*)'],
    });
  }

  // Drain in-flight requests on SIGTERM/SIGINT before tearing down Prisma.
  // Without this, Replit Deploy recycles kill mid-transaction commands and
  // the user sees orphaned idempotency-placeholder rows.
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN, isProduction);
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Process-level safety nets. Don't process.exit — let the orchestrator
  // (Replit deploy / docker / pm2) decide whether to recycle. The point is
  // that these errors must never go to /dev/null.
  const procLogger = new NestLogger('Process');
  process.on('unhandledRejection', (reason: unknown) => {
    procLogger.error(
      { err: reason },
      `Unhandled promise rejection: ${(reason as Error)?.message ?? String(reason)}`,
    );
  });
  process.on('uncaughtException', (err: Error) => {
    procLogger.error({ err }, `Uncaught exception: ${err?.message ?? String(err)}`);
  });

  const port = process.env.PORT || (isProduction ? 5000 : 3001);
  // In production (Cloud Run / autoscale) the container must bind on all
  // interfaces so the platform's load balancer can reach it. In development,
  // bind to 127.0.0.1 only — the Vite dev server already proxies `/api` and
  // `/media` to `http://127.0.0.1:3001` (see apps/web/vite.config.ts), and
  // keeping the port off the public 0.0.0.0 interface prevents Replit's port
  // auto-detector from mirroring it into `.replit`'s `[[ports]]` block. That
  // mirroring was breaking autoscale publishes because Cloud Run only allows
  // a single forwarded port (the production app on 5000 → 80).
  const host = isProduction ? '0.0.0.0' : '127.0.0.1';
  await app.listen(port, host);

  // Use the structured logger so this line is consistent with the rest of
  // the boot output and carries no stray console.log calls.
  new NestLogger('Bootstrap').log(`Derp Universe API running on port ${port}`);
}

bootstrap().catch((err) => {
  // Last-ditch surface for any error thrown before `app.listen` resolves —
  // including OnModuleInit failures from BootstrapService or the tick pipeline.
  // console.error writes synchronously to stderr so this line is guaranteed to
  // appear in deployment logs even before any logger is wired up.
  // eslint-disable-next-line no-console
  console.error('[bootstrap] fatal error during startup:', err?.stack ?? err);
  process.exitCode = 1;
  process.exit(1);
});
