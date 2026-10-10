import 'reflect-metadata';
import { Logger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { type Env, loadEnv } from './config/env';
import { loadDotenv } from './config/load-dotenv';
import { createOpenApiDocument } from './openapi';

const LOG_LEVELS: Record<Env['LOG_LEVEL'], LogLevel[]> = {
  fatal: ['fatal'],
  error: ['fatal', 'error'],
  warn: ['fatal', 'error', 'warn'],
  info: ['fatal', 'error', 'warn', 'log'],
  debug: ['fatal', 'error', 'warn', 'log', 'debug'],
  trace: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
};

async function bootstrap() {
  loadDotenv();
  const env = loadEnv();
  // rawBody keeps the exact bytes Meta signed (X-Hub-Signature-256 is computed over them).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: false,
    logger: LOG_LEVELS[env.LOG_LEVEL],
  });
  app.useBodyParser('json', { limit: '5mb' });
  if (env.TRUST_PROXY) app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({ origin: [env.WEB_URL], credentials: true });
  app.enableShutdownHooks();

  SwaggerModule.setup('docs', app, createOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(env.API_PORT, '0.0.0.0');
  Logger.log(
    `API listening on :${env.API_PORT} · docs at ${env.API_PUBLIC_URL}/docs · Graph API ${env.META_GRAPH_API_VERSION}`,
    'Bootstrap',
  );
}

void bootstrap();
