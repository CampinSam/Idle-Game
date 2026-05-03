import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
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

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Replace the default Nest logger with the structured pino logger we wired
  // in AppModule so every framework-emitted line is JSON-able and carries
  // the request-id we attach via pino-http.
  app.useLogger(app.get(PinoLogger));

  if (isProduction) {
    app.setGlobalPrefix('api', {
      exclude: ['/health', '/health/ready', '/media/(.*)'],
    });
  }

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
  await app.listen(port, '0.0.0.0');

  // Use the structured logger so this line is consistent with the rest of
  // the boot output and carries no stray console.log calls.
  new NestLogger('Bootstrap').log(`Derp Universe API running on port ${port}`);
}

bootstrap();
