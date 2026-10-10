import { Inject, Injectable, Logger } from '@nestjs/common';
import { redactText, sanitizeUrl } from '../../common/sanitize';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { ApiLogService } from '../api-logs/api-log.service';
import { MetaApiError, networkError, parseMetaError } from './meta-error';

export type HttpMethod = 'GET' | 'POST' | 'DELETE';
export type QueryValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | readonly unknown[]
  | Record<string, unknown>;

export interface MetaRequest {
  method: HttpMethod;
  /** Path relative to the versioned base, e.g. `/123/phone_numbers`. Absolute URLs are allowed. */
  path: string;
  /** Access token. Omit only for endpoints that take credentials in the query (oauth). */
  token?: string;
  query?: Record<string, QueryValue>;
  /** JSON body. */
  body?: unknown;
  /** Multipart body (media and flow asset uploads). */
  form?: FormData;
  /** Raw binary body (Resumable Upload API). */
  binary?: { data: Buffer; headers: Record<string, string> };
  /** `Authorization` scheme. The Resumable Upload API uses `OAuth`. */
  authScheme?: 'Bearer' | 'OAuth';
  /**
   * Retry policy. GET/DELETE retry transient failures by default. POST retries only when the
   * caller says the operation is idempotent, and even then only for errors that guarantee Meta
   * did not execute it (rate limits).
   */
  retry?: 'auto' | 'never' | 'idempotent';
  /** Business id used to honor X-Business-Use-Case-Usage throttling. */
  throttleKey?: string;
  timeoutMs?: number;
  /** Skip the API log entry (debug_token calls during diagnostics are still logged). */
  skipLog?: boolean;
}

export interface MetaResponse<T> {
  data: T;
  status: number;
  traceId: string | null;
  durationMs: number;
}

export interface GraphPage<T> {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string; previous?: string };
  summary?: Record<string, unknown>;
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  previousCursor: string | null;
  summary?: Record<string, unknown>;
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80007, 80008, 130429, 131056]);

/**
 * The only place that talks HTTP to the Graph API.
 * Handles versioned URLs, auth, timeouts, retries with exponential backoff + jitter, error
 * normalization, cursor pagination, BUC throttling and sanitized request logging.
 */
