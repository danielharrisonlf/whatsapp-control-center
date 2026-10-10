/**
 * Writes apps/api/openapi.json without a database or Meta credentials.
 * Used by `pnpm api:generate` to regenerate packages/api-client.
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';

process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.AUTH_SECRET ??= 'openapi-export-placeholder-secret-0000000000';
process.env.SECRETS_ENCRYPTION_KEY ??= Buffer.alloc(32).toString('base64');
process.env.META_GRAPH_API_VERSION ??= 'v26.0';

async function main() {
  const { AppModule } = await import('../src/app.module');
  const { createOpenApiDocument } = await import('../src/openapi');
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  const document = createOpenApiDocument(app);
  const target = join(__dirname, '..', 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI written to ${target}`);
}

void main();
