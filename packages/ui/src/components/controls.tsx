import { Check } from 'lucide-react';
import {
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioPrimitive,
  Switch as SwitchPrimitive,
  ToggleGroup,
} from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/cn';
import { localizeText, useLocale } from '../lib/i18n';

const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => {
  useLocale();
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-border-strong bg-surface shadow-xs transition-colors',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        focus,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = 'Checkbox';

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => {
  useLocale();
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong transition-colors',
        'data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
        focus,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = 'Switch';

export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioPrimitive.Root>
>(({ className, ...props }, ref) => {
  useLocale();
  return <RadioPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />;
});
RadioGroup.displayName = 'RadioGroup';

export const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioPrimitive.Item>
>(({ className, ...props }, ref) => {
  useLocale();
  return (
    <RadioPrimitive.Item
      ref={ref}
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-border-strong bg-surface shadow-xs',
        'data-[state=checked]:border-accent disabled:cursor-not-allowed disabled:opacity-50',
        focus,
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="flex items-center justify-center">
        <span className="size-2 rounded-full bg-accent" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Item>
  );
});
RadioGroupItem.displayName = 'RadioGroupItem';

interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; disabled?: boolean }[];
  'aria-label': string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Single-choice segmented control (period filters, Builder | JSON). */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  className,
  ...rest
}: SegmentedProps<T>) {
  useLocale();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-raised p-0.5',
        className,
      )}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[5px] px-2.5 font-medium text-muted transition-colors',
            size === 'sm' ? 'h-6 text-xs' : 'h-7 text-[13px]',
            'hover:text-fg data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-xs',
            'disabled:opacity-50 [&_svg]:size-3.5',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {localizeText(o.label)}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
