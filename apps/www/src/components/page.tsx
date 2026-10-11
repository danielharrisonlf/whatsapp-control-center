import { cn } from '@wacc/ui';
import { ChevronRight } from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
  meta?: React.ReactNode;
}

export function PageHeader({ title, description, actions, breadcrumbs, meta }: PageHeaderProps) {
  useLocale();
  return (
    <header className="flex flex-col gap-3 border-b border-border px-6 pb-4 pt-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label={tr('Breadcrumb')}
            className="mb-1.5 flex items-center gap-1 text-[13px] text-subtle"
          >
            {breadcrumbs.map((b, i) => (
              <span key={b.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
                {b.to ? (
                  <Link to={b.to} className="hover:text-fg">
                    {b.label}
                  </Link>
                ) : (
                  <span aria-current="page">{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-sm text-muted">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  useLocale();
  return <div className={cn('px-6 py-5', className)}>{children}</div>;
}

/** A titled region inside a page. Flat, no card chrome unless `framed`. */
export function Section({
  title,
  description,
  actions,
  framed,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  framed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  useLocale();
  return (
    <section className={cn('min-w-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {framed ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">{children}</div>
      ) : (
        children
      )}
    </section>
  );
}

/** Two-column definition list for resource details. */
export function DetailList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; hint?: string }[];
  className?: string;
}) {
  useLocale();
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 sm:grid-cols-[minmax(140px,180px)_1fr]', className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt
            className="border-b border-border py-2.5 text-[13px] text-muted sm:border-b"
            title={localizeText(item.hint)}
          >
            {localizeText(item.label)}
          </dt>
          <dd className="min-w-0 border-b border-border py-2.5 text-sm text-fg">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
