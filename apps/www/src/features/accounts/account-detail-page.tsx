import { useQueryClient } from '@tanstack/react-query';
import {
  getGetWabaQueryKey,
  getListWabasQueryKey,
  useGetWaba,
  useListPhoneNumbers,
  useSubscribeWaba,
  useSyncWaba,
  useUnsubscribeWaba,
  useUpdateWaba,
} from '@wacc/api-client';
import { Badge, Button, ConfirmDialog, Input } from '@wacc/ui';
import { Check, Pencil, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { IdChip } from '@/components/copy';
import { ManualActionNotice, META_LINKS } from '@/components/notices';
import { DetailList, PageBody, PageHeader, Section } from '@/components/page';
import { BlockSkeleton, ErrorPanel, ErrorState, PartialErrorBanner } from '@/components/states';
import { PhoneStatusBadge, QualityBadge, ReviewStatusBadge } from '@/components/status';
import { formatDateTime, formatPhone, formatRelative, humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

function LabelEditor({
  wabaId,
  value,
  fallback,
}: {
  wabaId: string;
  value: string | null;
  fallback: string;
}) {
  useLocale();
  const { orgId } = useOrg();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? '');
  const update = useUpdateWaba();
  const qc = useQueryClient();
  const canEdit = useCan('wabas.sync');
  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        {value ?? fallback}
        {canEdit && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={tr('Rename locally')}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        )}
      </span>
    );
  }
  return (
    <form
      className="inline-flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(
          { organizationId: orgId, wabaId, data: { displayLabel: draft.trim() || null } },
          {
            onSuccess: (data) => {
              qc.setQueryData(getGetWabaQueryKey(orgId, wabaId), data);
              qc.invalidateQueries({ queryKey: getListWabasQueryKey(orgId) });
              setEditing(false);
            },
          },
        );
      }}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-8 w-64 text-base"
        aria-label={tr('Local label')}
        autoFocus
      />
      <Button
        size="icon"
        variant="primary"
        type="submit"
        loading={update.isPending}
        aria-label={tr('Save label')}
      >
        <Check />
      </Button>
    </form>
  );
}

