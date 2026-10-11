import { useGetDashboard, useListConnections } from '@wacc/api-client';
import { MESSAGING_LIMIT_TIERS } from '@wacc/types';
import { Badge, buttonVariants, cn, Skeleton } from '@wacc/ui';
import { ArrowRight, MessageSquareDashed, PlugZap } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { PeriodFilter, type PeriodValue, TimeSeriesChart } from '@/components/charts';
import { PageBody, PageHeader, Section } from '@/components/page';
import { EmptyState, ErrorState } from '@/components/states';
import { PhoneStatusBadge, ProcessingStatusBadge, QualityBadge } from '@/components/status';
import { formatNumber, formatPercent, formatPhone, formatRelative, formatShortDateTime } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useOrg } from '@/lib/org';

const SERIES = [
  { key: 'sent', label: 'Sent', color: 'var(--chart-1)' },
  { key: 'delivered', label: 'Delivered', color: 'var(--chart-2)' },
  { key: 'read', label: 'Read', color: 'var(--chart-3)' },
  { key: 'failed', label: 'Failed', color: 'var(--chart-4)' },
];

function FirstRun() {
  useLocale();
  const { orgId } = useOrg();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
        <PlugZap className="size-5" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-fg">{tr('Connect your WhatsApp Business account')}</h1>
      <p className="mt-1.5 text-sm text-muted">
        {tr('Connect your Meta account to start managing phone numbers, templates and webhooks.')}
      </p>
      <Link
        to={orgPath(orgId, 'connect')}
        className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'mt-6')}
      >
        {tr('Connect with Meta')}
      </Link>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'danger';
}) {
  useLocale();
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-xs text-muted">{localizeText(label)}</dt>
      <dd
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums tracking-[-0.01em]',
          tone === 'danger' ? 'text-danger-text' : 'text-fg',
        )}
      >
        {value}
      </dd>
      {sub && <dd className="mt-0.5 text-xs text-subtle">{sub}</dd>}
    </div>
  );
}

const WEBHOOK_LABEL = {
  healthy: { tone: 'success', label: 'Healthy' },
  degraded: { tone: 'warning', label: 'Errors in the last 24h' },
  idle: { tone: 'neutral', label: 'No events for 7 days' },
  no_events: { tone: 'neutral', label: 'No events yet' },
} as const;

