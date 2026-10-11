import * as React from 'react';
import { cn } from '../lib/cn';
import { localizeText, t as tr, useLocale } from '../lib/i18n';
import { Label } from './input';

interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  /** Right side of the label row, e.g. a character counter. */
  aside?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error, with the ids wired for screen readers. */
export function Field({ label, htmlFor, hint, error, aside, optional, className, children }: FieldProps) {
  useLocale();
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>
          {localizeText(label)}
          {optional && <span className="ml-1 font-normal text-subtle">{tr('optional')}</span>}
        </Label>
        {aside}
      </div>
      {control}
      {error ? (
        <p id={errorId} className="text-[13px] text-danger-text" role="alert">
          {tr(error)}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-muted">
          {localizeText(hint)}
        </p>
      ) : null}
    </div>
  );
}

/** `12/60` counter that turns red past the limit. */
export function CharCount({ value, max }: { value: number; max: number }) {
  useLocale();
  const over = value > max;
  return (
    <span
      className={cn('font-mono text-xs tabular-nums', over ? 'text-danger-text' : 'text-subtle')}
      aria-live="polite"
    >
      {value}/{max}
    </span>
  );
}
