import { Button, cn, Tooltip } from '@wacc/ui';
import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';

export function useCopy() {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }, []);
  return { copied, copy };
}

export function CopyButton({ value, label = tr('Copy') }: { value: string; label?: string }) {
  useLocale();
  const { copied, copy } = useCopy();
  return (
    <Tooltip content={copied ? tr('Copied') : label}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={localizeText(label)}
        onClick={() => copy(value)}
      >
        {copied ? <Check className="text-success-text" /> : <Copy />}
      </Button>
    </Tooltip>
  );
}

/** Monospace identifier with copy-on-click, e.g. Meta IDs, wamids, phone number IDs. */
export function IdChip({
  value,
  className,
  truncate = true,
}: {
  value: string | null | undefined;
  className?: string;
  truncate?: boolean;
}) {
  useLocale();
  const { copied, copy } = useCopy();
  if (!value) return <span className="text-subtle">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        copy(value);
      }}
      title={copied ? tr('Copied') : tr('Copy {0}', value)}
      className={cn(
        'group inline-flex max-w-full items-center gap-1 rounded px-1 -mx-1 font-mono text-xs text-muted transition-colors hover:bg-raised hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <span className={cn(truncate && 'truncate')}>{value}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-success-text" aria-hidden />
      ) : (
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? tr('Copied') : ''}
      </span>
    </button>
  );
}
