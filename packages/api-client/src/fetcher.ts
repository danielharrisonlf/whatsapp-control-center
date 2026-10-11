import type { ApiErrorBody } from '@wacc/types';

let baseUrl = '/api';

/** Where the browser reaches the API (the web origin proxies `/api/*`). */
export function setApiBaseUrl(url: string) {
  baseUrl = url.replace(/\/$/, '');
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiRequestError';
  }

  get code() {
    return this.body.code;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Called when the session cannot be refreshed (the app redirects to /login). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler;
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh: concurrent 401s share one call to /auth/refresh. */
function refreshSession() {
  refreshing ??= fetch(`${baseUrl}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    });
  return refreshing;
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

async function toError(res: Response): Promise<ApiRequestError> {
  const text = await res.text().catch(() => '');
  let body: ApiErrorBody;
  try {
    body = JSON.parse(text) as ApiErrorBody;
  } catch {
    body = {
      statusCode: res.status,
      error: res.statusText,
      code: res.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN',
      message: res.status === 0 ? 'Could not reach the server.' : `Request failed with HTTP ${res.status}.`,
    };
  }
  return new ApiRequestError(res.status, body);
}

/**
 * Mutator used by every generated hook: cookies (`credentials: include`), JSON handling,
 * transparent session refresh and typed `ApiError`s.
 */
export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const request = () =>
    fetch(`${baseUrl}${url}`, {
      ...options,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    });

  let res: Response;
  try {
    res = await request();
  } catch {
    throw new ApiRequestError(0, {
      statusCode: 0,
      error: 'Network error',
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection.',
    });
  }

  if (res.status === 401 && !NO_REFRESH.some((p) => url.startsWith(p))) {
    if (await refreshSession()) res = await request();
    if (res.status === 401) {
      onUnauthorized?.();
      throw await toError(res);
    }
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;

  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return (await res.json()) as T;
  if (type.startsWith('text/')) return (await res.text()) as T;
  return (await res.blob()) as T;
}

export default apiFetch;
