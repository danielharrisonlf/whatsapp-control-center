import { testDatabaseUrl } from './global-db';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'test-auth-secret-0123456789-0123456789-abcdef';
process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.META_GRAPH_API_VERSION = 'v26.0';
process.env.META_GRAPH_MAX_RETRIES = '1';
process.env.API_PUBLIC_URL = 'http://localhost:3999';
process.env.WEB_URL = 'http://localhost:5173';
process.env.META_APP_ID = '';
process.env.META_APP_SECRET = '';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'platform-verify-token';
process.env.LOG_LEVEL = 'error';
