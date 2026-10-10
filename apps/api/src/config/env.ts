import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** Public base URL of the API, used to show webhook callback URLs. */
  API_PUBLIC_URL: z.url().default('http://localhost:3000'),
  /** Frontend origin, used for CORS and CSRF origin checks. */
  WEB_URL: z.url().default('http://localhost:5173'),
  /**
   * Path prefix under which the browser reaches this API through the web origin
   * (the Vite dev server and the production reverse proxy forward `/api/*` here).
   */
  BROWSER_API_BASE_PATH: z.string().startsWith('/').default('/api'),
  DATABASE_URL: z.string().min(1),

  /** Secret for signing access tokens. At least 32 characters. */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must have at least 32 characters'),
  AUTH_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Allow self-service sign up. Disable in production after creating the first owner. */
  AUTH_ALLOW_SIGNUP: booleanString.default(true),

  /** Base64-encoded 32-byte key for AES-256-GCM. Generate with `openssl rand -base64 32`. */
  SECRETS_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'SECRETS_ENCRYPTION_KEY must be 32 bytes, base64'),
  /** Key identifier stored with each ciphertext, to support key rotation. */
  SECRETS_ENCRYPTION_KEY_ID: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default('k1'),

  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'Use the format vXX.X, e.g. v26.0'),
  META_GRAPH_BASE_URL: z.url().default('https://graph.facebook.com'),
  META_GRAPH_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  META_GRAPH_MAX_RETRIES: z.coerce.number().int().min(0).max(6).default(3),

  /** Platform Meta app (used by Embedded Signup and the platform webhook endpoint). */
  META_APP_ID: z.string().optional().default(''),
  META_APP_SECRET: z.string().optional().default(''),
  /** Facebook Login for Business configuration ID for Embedded Signup. */
  META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().optional().default(''),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional().default(''),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Persist sanitized request/response bodies in API logs. */
  API_LOG_BODIES: booleanString.default(true),
  TRUST_PROXY: booleanString.default(false),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
