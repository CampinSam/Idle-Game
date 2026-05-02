import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
    if (process.env.CORS_ORIGIN === '*') {
      throw new Error('CORS_ORIGIN must not be "*" in production');
    }
  }

  if (isProduction) {
    app.setGlobalPrefix('api', {
      exclude: ['/health', '/media/(.*)'],
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN || (isProduction ? false : '*');
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  const port = process.env.PORT || (isProduction ? 5000 : 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`Derp Universe API running on port ${port}`);
}

bootstrap();
