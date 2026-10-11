import { cva, type VariantProps } from 'class-variance-authority';
import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/cn';
import { useLocale } from '../lib/i18n';

// ─── Badge ───────────────────────────────────────────────────────────────────

export const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-1.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-raised text-muted ring-1 ring-inset ring-border',
        success: 'bg-success-soft text-success-text',
        warning: 'bg-warning-soft text-warning-text',
        danger: 'bg-danger-soft text-danger-text',
        info: 'bg-info-soft text-info-text',
        accent: 'bg-accent-soft text-accent-text',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const dotTone: Record<string, string> = {
  neutral: 'bg-subtle',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  useLocale();
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dotTone[tone ?? 'neutral'])} />}
      {children}
    </span>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  useLocale();
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-sunken', className)} {...props} />;
}

// ─── Separator & Kbd ─────────────────────────────────────────────────────────

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  useLocale();
  return (
    <hr
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cn('border-0 bg-border', vertical ? 'h-auto w-px self-stretch' : 'h-px w-full', className)}
    />
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  useLocale();
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-raised px-1 font-sans text-[11px] font-medium text-muted',
        className,
      )}
      {...props}
    />
  );
}

// ─── Tabs (underline) ────────────────────────────────────────────────────────

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  useLocale();
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('flex items-center gap-4 overflow-x-auto border-b border-border', className)}
      {...props}
    />
  );
});
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  useLocale();
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        '-mb-px inline-flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-0.5 text-sm font-medium text-muted transition-colors',
        'hover:text-fg data-[state=active]:border-fg data-[state=active]:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

// ─── Table ───────────────────────────────────────────────────────────────────

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  useLocale();
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  useLocale();
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  useLocale();
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  useLocale();
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors data-[interactive=true]:cursor-pointer data-[interactive=true]:hover:bg-raised data-[selected=true]:bg-raised',
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  useLocale();
  return (
    <th
      className={cn(
        'h-8 whitespace-nowrap px-3 text-left align-middle text-xs font-medium text-subtle first:pl-6 last:pr-6',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  useLocale();
  return <td className={cn('h-11 px-3 align-middle first:pl-6 last:pr-6', className)} {...props} />;
}
