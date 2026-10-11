import * as React from 'react';
import { cn } from '../lib/cn';

export const controlClass = cn(
  'w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-fg shadow-xs',
  'placeholder:text-subtle transition-[border-color,box-shadow] duration-150',
  'hover:border-fg/25 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
  'disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20',
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(controlClass, 'h-8', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(controlClass, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor or nest the control
    <label ref={ref} className={cn('text-[13px] font-medium text-fg', className)} {...props} />
  ),
);
Label.displayName = 'Label';