export function OverviewPage() {
  useLocale();
  const { orgId, organization } = useOrg();
  const [period, setPeriod] = React.useState<PeriodValue>({ range: '7d' });
  const connections = useListConnections(orgId);
  const dashboard = useGetDashboard(orgId, period, {
    query: { placeholderData: (prev) => prev, enabled: (connections.data?.length ?? 0) > 0 },
  });

  if (connections.error)
    return <ErrorState error={connections.error} onRetry={() => connections.refetch()} />;
  if (connections.isSuccess && connections.data.length === 0) return <FirstRun />;
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;

  const d = dashboard.data;
  const m = d?.messages;
  const hasTraffic = (d?.series ?? []).some((p) => p.sent + p.failed + p.received > 0);
  const t = d?.templates;
  const webhook = d ? WEBHOOK_LABEL[d.webhook.status] : null;

  return (
    <>
      <PageHeader
        title={tr('Overview')}
        description={organization?.name}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />
      <PageBody className="grid gap-8">
        <dl className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x [&>div]:border-border max-lg:[&>div]:border-b">
          {!m ? (
            Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-6 w-20" />
              </div>
            ))
          ) : (
            <>
              <Stat label={tr('Messages sent')} value={formatNumber(m.sent)} sub={tr('by this app')} />
              <Stat
                label={tr('Delivered')}
                value={formatNumber(m.delivered)}
                sub={tr('{0} of sent', formatPercent(m.delivered, m.sent))}
              />
              <Stat
                label={tr('Read')}
                value={formatNumber(m.read)}
                sub={tr('{0} of delivered', formatPercent(m.read, m.delivered))}
              />
              <Stat
                label={tr('Failed')}
                value={formatNumber(m.failed)}
                tone={m.failed > 0 ? 'danger' : undefined}
                sub={m.failed > 0 ? tr('see Messages') : tr('none')}
              />
              <Stat label={tr('Received')} value={formatNumber(m.received)} sub={tr('inbound messages')} />
            </>
          )}
        </dl>

        <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
          <Section
            title={tr('Message delivery')}
            description={tr('Outbound messages by their latest status, from webhooks this app received.')}
          >
            {!d ? (
              <Skeleton className="h-56 w-full" />
            ) : hasTraffic ? (
              <TimeSeriesChart
                data={d.series}
                series={SERIES}
                xKey="bucket"
                bucket={d.range.bucket}
                ariaLabel={tr('Messages by status over time')}
              />
            ) : (
              <EmptyState
                className="rounded-lg border border-dashed border-border py-10"
                icon={MessageSquareDashed}
                title={tr('No messages in this period')}
                description={tr('Send a test message from the playground, or wait for webhooks to arrive.')}
                action={
                  <Link
                    to={orgPath(orgId, 'messages/playground')}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    {tr('Open playground')}
                  </Link>
                }
              />
            )}
          </Section>

          <div className="grid h-fit gap-8">
            <Section title={tr('Webhook')}>
              {!d || !webhook ? (
                <Skeleton className="h-14 w-full" />
              ) : (
                <div className="grid gap-1.5 text-[13px]">
                  <div className="flex items-center justify-between">
                    <Badge tone={webhook.tone} dot>
                      {localizeText(webhook.label)}
                    </Badge>
                    <Link
                      to={orgPath(orgId, 'developers/webhooks')}
                      className="font-medium text-accent-text hover:underline"
                    >
                      {tr('Details')}
                    </Link>
                  </div>
                  <p className="text-muted">
                    {tr('Last event')}{' '}
                    <span className="text-fg">{formatRelative(d.webhook.lastEventAt)}</span>
                    {d.webhook.lastErrorAt && (
                      <>
                        {', '}
                        {tr('last error')}{' '}
                        <span className="text-danger-text">{formatRelative(d.webhook.lastErrorAt)}</span>
                      </>
                    )}
                  </p>
                </div>
              )}
            </Section>

            <Section
              title={tr('Templates')}
              actions={
                <Link
                  to={orgPath(orgId, 'templates')}
                  className="text-[13px] font-medium text-accent-text hover:underline"
                >
                  {tr('View all')}
                </Link>
              }
            >
              {!t ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="grid gap-2.5">
                  <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                    {[
                      [t.approved, 'bg-success'],
                      [t.pending, 'bg-info'],
                      [t.rejected, 'bg-danger'],
                      [t.paused, 'bg-warning'],
                    ].map(
                      ([n, cls]) =>
                        (n as number) > 0 && (
                          <div key={cls as string} className={cls as string} style={{ flex: n as number }} />
                        ),
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                    {(
                      [
                        [tr('Approved'), t.approved],
                        [tr('Pending'), t.pending],
                        [tr('Rejected'), t.rejected],
                        [tr('Paused or disabled'), t.paused],
                      ] as const
                    ).map(([label, n]) => (
                      <div key={label} className="flex justify-between">
                        <dt className="text-muted">{localizeText(label)}</dt>
                        <dd className="tabular-nums text-fg">{formatNumber(n)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </Section>

            <Section title={tr('Accounts')}>
              {!d ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <dl className="grid grid-cols-3 gap-2 text-[13px]">
                  {(
                    [
                      ['WABAs', d.accounts.wabas],
                      [tr('Numbers'), d.accounts.phoneNumbers],
                      [tr('Connected'), d.accounts.activePhoneNumbers],
                    ] as const
                  ).map(([label, n]) => (
                    <div key={label}>
                      <dt className="text-muted">{localizeText(label)}</dt>
                      <dd className="text-base font-semibold tabular-nums text-fg">{n}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Section>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-2">
          <Section title={tr('Phone number quality')} framed>
            {!d ? (
              <Skeleton className="m-4 h-20" />
            ) : d.phoneQuality.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">{tr('No phone numbers synced.')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {d.phoneQuality.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={orgPath(orgId, `phone-numbers/${p.id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">
                          {formatPhone(p.displayPhoneNumber)}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {p.verifiedName ?? tr('No display name')}
                          {p.messagingLimitTier &&
                            `, ${tr(MESSAGING_LIMIT_TIERS[p.messagingLimitTier] ?? p.messagingLimitTier)}`}
                        </span>
                      </span>
                      <PhoneStatusBadge status={p.status} />
                      <QualityBadge rating={p.qualityRating} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={tr('Recent events')}
            framed
            actions={
              <Link
                to={orgPath(orgId, 'developers/events')}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline"
              >
                {tr('Event logs')} <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            {!d ? (
              <Skeleton className="m-4 h-20" />
            ) : d.recentEvents.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">
                {tr('No webhook events received yet.')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {d.recentEvents.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`${orgPath(orgId, 'developers/events')}?event=${e.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">
                        {e.eventType}
                      </span>
                      <ProcessingStatusBadge status={e.processingStatus} />
                      <time className="w-24 text-right text-xs text-subtle" dateTime={e.receivedAt}>
                        {formatShortDateTime(e.receivedAt)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </PageBody>
    </>
  );
}
