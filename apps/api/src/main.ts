import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const isProduction = process.env.NODE_ENV === 'production';

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

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  const port = process.env.PORT || (isProduction ? 5000 : 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`Derp Universe API running on port ${port}`);
}

bootstrap();
