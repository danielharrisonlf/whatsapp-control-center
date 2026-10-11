import { useQueryClient } from '@tanstack/react-query';
import {
  type RevealedVerifyToken,
  useGetWebhookOverview,
  useRevealVerifyToken,
  useRunWebhookDiagnostics,
  useSubscribeWaba,
} from '@wacc/api-client';
import { WEBHOOK_FIELDS } from '@wacc/types';
import { Badge, Button, cn } from '@wacc/ui';
import { Eye, Stethoscope } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import { Checklist } from '@/components/checklist';
import { CopyButton } from '@/components/copy';
import { META_LINKS } from '@/components/notices';
import { PageBody, PageHeader, Section } from '@/components/page';
import { BlockSkeleton, ErrorPanel, ErrorState } from '@/components/states';
import { formatNumber, formatRelative } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

const RECOMMENDED = new Set([
  'messages',
  'message_template_status_update',
  'message_template_quality_update',
  'template_category_update',
  'phone_number_quality_update',
  'phone_number_name_update',
  'account_update',
  'account_review_update',
  'flows',
]);

function CodeLine({ value, secret }: { value: string; secret?: boolean }) {
  useLocale();
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-raised pl-3">
      <code
        className={cn(
          'min-w-0 flex-1 truncate py-1.5 font-mono text-[13px] text-fg',
          secret && 'tracking-wider',
        )}
      >
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  );
}

