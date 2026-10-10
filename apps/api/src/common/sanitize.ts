/**
 * Redaction for anything that leaves the request: logs, API logs, audit metadata, error `raw`.
 * Keys are matched case-insensitively after removing `_` and `-`.
 */
const SENSITIVE_KEYS = new Set(
  [
    'access_token',
    'accessToken',
    'input_token',
    'client_secret',
    'app_secret',
    'appSecret',
    'secret',
    'password',
    'currentPassword',
    'newPassword',
    'pin',
    'code',
    'verify_token',
    'verifyToken',
    'hub.verify_token',
    'authorization',
    'cookie',
    'set-cookie',
    'refresh_token',
    'refreshToken',
    'token',
    'otp',
    'signature_hash',
  ].map(normalize),
);

function normalize(key: string) {
  return key.toLowerCase().replace(/[_\-.]/g, '');
}

export const REDACTED = '[REDACTED]';

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalize(key));
}

/** Matches Meta tokens (`EAA...`) and bearer headers embedded in free text. */
const TOKEN_IN_TEXT = /\b(EAA[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._~+/-]{16,}=*)/g;

export function redactText(text: string): string {
  return text.replace(TOKEN_IN_TEXT, REDACTED);
}

export function sanitize<T>(value: T, depth = 0): T {
  if (depth > 12) return '[TRUNCATED]' as unknown as T;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1)) as unknown as T;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]` as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Numbers and booleans are kept: Meta error objects use a numeric `code`.
      const keep = typeof v === 'number' || typeof v === 'boolean' || v === null;
      out[k] = isSensitiveKey(k) && !keep ? REDACTED : sanitize(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Redacts sensitive query parameters in a URL (keeps the rest for debugging). */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://placeholder.local');
    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveKey(key)) parsed.searchParams.set(key, REDACTED);
    }
    const result =
      parsed.origin === 'http://placeholder.local' ? parsed.pathname + parsed.search : parsed.toString();
    return decodeURIComponent(result);
  } catch {
    return redactText(url);
  }
}

/** Truncates large JSON bodies before storing them in logs. */
export function truncateJson(value: unknown, maxBytes = 16_384): unknown {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) return undefined;
  if (text.length <= maxBytes) return value;
  return { _truncated: true, _bytes: text.length, preview: text.slice(0, maxBytes) };
}
