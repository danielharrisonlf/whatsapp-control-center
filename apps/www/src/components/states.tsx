import type { MetaErrorInfo } from '@wacc/types';
import { Button, cn, Skeleton } from '@wacc/ui';
import { ChevronRight, CircleAlert, RotateCw, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { type DisplayError, toDisplayError } from '@/lib/errors';
import { t as tr, useLocale } from '@/lib/i18n';
import { JsonView } from './json-view';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  useLocale();
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-raised text-muted">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-[52ch] text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Expandable technical details for Meta and API errors. */
export function TechnicalDetails({ error }: { error: DisplayError }) {
  useLocale();
  const [open, setOpen] = React.useState(false);
  const rows = [
    error.meta?.metaCode != null && [
      tr('Meta code'),
      `${error.meta.metaCode}${error.meta.metaSubcode ? ` / ${error.meta.metaSubcode}` : ''}`,
    ],
    error.meta?.type && [tr('Type'), error.meta.type],
    error.meta?.details && [tr('Details'), error.meta.details],
    error.meta?.traceId && ['fbtrace_id', error.meta.traceId],
    error.meta && [tr('HTTP from Meta'), String(error.meta.httpStatus || tr('no response'))],
    error.status != null && ['HTTP', String(error.status)],
    error.code && !error.meta && [tr('Code'), error.code],
    error.requestId && [tr('Request ID'), error.requestId],
  ].filter(Boolean) as [string, string][];
  if (rows.length === 0 && !error.meta?.raw) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
        {tr('Technical details')}
      </button>
      {open && (
        <div className="mt-2 grid gap-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="break-all font-mono text-xs text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          {error.meta?.raw != null && <JsonView value={error.meta.raw} maxHeight={220} />}
        </div>
      )}
    </div>
  );
}

/** Inline error panel. `compact` fits inside forms and dialogs. */
export function ErrorPanel({
  error,
  title,
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  useLocale();
  const display = toDisplayError(error, title);
  return (
    <div
      role="alert"
      className={cn('rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-3', className)}
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">{title ?? display.title}</p>
          <p className="mt-0.5 text-[13px] text-fg/80">{display.message}</p>
          {display.issues.length > 0 && (
            <ul className="mt-1.5 list-disc pl-4 text-[13px] text-fg/80">
              {display.issues.map((i) => (
                <li key={`${i.path}:${i.message}`}>
                  {i.path && <code className="font-mono text-xs">{i.path}</code>} {i.message}
                </li>
              ))}
            </ul>
          )}
          <TechnicalDetails error={display} />
        </div>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <RotateCw /> {tr('Retry')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Full-region error state for failed page loads. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  useLocale();
  return (
    <div className={cn('px-6 py-8', className)}>
      <ErrorPanel error={error} onRetry={onRetry} title={tr('This page could not be loaded')} />
    </div>
  );
}

/** Some data loaded, some failed: show what we have plus this banner. */
export function PartialErrorBanner({ children }: { children: React.ReactNode }) {
  useLocale();
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[13px] text-fg"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  useLocale();
  return (
    <div role="status" aria-busy="true" aria-label={tr('Loading')} className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows
        <div key={r} className="flex h-11 items-center gap-4 px-4">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholder cells
              key={c}
              className={cn('h-3.5', c === 0 ? 'w-40' : 'w-20', c === columns - 1 && 'ml-auto w-14')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  useLocale();
  return (
    <div role="status" aria-busy="true" aria-label={tr('Loading')} className={cn('grid gap-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder lines
        <Skeleton key={i} className={cn('h-4', i % 3 === 2 ? 'w-1/2' : 'w-full')} />
      ))}
    </div>
  );
}

/** "Load more" for cursor-paginated lists. */
export function LoadMore({
  hasMore,
  loading,
  onLoad,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
}) {
  useLocale();
  if (!hasMore) return null;
  return (
    <div className="flex justify-center border-t border-border py-3">
      <Button variant="ghost" size="sm" loading={loading} onClick={onLoad}>
        {tr('Load more')}
      </Button>
    </div>
  );
}

export function metaDisplay(error: MetaErrorInfo): DisplayError {
  return {
    title: error.userTitle ?? tr('Meta rejected the request'),
    message: error.userMessage ?? error.message,
    code: error.metaCode != null ? String(error.metaCode) : null,
    status: null,
    requestId: null,
    meta: error,
    issues: [],
  };
}

/** For Meta errors returned inside a successful response (e.g. a send result). */
export function MetaErrorPanel({ error, className }: { error: MetaErrorInfo; className?: string }) {
  useLocale();
  const display = metaDisplay(error);
  return (
    <div
      role="alert"
      className={cn('rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-3', className)}
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">
            {display.title}
            {display.code && (
              <span className="ml-1.5 font-mono text-xs font-normal text-muted">#{display.code}</span>
            )}
          </p>
          <p className="mt-0.5 text-[13px] text-fg/80">{display.message}</p>
          {error.message !== display.message && (
            <p className="mt-0.5 text-[13px] text-muted">{error.message}</p>
          )}
          <TechnicalDetails error={display} />
        </div>
      </div>
    </div>
  );
}