export function WebhooksPage() {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const overview = useGetWebhookOverview(orgId, { query: { refetchInterval: 30_000 } });
  const diagnostics = useRunWebhookDiagnostics();
  const reveal = useRevealVerifyToken();
  const subscribe = useSubscribeWaba();
  const canManage = useCan('webhooks.manage');
  const canSubscribe = useCan('wabas.subscribe');
  const [revealed, setRevealed] = React.useState<Record<string, RevealedVerifyToken>>({});

  if (overview.isLoading) return <BlockSkeleton className="max-w-2xl px-6 py-8" lines={8} />;
  if (overview.error || !overview.data)
    return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
  const { endpoints, wabas, stats } = overview.data;

  return (
    <>
      <PageHeader
        title={tr('Webhooks')}
        description={tr(
          'Meta delivers incoming messages, delivery statuses and account changes to these endpoints. Signatures are verified with the app secret.',
        )}
        actions={
          <Button
            variant="primary"
            loading={diagnostics.isPending}
            onClick={() => diagnostics.mutate({ organizationId: orgId })}
          >
            <Stethoscope /> {tr('Run diagnostics')}
          </Button>
        }
      />
      <PageBody className="grid max-w-5xl gap-10">
        <dl className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border sm:grid-cols-4 sm:divide-x max-sm:[&>div]:border-b max-sm:[&>div]:border-border">
          {(
            [
              ['Events (24h)', formatNumber(stats.received24h), null],
              [tr('Last event'), formatRelative(stats.lastEventAt), null],
              [tr('Last success'), formatRelative(stats.lastSuccessAt), null],
              [
                tr('Last error'),
                stats.lastErrorAt ? formatRelative(stats.lastErrorAt) : 'none',
                stats.lastErrorAt ? 'danger' : null,
              ],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="px-4 py-3">
              <dt className="text-xs text-muted">{localizeText(label)}</dt>
              <dd
                className={cn(
                  'mt-1 text-lg font-semibold tabular-nums',
                  tone === 'danger' ? 'text-danger-text' : 'text-fg',
                )}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {(stats.rejected24h > 0 || stats.failed24h > 0) && (
          <p className="-mt-6 text-[13px] text-muted">
            {stats.rejected24h > 0 && (
              <span className="text-danger-text">
                {stats.rejected24h} {tr('rejected for invalid signature.')}{' '}
              </span>
            )}
            {stats.failed24h > 0 && (
              <span className="text-danger-text">
                {stats.failed24h} {tr('failed in our handler.')}{' '}
              </span>
            )}
            <Link
              className="font-medium text-accent-text hover:underline"
              to={`${orgPath(orgId, 'developers/events')}?status=${stats.rejected24h ? 'REJECTED' : 'FAILED'}`}
            >
              {tr('Inspect events')}
            </Link>
          </p>
        )}

        {(diagnostics.data || diagnostics.error) && (
          <Section
            title={tr('Webhook health')}
            description={
              diagnostics.data ? tr('Checked {0}.', formatRelative(diagnostics.data.checkedAt)) : undefined
            }
          >
            {diagnostics.error ? (
              <ErrorPanel error={diagnostics.error} />
            ) : (
              <Checklist checks={diagnostics.data!.checks} />
            )}
          </Section>
        )}

        <Section
          title={tr('Endpoints')}
          description={tr('Configure these in the Meta App dashboard → WhatsApp → Configuration → Webhook.')}
        >
          <div className="grid gap-4">
            {endpoints.map((e) => {
              const key = e.connectionId ?? 'platform';
              const shown = revealed[key];
              return (
                <div key={key} className="grid gap-3 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-fg">
                      {e.kind === 'platform' ? tr('Platform app') : e.connectionName}
                    </p>
                    <Badge>
                      {e.kind === 'platform' ? tr('Embedded Signup connections') : tr('Own Meta app')}
                    </Badge>
                    {e.kind === 'connection' &&
                      (e.verifiedAt ? (
                        <Badge tone="success" dot>
                          {tr('Verified by Meta')} {formatRelative(e.verifiedAt)}
                        </Badge>
                      ) : (
                        <Badge tone="warning" dot>
                          {tr('Not verified yet')}
                        </Badge>
                      ))}
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-[13px] text-muted">{tr('Callback URL')}</span>
                    <CodeLine value={e.callbackUrl} />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-[13px] text-muted">{tr('Verify token')}</span>
                    {e.kind === 'platform' ? (
                      <p className="text-[13px] text-fg">
                        {e.verifyTokenConfigured ? (
                          tr('Set in META_WEBHOOK_VERIFY_TOKEN on the server.')
                        ) : (
                          <span className="text-danger-text">
                            {tr('META_WEBHOOK_VERIFY_TOKEN is not set.')}
                          </span>
                        )}
                      </p>
                    ) : shown ? (
                      <CodeLine value={shown.verifyToken} secret />
                    ) : (
                      canManage && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-fit"
                          loading={reveal.isPending}
                          onClick={() =>
                            reveal.mutate(
                              { organizationId: orgId, connectionId: e.connectionId! },
                              { onSuccess: (r) => setRevealed((s) => ({ ...s, [key]: r })) },
                            )
                          }
                        >
                          <Eye /> {tr('Reveal verify token')}
                        </Button>
                      )
                    )}
                  </div>
                  {e.kind === 'platform' && !e.appSecretConfigured && (
                    <p className="text-[13px] text-danger-text">
                      {tr('META_APP_SECRET is not set: every delivery to this endpoint is rejected.')}
                    </p>
                  )}
                </div>
              );
            })}
            {reveal.error && <ErrorPanel error={reveal.error} />}
          </div>
        </Section>

        <Section
          title={tr('Account subscriptions')}
          description={tr("Meta only delivers a WABA's events to apps subscribed to it.")}
        >
          {wabas.length === 0 ? (
            <p className="text-[13px] text-muted">{tr('No accounts connected.')}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {wabas.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {w.name ?? w.metaWabaId}
                    </span>
                    <span className="font-mono text-xs text-muted">{w.metaWabaId}</span>
                  </span>
                  {w.appSubscribed ? (
                    <Badge tone="success" dot>
                      {tr('Subscribed')}
                    </Badge>
                  ) : (
                    <>
                      <Badge tone={w.appSubscribed === false ? 'danger' : 'neutral'} dot>
                        {w.appSubscribed === false ? tr('Not subscribed') : tr('Unknown')}
                      </Badge>
                      {canSubscribe && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={subscribe.isPending && subscribe.variables?.wabaId === w.id}
                          onClick={() =>
                            subscribe.mutate(
                              { organizationId: orgId, wabaId: w.id },
                              { onSuccess: () => invalidateOrg(qc, orgId, 'webhooks') },
                            )
                          }
                        >
                          {tr('Subscribe')}
                        </Button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {subscribe.error && <ErrorPanel className="mt-3" error={subscribe.error} />}
        </Section>

        <div className="grid gap-10 md:grid-cols-2">
          <Section
            title={tr('Fields to subscribe')}
            description={tr(
              'In the Meta App dashboard, subscribe the app to these whatsapp_business_account fields.',
            )}
          >
            <ul className="grid gap-1 text-[13px]">
              {WEBHOOK_FIELDS.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <code className={cn('font-mono text-xs', RECOMMENDED.has(f) ? 'text-fg' : 'text-subtle')}>
                    {f}
                  </code>
                  {RECOMMENDED.has(f) && <Badge tone="accent">{tr('recommended')}</Badge>}
                </li>
              ))}
            </ul>
            <a
              href={META_LINKS.appDashboard}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-[13px] font-medium text-accent-text hover:underline"
            >
              {tr('Open the Meta App dashboard')}
            </a>
          </Section>
          <Section title={tr('Events by field (24h)')}>
            {stats.byField.length === 0 ? (
              <p className="text-[13px] text-muted">{tr('No events in the last 24 hours.')}</p>
            ) : (
              <ul className="grid gap-1.5 text-[13px]">
                {stats.byField.map((f) => (
                  <li key={f.field} className="flex items-center justify-between gap-3">
                    <Link
                      className="font-mono text-xs text-fg hover:underline"
                      to={`${orgPath(orgId, 'developers/events')}?field=${f.field}`}
                    >
                      {f.field}
                    </Link>
                    <span className="tabular-nums text-muted">{formatNumber(f.count)}</span>
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
