import { X } from 'lucide-react';
import {
  AlertDialog as AlertPrimitive,
  Dialog as DialogPrimitive,
  Popover as PopoverPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/cn';
import { t as tr, useLocale } from '../lib/i18n';
import { buttonVariants } from './button';

const overlayClass = 'fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in-fade';

// ─── Dialog ──────────────────────────────────────────────────────────────────

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: 'sm' | 'md' | 'lg' }
>(({ className, children, size = 'md', ...props }, ref) => {
  useLocale();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-[12vh] z-50 grid max-h-[80vh] w-[calc(100vw-2rem)] -translate-x-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-overlay',
          'data-[state=open]:animate-in-pop focus:outline-none',
          size === 'sm' && 'max-w-md',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-2xl',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 rounded-md p-1 text-subtle transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={tr('Close')}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  useLocale();
  return <div className={cn('grid gap-1 pr-6', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  useLocale();
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  useLocale();
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-base font-semibold text-fg', className)}
      {...props}
    />
  );
});
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  useLocale();
  return <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted', className)} {...props} />;
});
DialogDescription.displayName = 'DialogDescription';

// ─── Sheet (side panel) ──────────────────────────────────────────────────────

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: 'left' | 'right'; width?: string }
>(({ className, children, side = 'right', width = 'w-[min(640px,100vw)]', ...props }, ref) => {
  useLocale();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed inset-y-0 z-50 flex flex-col border-border bg-surface shadow-overlay focus:outline-none',
          side === 'right'
            ? 'right-0 border-l data-[state=open]:animate-in-right'
            : 'left-0 border-r data-[state=open]:animate-in-left',
          width,
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 rounded-md p-1 text-subtle transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={tr('Close')}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
SheetContent.displayName = 'SheetContent';
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;

// ─── Alert dialog (destructive confirmations) ────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What exactly will be affected. Never just "Are you sure?". */
  description: React.ReactNode;
  consequences?: React.ReactNode[];
  confirmLabel: string;
  onConfirm: () => unknown;
  loading?: boolean;
  tone?: 'danger' | 'default';
  /** Require typing this value before confirming (irreversible actions). */
  confirmText?: string;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel,
  onConfirm,
  loading,
  tone = 'danger',
  confirmText,
  children,
}: ConfirmDialogProps) {
  useLocale();
  const [typed, setTyped] = React.useState('');
  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);
  const blocked = confirmText !== undefined && typed !== confirmText;
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlayClass} />
        <AlertPrimitive.Content className="fixed left-1/2 top-[14vh] z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 gap-4 rounded-xl border border-border bg-surface p-5 shadow-overlay data-[state=open]:animate-in-pop focus:outline-none">
          <div className="grid gap-1.5">
            <AlertPrimitive.Title className="text-base font-semibold text-fg">{title}</AlertPrimitive.Title>
            <AlertPrimitive.Description asChild>
              <div className="grid gap-2 text-sm text-muted">{description}</div>
            </AlertPrimitive.Description>
          </div>
          {consequences && consequences.length > 0 && (
            <ul className="grid gap-1.5 rounded-lg border border-border bg-raised px-3 py-2.5 text-[13px] text-fg">
              {consequences.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-subtle" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
          {children}
          {confirmText !== undefined && (
            <label className="grid gap-1.5 text-[13px] text-muted">
              <span>
                {tr('Type')} <code className="rounded bg-raised px-1 font-mono text-fg">{confirmText}</code>{' '}
                {tr('to confirm')}
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-sm text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertPrimitive.Cancel className={buttonVariants({ variant: 'secondary' })}>
              {tr('Cancel')}
            </AlertPrimitive.Cancel>
            <button
              type="button"
              className={buttonVariants({ variant: tone === 'danger' ? 'danger' : 'primary' })}
              disabled={blocked || loading}
              aria-busy={loading || undefined}
              onClick={async (e) => {
                e.preventDefault();
                await onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}

// ─── Popover & tooltip ───────────────────────────────────────────────────────

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, ...props }, ref) => {
  useLocale();
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-lg border border-border bg-overlay p-3 text-sm text-fg shadow-overlay data-[state=open]:animate-in-pop focus:outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = 'PopoverContent';

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  useLocale();
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-md bg-fg px-2 py-1 text-xs text-surface shadow-overlay data-[state=delayed-open]:animate-in-fade"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
