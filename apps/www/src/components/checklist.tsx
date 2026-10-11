import { cn } from '@wacc/ui';
import { CircleCheck, CircleDashed, CircleX, TriangleAlert } from 'lucide-react';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';

export interface Check {
  key: string;
  label: string;
  status: 'ok' | 'warning' | 'error' | 'skipped';
  detail: string;
  hint: string | null;
}

/** Readable diagnostic rows: label, status, detail and what to do about it. */
export function Checklist({
  checks,
  renderExtra,
}: {
  checks: Check[];
  renderExtra?: (c: Check) => React.ReactNode;
}) {
  useLocale();
  const icon = {
    ok: <CircleCheck className="size-4 text-success-text" aria-label={tr('OK')} />,
    warning: <TriangleAlert className="size-4 text-warning-text" aria-label={tr('Warning')} />,
    error: <CircleX className="size-4 text-danger-text" aria-label={tr('Error')} />,
    skipped: <CircleDashed className="size-4 text-subtle" aria-label={tr('Skipped')} />,
  };
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {checks.map((c) => (
        <li
          key={c.key}
          className="grid grid-cols-[20px_minmax(0,220px)_1fr] items-start gap-x-3 px-4 py-2.5 max-sm:grid-cols-[20px_1fr]"
        >
          <span className="mt-0.5">{icon[c.status]}</span>
          <span className="text-sm font-medium text-fg">{localizeText(c.label)}</span>
          <div className="min-w-0 max-sm:col-start-2">
            <p
              className={cn(
                'break-words text-[13px]',
                c.status === 'error' ? 'text-danger-text' : 'text-muted',
              )}
            >
              {tr(c.detail)}
            </p>
            {c.hint && <p className="mt-0.5 text-[13px] text-fg/80">{localizeText(c.hint)}</p>}
            {renderExtra?.(c)}
          </div>
        </li>
      ))}
    </ul>
  );
}