export function AccountDetailPage() {
  useLocale();
  const { wabaId } = useParams<{ wabaId: string }>();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const waba = useGetWaba(orgId, wabaId!);
  const phones = useListPhoneNumbers(orgId, { wabaId });
  const sync = useSyncWaba();
  const subscribe = useSubscribeWaba();
  const unsubscribe = useUnsubscribeWaba();
  const canSync = useCan('wabas.sync');
  const canSubscribe = useCan('wabas.subscribe');
  const [confirmUnsub, setConfirmUnsub] = React.useState(false);

  if (waba.isLoading) return <BlockSkeleton className="max-w-2xl px-6 py-8" lines={8} />;
  if (waba.error || !waba.data) return <ErrorState error={waba.error} onRetry={() => waba.refetch()} />;
  const w = waba.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetWabaQueryKey(orgId, wabaId!) });
    invalidateOrg(qc, orgId);
    phones.refetch();
  };

  const health = w.healthStatus as {
    can_send_message?: string;
    entities?: {
      entity_type: string;
      id: string;
      can_send_message: string;
      errors?: { error_description?: string }[];
    }[];
  } | null;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: tr('Accounts'), to: orgPath(orgId, 'accounts') },
          { label: w.name ?? w.metaWabaId },
        ]}
        title={
          <LabelEditor wabaId={w.id} value={w.displayLabel} fallback={w.name ?? tr('Unnamed account')} />
        }
        meta={
          <>
            <IdChip value={w.metaWabaId} />
            <ReviewStatusBadge status={w.accountReviewStatus} />
            {w.appSubscribed ? (
              <Badge tone="success" dot>
                {tr('Webhooks subscribed')}
              </Badge>
            ) : (
              <Badge tone="danger" dot>
                {tr('Webhooks not subscribed')}
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {canSubscribe &&
              (w.appSubscribed ? (
                <Button variant="secondary" onClick={() => setConfirmUnsub(true)}>
                  {tr('Unsubscribe app')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={subscribe.isPending}
                  onClick={() =>
                    subscribe.mutate(
                      { organizationId: orgId, wabaId: w.id },
                      {
                        onSuccess: (data) => {
                          qc.setQueryData(getGetWabaQueryKey(orgId, w.id), data);
                          toast.success(tr('App subscribed to webhooks'));
                        },
                      },
                    )
                  }
                >
                  {tr('Subscribe app')}
                </Button>
              ))}
            {canSync && (
              <Button
                variant="primary"
                loading={sync.isPending}
                onClick={() =>
                  sync.mutate(
                    { organizationId: orgId, wabaId: w.id },
                    {
                      onSuccess: (r) => {
                        refresh();
                        if (r.errors.length)
                          toast.warning(tr('Synced with {0} partial error(s)', r.errors.length));
                        else
                          toast.success(
                            `Synced: ${r.phoneNumbers} numbers, ${r.templates} templates, ${r.flows} flows`,
                          );
                      },
                    },
                  )
                }
              >
                <RefreshCw /> {tr('Sync with Meta')}
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid max-w-5xl gap-8">
        {sync.error && <ErrorPanel error={sync.error} title={tr('Sync failed')} />}
        {subscribe.error && <ErrorPanel error={subscribe.error} title={tr('Could not subscribe the app')} />}
        {unsubscribe.error && (
          <ErrorPanel error={unsubscribe.error} title={tr('Meta did not unsubscribe the app')} />
        )}
        {sync.data && sync.data.errors.length > 0 && (
          <PartialErrorBanner>
            <p className="font-medium">{tr('Parts of the sync failed. Existing local data was kept.')}</p>
            <ul className="mt-1">
              {sync.data.errors.map((e) => (
                <li key={e.resource}>
                  <code className="font-mono text-xs">{e.resource}</code>: {e.message}
                </li>
              ))}
            </ul>
          </PartialErrorBanner>
        )}
        {health?.can_send_message && health.can_send_message !== 'AVAILABLE' && (
          <PartialErrorBanner>
            <p className="font-medium">
              {tr('Meta reports messaging as')} {humanize(health.can_send_message)}
            </p>
            <ul className="mt-1 text-fg/80">
              {health.entities
                ?.filter((e) => e.can_send_message !== 'AVAILABLE')
                .map((e) => (
                  <li key={`${e.entity_type}:${e.id}`}>
                    {humanize(e.entity_type)} {e.id}:{' '}
                    {e.errors?.map((x) => x.error_description).join('; ') || humanize(e.can_send_message)}
                  </li>
                ))}
            </ul>
          </PartialErrorBanner>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <Section title={tr('Details')}>
            <DetailList
              items={[
                { label: tr('Name in Meta'), value: w.name },
                {
                  label: tr('Owner business'),
                  value: w.ownerBusinessName ? (
                    <>
                      {w.ownerBusinessName} <IdChip value={w.ownerBusinessId} />
                    </>
                  ) : null,
                },
                { label: tr('Ownership'), value: humanize(w.ownershipType) },
                {
                  label: tr('Business verification'),
                  value: <ReviewStatusBadge status={w.businessVerificationStatus} />,
                },
                { label: tr('Account review'), value: <ReviewStatusBadge status={w.accountReviewStatus} /> },
                { label: tr('Timezone ID'), value: w.timezoneId },
                { label: tr('Currency'), value: w.currency },
                { label: tr('Country'), value: w.country },
                { label: tr('Template namespace'), value: <IdChip value={w.messageTemplateNamespace} /> },
                {
                  label: tr('Template insights'),
                  value: w.isEnabledForInsights
                    ? tr('Enabled')
                    : w.isEnabledForInsights === false
                      ? tr('Disabled')
                      : '—',
                },
                { label: tr('Connection'), value: `${w.connection.name} (${humanize(w.connection.kind)})` },
                {
                  label: tr('Last synced'),
                  value: `${formatDateTime(w.lastSyncedAt)} (${formatRelative(w.lastSyncedAt)})`,
                },
              ]}
            />
          </Section>
          <div className="grid h-fit gap-6">
            <Section title={tr('Subscribed apps')} description={tr("Apps receiving this WABA's webhooks.")}>
              {w.subscribedApps.length === 0 ? (
                <p className="text-[13px] text-muted">{tr('None reported by Meta.')}</p>
              ) : (
                <ul className="grid gap-2 text-[13px]">
                  {w.subscribedApps.map((a) => (
                    <li key={a.id ?? a.name} className="rounded-md border border-border px-3 py-2">
                      <p className="font-medium text-fg">{a.name ?? tr('App')}</p>
                      <IdChip value={a.id} />
                      {a.overrideCallbackUri && (
                        <p className="mt-1 break-all text-xs text-muted">
                          {tr('Override:')} {a.overrideCallbackUri}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <ManualActionNotice href={META_LINKS.businessSettings} linkLabel="Open Business settings">
              {tr(
                'Business verification, payment methods and display name appeals are handled in Meta Business Manager.',
              )}
            </ManualActionNotice>
          </div>
        </div>

        <Section title={tr('Phone numbers')} framed>
          {phones.isLoading ? (
            <BlockSkeleton className="p-4" lines={2} />
          ) : (phones.data?.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">
              {tr('No phone numbers in this account.')}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {phones.data?.map((p) => (
                <li key={p.id}>
                  <Link
                    to={orgPath(orgId, `phone-numbers/${p.id}`)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-fg">{formatPhone(p.displayPhoneNumber)}</span>
                      <span className="block text-xs text-muted">{p.verifiedName}</span>
                    </span>
                    <PhoneStatusBadge status={p.status} />
                    <QualityBadge rating={p.qualityRating} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </PageBody>

      <ConfirmDialog
        open={confirmUnsub}
        onOpenChange={setConfirmUnsub}
        title={tr('Unsubscribe the app from this account?')}
        description={
          <p>
            {tr('Meta will stop delivering webhooks for')} {w.name ?? w.metaWabaId} {tr('to this app.')}
          </p>
        }
        consequences={[
          tr('Incoming messages and delivery statuses will no longer reach the inbox or event logs.'),
          tr('Messages can still be sent; their status will stay "accepted".'),
          tr('You can subscribe again at any time.'),
        ]}
        confirmLabel={tr('Unsubscribe')}
        loading={unsubscribe.isPending}
        onConfirm={() =>
          unsubscribe.mutate(
            { organizationId: orgId, wabaId: w.id },
            {
              onSuccess: (data) => {
                qc.setQueryData(getGetWabaQueryKey(orgId, w.id), data);
                setConfirmUnsub(false);
              },
              onError: () => setConfirmUnsub(false),
            },
          )
        }
      />
    </>
  );
}
