import { HttpStatus } from '@nestjs/common';
import { META_ERROR_HINTS, META_TRANSIENT_CODES, type MetaErrorInfo } from '@wacc/types';
import { sanitize } from '../../common/sanitize';

/**
 * Error returned by the Graph API (or a network failure talking to it).
 * https://developers.facebook.com/docs/graph-api/guides/error-handling
 */
export class MetaApiError extends Error {
  constructor(readonly info: MetaErrorInfo) {
    super(info.message);
    this.name = 'MetaApiError';
  }

  get isTransient() {
    return this.info.isTransient;
  }

  /** HTTP status our API should answer with when this error bubbles up. */
  get responseStatus(): HttpStatus {
    const { httpStatus, metaCode } = this.info;
    if (httpStatus === 0) return HttpStatus.BAD_GATEWAY;
    if (metaCode === 190) return HttpStatus.UNPROCESSABLE_ENTITY; // Meta token, not our session.
    if (
      httpStatus === 429 ||
      (metaCode !== null && [4, 17, 80007, 80008, 130429, 131056].includes(metaCode))
    ) {
      return HttpStatus.TOO_MANY_REQUESTS;
    }
    if (httpStatus >= 500) return HttpStatus.BAD_GATEWAY;
    if (httpStatus === 401) return HttpStatus.UNPROCESSABLE_ENTITY;
    if (httpStatus === 403) return HttpStatus.FORBIDDEN;
    if (httpStatus === 404) return HttpStatus.NOT_FOUND;
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    error_data?: { details?: string } | string;
    is_transient?: boolean;
    fbtrace_id?: string;
  };
}

export function parseMetaError(
  httpStatus: number,
  body: unknown,
  traceHeader?: string | null,
): MetaErrorInfo {
  const err = (body as GraphErrorBody | null)?.error;
  const metaCode = typeof err?.code === 'number' ? err.code : null;
  const details = typeof err?.error_data === 'string' ? err.error_data : (err?.error_data?.details ?? null);
  const hint = metaCode !== null ? META_ERROR_HINTS[metaCode] : undefined;
  const message =
    err?.message ??
    (typeof body === 'string' && body ? body.slice(0, 300) : `Meta returned HTTP ${httpStatus}`);

  return {
    httpStatus,
    metaCode,
    metaSubcode: typeof err?.error_subcode === 'number' ? err.error_subcode : null,
    type: err?.type ?? null,
    message,
    userTitle: err?.error_user_title ?? hint?.title ?? null,
    userMessage: err?.error_user_msg ?? hint?.hint ?? null,
    details,
    traceId: err?.fbtrace_id ?? traceHeader ?? null,
    isTransient:
      err?.is_transient === true ||
      (metaCode !== null && META_TRANSIENT_CODES.has(metaCode)) ||
      httpStatus === 429 ||
      (httpStatus >= 500 && metaCode === null),
    raw: sanitize(body),
  };
}

export function networkError(error: unknown, timeoutMs: number): MetaErrorInfo {
  const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
  const message = isTimeout
    ? `Meta did not respond within ${timeoutMs} ms.`
    : `Could not reach the Graph API: ${error instanceof Error ? error.message : String(error)}`;
  return {
    httpStatus: 0,
    metaCode: null,
    metaSubcode: null,
    type: isTimeout ? 'Timeout' : 'NetworkError',
    message,
    userTitle: isTimeout ? 'Meta timed out' : 'Meta unreachable',
    userMessage:
      'The request did not reach Meta or no response arrived. It is safe to retry read operations.',
    details: null,
    traceId: null,
    isTransient: true,
    raw: null,
  };
}
