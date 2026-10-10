import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadDotenv } from '../../src/config/load-dotenv';

/**
 * Integration and e2e tests run against a real PostgreSQL database dedicated to tests
 * (`<db>_test`, created next to the development database by `prisma migrate deploy`).
 */
export function testDatabaseUrl() {
  loadDotenv();
  const base = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL (or DATABASE_URL_TEST) to run integration tests.');
  if (process.env.DATABASE_URL_TEST) return base;
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  return url.toString();
}

export default async function setup() {
  const url = testDatabaseUrl();
  const dbName = new URL(url).pathname.slice(1);
  // Safety net: never wipe anything that is not explicitly a test database.
  if (!dbName.endsWith('_test'))
    throw new Error(`Refusing to use "${dbName}" for tests: the name must end with _test.`);

  const cwd = resolve(__dirname, '../..');
  execSync('npx prisma migrate deploy', { cwd, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });

  const prisma = new PrismaClient({ datasourceUrl: url });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} CASCADE`,
    );
  }
  await prisma.$disconnect();
}
