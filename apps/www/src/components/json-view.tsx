import { cn } from '@wacc/ui';
import * as React from 'react';
import { t as tr, useLocale } from '@/lib/i18n';
import { CopyButton } from './copy';

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Read-only, syntax-highlighted JSON. Values are rendered as text, never as HTML. */
export function JsonView({
  value,
  maxHeight = 420,
  className,
  copy = true,
}: {
  value: unknown;
  maxHeight?: number;
  className?: string;
  copy?: boolean;
}) {
  useLocale();
  const text = React.useMemo(
    () => (typeof value === 'string' ? value : JSON.stringify(value, null, 2)) ?? 'undefined',
    [value],
  );
  const parts = React.useMemo(() => {
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN)) {
      const i = m.index ?? 0;
      if (i > last) out.push(text.slice(last, i));
      if (m[1]) {
        out.push(
          <span key={i} className={m[2] ? 'text-fg' : 'text-accent-text'}>
            {m[1]}
          </span>,
        );
        if (m[2]) out.push(m[2]);
      } else if (m[3]) {
        out.push(
          <span key={i} className="text-info-text">
            {m[3]}
          </span>,
        );
      } else if (m[4]) {
        out.push(
          <span key={i} className="text-warning-text">
            {m[4]}
          </span>,
        );
      }
      last = i + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text]);

  return (
    <div className={cn('group relative rounded-md border border-border bg-raised', className)}>
      {copy && (
        <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <CopyButton value={text} label={tr('Copy JSON')} />
        </div>
      )}
      <pre className="overflow-auto p-3 font-mono text-xs leading-relaxed text-muted" style={{ maxHeight }}>
        <code>{parts}</code>
      </pre>
    </div>
  );
}
