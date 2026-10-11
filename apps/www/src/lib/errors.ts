import { isApiRequestError } from '@wacc/api-client';
import { META_ERROR_HINTS, type MetaErrorInfo } from '@wacc/types';
import { t as tr } from '@/lib/i18n';

export interface DisplayError {
  title: string;
  message: string;
  code: string | null;
  status: number | null;
  requestId: string | null;
  meta: MetaErrorInfo | null;
  issues: { path: string; message: string }[];
}

/** Turns anything thrown by the API client into something a person can read. */
export function toDisplayError(error: unknown, fallbackTitle = tr('Something went wrong')): DisplayError {
  if (isApiRequestError(error)) {
    const { body, status } = error;
    const meta = body.meta ?? null;
    const hint = meta?.metaCode != null ? META_ERROR_HINTS[meta.metaCode] : undefined;
    let title = fallbackTitle;
    if (meta) title = meta.userTitle ?? (hint ? tr(hint.title) : tr('Meta rejected the request'));
    else if (body.code === 'VALIDATION_FAILED') title = tr('Check the highlighted fields');
    else if (body.code === 'FORBIDDEN') title = tr('Not allowed');
    else if (body.code === 'META_PERMISSION_MISSING') title = tr('Meta permission missing');
    else if (body.code === 'MANUAL_ACTION_REQUIRED') title = tr('Action needed in Meta Business Manager');
    else if (body.code === 'META_NOT_CONFIGURED') title = tr('Meta is not configured');
    else if (body.code === 'RATE_LIMITED') title = tr('Slow down');
    else if (body.code === 'NETWORK_ERROR') title = tr('Connection problem');
    else if (status === 404) title = tr('Not found');
    return {
      title,
      message: meta ? (meta.userMessage ?? meta.message) : tr(body.message),
      code: meta?.metaCode != null ? String(meta.metaCode) : body.code,
      status,
      requestId: body.requestId ?? null,
      meta,
      issues: (body.issues ?? []).map((issue) => ({ ...issue, message: tr(issue.message) })),
    };
  }
  return {
    title: fallbackTitle,
    message: error instanceof Error ? tr(error.message) : tr('Unexpected error.'),
    code: null,
    status: null,
    requestId: null,
    meta: null,
    issues: [],
  };
}

export function isNotFound(error: unknown) {
  return isApiRequestError(error) && error.status === 404;
}
