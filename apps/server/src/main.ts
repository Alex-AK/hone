import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { serveWebApp } from './common/web-app';

const PORT = Number(process.env.PORT ?? 3001);
const WEB_DIST = process.env.WEB_DIST;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  // Vite proxies /api, but allow direct calls during debugging.
  app.enableCors({ origin: true });
  app.enableShutdownHooks();

  if (WEB_DIST) serveWebApp(app, WEB_DIST);

  await app.listen(PORT);
  new Logger('Bootstrap').log(`Hone API listening on http://localhost:${PORT}/api`);
}

void bootstrap();
