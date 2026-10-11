import { defineConfig } from '@playwright/test';
import { testDatabaseUrl } from '../../api/test/setup/global-db';
import baseConfig from '../playwright.config';

const apiPort = 3998;
const graphPort = 4011;
const webPort = 5175;

export default defineConfig({
  ...baseConfig,
  testDir: './',
  globalSetup: '../../api/test/setup/global-db.ts',
  use: { ...baseConfig.use, baseURL: `http://localhost:${webPort}` },
  webServer: [
    {
      command: 'node e2e/fake-graph.mjs',
      cwd: '..',
      port: graphPort,
      env: { FAKE_GRAPH_PORT: String(graphPort) },
      reuseExistingServer: false,
    },
    {
      command: 'node ../api/dist/main.js',
      cwd: '..',
      url: `http://localhost:${apiPort}/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        API_PORT: String(apiPort),
        API_PUBLIC_URL: `http://localhost:${apiPort}`,
        WEB_URL: `http://localhost:${webPort}`,
        DATABASE_URL: testDatabaseUrl(),
        AUTH_SECRET: 'playwright-auth-secret-0123456789-0123456789',
        SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
        META_GRAPH_API_VERSION: 'v26.0',
        META_GRAPH_BASE_URL: `http://localhost:${graphPort}`,
        META_APP_ID: '',
        META_APP_SECRET: '',
        META_WEBHOOK_VERIFY_TOKEN: 'playwright-verify-token',
      },
    },
    {
      command: `pnpm exec vite build --logLevel warn && pnpm exec vite preview --port ${webPort} --strictPort`,
      cwd: '..',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_API_PROXY_TARGET: `http://localhost:${apiPort}`, WEB_PORT: String(webPort) },
    },
  ],
});
