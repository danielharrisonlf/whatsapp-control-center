import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from '../api/test/setup/global-db';

/**
 * Critical UI flows against the real API and PostgreSQL (test database). The Graph API is the
 * test-only fake server in e2e/fake-graph.mjs. Requires `pnpm --filter @wacc/api build` first.
 */
const API_PORT = 3998;
const WEB_PORT = 5174;
const FAKE_GRAPH_PORT = 4011;

export default defineConfig({
  testDir: './e2e',
  globalSetup: '../api/test/setup/global-db.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'node e2e/fake-graph.mjs',
      port: FAKE_GRAPH_PORT,
      env: { FAKE_GRAPH_PORT: String(FAKE_GRAPH_PORT) },
      reuseExistingServer: false,
    },
    {
      command: 'node ../api/dist/main.js',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        API_PORT: String(API_PORT),
        API_PUBLIC_URL: `http://localhost:${API_PORT}`,
        WEB_URL: `http://localhost:${WEB_PORT}`,
        DATABASE_URL: testDatabaseUrl(),
        AUTH_SECRET: 'playwright-auth-secret-0123456789-0123456789',
        SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
        META_GRAPH_API_VERSION: 'v26.0',
        META_GRAPH_BASE_URL: `http://localhost:${FAKE_GRAPH_PORT}`,
        META_APP_ID: '',
        META_APP_SECRET: '',
        META_WEBHOOK_VERIFY_TOKEN: 'playwright-verify-token',
      },
    },
    {
      // A production build: no dev-server reloads while dependencies are optimized.
      command: `pnpm exec vite build --logLevel warn && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}`, WEB_PORT: String(WEB_PORT) },
    },
  ],
});
