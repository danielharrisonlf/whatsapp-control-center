import { buttonVariants, cn } from '@wacc/ui';
import { ExternalLink, Info, Lock, PlugZap } from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useOrg } from '@/lib/org';

/**
 * For operations Meta does not expose through the API. Never simulate them.
 */
export function ManualActionNotice({
  children,
  href,
  linkLabel = tr('Open WhatsApp Manager'),
  className,
}: {
  children?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  useLocale();
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-border bg-raised px-3.5 py-3 text-[13px]',
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium text-fg">{tr('This action must be completed in Meta Business Manager.')}</p>
        {children && <div className="mt-0.5 text-muted">{children}</div>}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
          >
            {linkLabel} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

/** Shown when the token lacks the Meta permission an action needs. */
export function PermissionNotice({
  permission,
  children,
}: {
  permission: string;
  children?: React.ReactNode;
}) {
  useLocale();
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-3 text-[13px]">
      <Lock className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
      <div>
        <p className="font-medium text-fg">
          <code className="font-mono text-xs">{permission}</code> {tr('permission missing')}
        </p>
        <p className="mt-0.5 text-fg/80">
          {children ??
            tr(
              'Grant it to the system user token (or reconnect with Embedded Signup), then run diagnostics again.',
            )}
        </p>
      </div>
    </div>
  );
}

/** Empty state for pages that need a Meta connection first. */
export function ConnectFirst({ what }: { what: string }) {
  useLocale();
  const { orgId } = useOrg();
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-raised text-muted">
        <PlugZap className="size-5" />
      </div>
      <p className="text-sm font-medium text-fg">
        {tr('Connect WhatsApp to see')} {tr(what)}
      </p>
      <p className="mt-1 max-w-[48ch] text-[13px] text-muted">
        {tr('Link a Meta app and WhatsApp Business Account. Everything here is loaded from the Graph API.')}
      </p>
      <Link to={orgPath(orgId, 'connect')} className={cn(buttonVariants({ variant: 'primary' }), 'mt-4')}>
        {tr('Connect WhatsApp')}
      </Link>
    </div>
  );
}

export const META_LINKS = {
  whatsappManager: 'https://business.facebook.com/wa/manage/home/',
  phoneNumbers: 'https://business.facebook.com/wa/manage/phone-numbers/',
  templates: 'https://business.facebook.com/wa/manage/message-templates/',
  businessSettings: 'https://business.facebook.com/settings/',
  systemUsers: 'https://business.facebook.com/settings/system-users',
  appDashboard: 'https://developers.facebook.com/apps/',
  payment: 'https://business.facebook.com/billing_hub/payment_settings/',
};