@Injectable()
export class MetaGraphClient {
  private readonly logger = new Logger(MetaGraphClient.name);
  /** Business id → epoch ms until which Meta asked us to stop calling. */
  private readonly throttledUntil = new Map<string, number>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly apiLogs: ApiLogService,
  ) {}

  get apiVersion() {
    return this.env.META_GRAPH_API_VERSION;
  }

  get baseUrl() {
    return `${this.env.META_GRAPH_BASE_URL.replace(/\/$/, '')}/${this.env.META_GRAPH_API_VERSION}`;
  }

  buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(/^https?:\/\//.test(path) ? path : `${this.baseUrl}/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    return url.toString();
  }

  async request<T>(req: MetaRequest): Promise<MetaResponse<T>> {
    const maxRetries = this.env.META_GRAPH_MAX_RETRIES;
    const policy = req.retry ?? 'auto';
    let attempt = 0;

    for (;;) {
      this.assertNotThrottled(req.throttleKey);
      try {
        return await this.execute<T>(req);
      } catch (error) {
        if (!(error instanceof MetaApiError)) throw error;
        const retryable = this.shouldRetry(req.method, policy, error);
        if (!retryable || attempt >= maxRetries) throw error;
        const delay = this.backoff(attempt);
        this.logger.warn(
          `Retrying ${req.method} ${sanitizeUrl(req.path)} in ${delay} ms (attempt ${attempt + 1}/${maxRetries}): ${error.info.message}`,
        );
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
      }
    }
  }

  get<T>(path: string, token: string, query?: Record<string, QueryValue>, extra: Partial<MetaRequest> = {}) {
    return this.request<T>({ method: 'GET', path, token, query, ...extra }).then((r) => r.data);
  }

  post<T>(path: string, token: string, body?: unknown, extra: Partial<MetaRequest> = {}) {
    return this.request<T>({ method: 'POST', path, token, body, ...extra }).then((r) => r.data);
  }

  delete<T>(
    path: string,
    token: string,
    query?: Record<string, QueryValue>,
    extra: Partial<MetaRequest> = {},
  ) {
    return this.request<T>({ method: 'DELETE', path, token, query, ...extra }).then((r) => r.data);
  }

  /** One page of a cursor-paginated edge. */
  async page<T>(
    path: string,
    token: string,
    query: Record<string, QueryValue> & { limit?: number; after?: string; before?: string } = {},
    extra: Partial<MetaRequest> = {},
  ): Promise<PageResult<T>> {
    const res = await this.get<GraphPage<T>>(path, token, query, extra);
    return {
      items: res.data ?? [],
      nextCursor: res.paging?.next ? (res.paging.cursors?.after ?? null) : null,
      previousCursor: res.paging?.previous ? (res.paging.cursors?.before ?? null) : null,
      summary: res.summary,
    };
  }

  /** Walks every page, bounded by `maxItems` so a sync never loads unbounded data. */
  async collect<T>(
    path: string,
    token: string,
    query: Record<string, QueryValue> = {},
    {
      maxItems = 5000,
      pageSize = 100,
      ...extra
    }: Partial<MetaRequest> & { maxItems?: number; pageSize?: number } = {},
  ): Promise<{ items: T[]; truncated: boolean }> {
    const items: T[] = [];
    let after: string | undefined;
    do {
      const page = await this.page<T>(path, token, { ...query, limit: pageSize, after }, extra);
      items.push(...page.items);
      after = page.nextCursor ?? undefined;
    } while (after && items.length < maxItems);
    return { items: items.slice(0, maxItems), truncated: Boolean(after) };
  }

  /** Downloads a binary resource (media URLs). The token is required by Meta's media CDN. */
  async download(url: string, token: string): Promise<{ data: Buffer; contentType: string | null }> {
    const started = performance.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(this.env.META_GRAPH_TIMEOUT_MS * 3),
      });
    } catch (error) {
      throw new MetaApiError(networkError(error, this.env.META_GRAPH_TIMEOUT_MS * 3));
    }
    const durationMs = performance.now() - started;
    this.apiLogs.record({
      direction: 'OUTBOUND',
      method: 'GET',
      url: url.split('?')[0]!,
      statusCode: res.status,
      durationMs,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new MetaApiError(parseMetaError(res.status, safeJson(text), res.headers.get('x-fb-trace-id')));
    }
    return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') };
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private async execute<T>(req: MetaRequest): Promise<MetaResponse<T>> {
    const url = this.buildUrl(req.path, req.query);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (req.token) headers.Authorization = `${req.authScheme ?? 'Bearer'} ${req.token}`;

    let body: RequestInit['body'];
    if (req.form) body = req.form;
    else if (req.binary) {
      body = new Uint8Array(req.binary.data);
      Object.assign(headers, req.binary.headers);
    } else if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body);
    }

    const timeoutMs = req.timeoutMs ?? this.env.META_GRAPH_TIMEOUT_MS;
    const started = performance.now();
    let res: Response;
    try {
      res = await fetch(url, { method: req.method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const info = networkError(error, timeoutMs);
      this.log(req, url, null, performance.now() - started, undefined, info.metaCode, null);
      throw new MetaApiError(info);
    }
    const durationMs = performance.now() - started;
    const text = await res.text();
    const json = safeJson(text);
    const traceId = res.headers.get('x-fb-trace-id');
    this.trackUsage(res.headers.get('x-business-use-case-usage'));

    if (!res.ok || (json && typeof json === 'object' && 'error' in json)) {
      const info = parseMetaError(res.status, json ?? text, traceId);
      this.log(req, url, res.status, durationMs, json ?? text, info.metaCode, info.traceId);
      throw new MetaApiError(info);
    }

    this.log(req, url, res.status, durationMs, json, null, traceId);
    return { data: json as T, status: res.status, traceId, durationMs };
  }

  private log(
    req: MetaRequest,
    url: string,
    status: number | null,
    durationMs: number,
    responseBody: unknown,
    errorCode: number | null,
    traceId: string | null,
  ) {
    if (req.skipLog) return;
    const requestBody = req.form
      ? Object.fromEntries(
          [...req.form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `[file ${v.size} bytes]`]),
        )
      : req.binary
        ? `[binary ${req.binary.data.length} bytes]`
        : req.body;
    this.apiLogs.record({
      direction: 'OUTBOUND',
      method: req.method,
      url,
      statusCode: status,
      durationMs,
      requestBody,
      responseBody,
      errorCode,
      metaTraceId: traceId,
    });
    this.logger.debug(
      `${req.method} ${redactText(sanitizeUrl(url))} → ${status ?? 'ERR'} ${Math.round(durationMs)}ms`,
    );
  }

  private shouldRetry(method: HttpMethod, policy: MetaRequest['retry'], error: MetaApiError) {
    if (policy === 'never') return false;
    const { httpStatus, metaCode } = error.info;
    const rateLimited = httpStatus === 429 || (metaCode !== null && RATE_LIMIT_CODES.has(metaCode));
    if (method === 'POST') {
      // A rate-limited POST was rejected before execution; anything else may have run.
      return policy === 'idempotent' ? error.isTransient : rateLimited && metaCode !== 131056;
    }
    // Never hammer 4xx client errors, except rate limits and errors Meta marks as transient.
    if (httpStatus >= 400 && httpStatus < 500 && !rateLimited && !error.info.isTransient) return false;
    return error.isTransient;
  }

  /** Exponential backoff with full jitter: random(0, min(cap, base * 2^attempt)). */
  private backoff(attempt: number) {
    const base = 500;
    const cap = 8000;
    return Math.round(Math.random() * Math.min(cap, base * 2 ** attempt)) + 100;
  }

  private assertNotThrottled(key?: string) {
    if (!key) return;
    const until = this.throttledUntil.get(key);
    if (until && until > Date.now()) {
      throw new MetaApiError({
        ...parseMetaError(429, { error: { code: 80008, message: 'Business use case rate limit reached.' } }),
        userMessage: `Meta asked to pause calls for this business for ${Math.ceil((until - Date.now()) / 60000)} more minute(s).`,
        isTransient: false,
      });
    }
  }

  private trackUsage(header: string | null) {
    if (!header) return;
    const usage = safeJson(header) as Record<string, { estimated_time_to_regain_access?: number }[]> | null;
    if (!usage || typeof usage !== 'object') return;
    for (const [businessId, entries] of Object.entries(usage)) {
      const minutes = Math.max(0, ...(entries ?? []).map((e) => e.estimated_time_to_regain_access ?? 0));
      if (minutes > 0) this.throttledUntil.set(businessId, Date.now() + minutes * 60_000);
      else this.throttledUntil.delete(businessId);
    }
  }
}

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
