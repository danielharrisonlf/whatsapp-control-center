import { useQueryClient } from '@tanstack/react-query';
import { useGetMetaConfig, useListConnections, useRunDiagnostics } from '@wacc/api-client';
import { META_PERMISSIONS } from '@wacc/types';
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wacc/ui';
import { Stethoscope } from 'lucide-react';
import * as React from 'react';
import { Checklist } from '@/components/checklist';
import { ConnectFirst } from '@/components/notices';
import { DetailList, PageBody, PageHeader, Section } from '@/components/page';
import {
  BlockSkeleton,
  ErrorPanel,
  ErrorState,
  MetaErrorPanel,
  metaDisplay,
  TechnicalDetails,
} from '@/components/states';
import { ConnectionStatusBadge } from '@/components/status';
import { formatDateTime, formatRelative, humanize } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { useCan, useCapabilities, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

const CAPABILITY_LABELS: [keyof ReturnType<typeof useCapabilities>, string][] = [
  ['canManageAccounts', 'Read and sync WhatsApp accounts'],
  ['canManagePhoneNumbers', 'Register and manage phone numbers'],
  ['canManageTemplates', 'Create and manage templates'],
  ['canManageFlows', 'Manage WhatsApp Flows'],
  ['canSendMessages', 'Send messages'],
  ['canManageMedia', 'Upload media'],
  ['canViewAnalytics', 'Read analytics'],
  ['canDiscoverBusinessAssets', 'Discover business portfolio assets'],
];

export function DiagnosticsPage() {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const connections = useListConnections(orgId);
  const config = useGetMetaConfig(orgId);
  const caps = useCapabilities();
  const canRun = useCan('logs.read');
  const [connectionId, setConnectionId] = React.useState<string>();
  const run = useRunDiagnostics();
  const active = connections.data?.find((c) => c.id === (connectionId ?? connections.data?.[0]?.id));

  if (connections.isLoading) return <BlockSkeleton className="max-w-2xl px-6 py-8" lines={6} />;
  if (connections.error)
    return <ErrorState error={connections.error} onRetry={() => connections.refetch()} />;
  if (!active) {
    return (
      <>
        <PageHeader title={tr('Diagnostics')} />
        <ConnectFirst what="diagnostics" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={tr('Diagnostics')}
        description={tr(
          'Checks what the Meta connection can really do: token, permissions, assets and webhook subscription.',
        )}
        actions={
          <>
            {connections.data!.length > 1 && (
              <Select value={active.id} onValueChange={setConnectionId}>
                <SelectTrigger className="w-56" aria-label={tr('Connection')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {connections.data!.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {canRun && (
              <Button
                variant="primary"
                loading={run.isPending}
                onClick={() =>
                  run.mutate(
                    { organizationId: orgId, connectionId: active.id },
                    { onSuccess: () => invalidateOrg(qc, orgId) },
                  )
                }
              >
                <Stethoscope /> {tr('Test Meta connection')}
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid max-w-5xl gap-10">
        {run.error && <ErrorPanel error={run.error} title={tr('Diagnostics could not run')} />}
        {run.data && (
          <Section
            title={tr('Results')}
            description={tr(
              'Checked {0} against Graph API {1}.',
              formatRelative(run.data.checkedAt),
              run.data.graphApiVersion,
            )}
          >
            <Checklist
              checks={run.data.checks}
              renderExtra={(c) => {
                const err = run.data!.checks.find((x) => x.key === c.key)?.error;
                return err ? <TechnicalDetails error={metaDisplay(err)} /> : null;
              }}
            />
          </Section>
        )}
        <div className="grid gap-10 lg:grid-cols-2">
          <Section title={tr('Connection')}>
            <DetailList
              items={[
                { label: tr('Status'), value: <ConnectionStatusBadge status={active.status} /> },
                { label: tr('Type'), value: humanize(active.kind) },
                {
                  label: tr('Meta app'),
                  value: <span className="font-mono text-xs">{active.metaAppId}</span>,
                },
                { label: tr('Graph API version'), value: config.data?.graphApiVersion },
                {
                  label: tr('Token'),
                  value: <span className="font-mono text-xs">{active.accessTokenPreview}</span>,
                },
                { label: tr('Token type'), value: humanize(active.tokenType) },
                {
                  label: tr('Token expires'),
                  value: active.tokenExpiresAt ? formatDateTime(active.tokenExpiresAt) : tr('Never'),
                },
                { label: tr('Last checked'), value: formatRelative(active.lastCheckedAt) },
              ]}
            />
            {active.lastError && (
              <div className="mt-3">
                <MetaErrorPanel error={active.lastError} />
              </div>
            )}
          </Section>
          <Section
            title={tr('Permissions')}
            description={tr('From the token scopes reported by Meta at the last check.')}
          >
            <ul className="grid gap-2">
              {Object.entries(META_PERMISSIONS).map(([scope, purpose]) => {
                const granted = active.scopes.includes(scope);
                return (
                  <li key={scope} className="flex items-start justify-between gap-3 text-[13px]">
                    <span>
                      <code className="font-mono text-xs text-fg">{scope}</code>
                      <span className="block text-muted">{tr(purpose)}</span>
                    </span>
                    {granted ? (
                      <Badge tone="success">{tr('Granted')}</Badge>
                    ) : (
                      <Badge tone={scope === 'business_management' ? 'neutral' : 'danger'}>
                        {tr('Missing')}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
        <Section
          title={tr('What this organization can do')}
          description={tr('Actions without the needed permission are disabled across the app.')}
        >
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {CAPABILITY_LABELS.map(([key, label]) => (
              <li key={key} className="flex items-center gap-2 text-[13px]">
                <span
                  aria-hidden
                  className={
                    caps[key] ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-danger'
                  }
                />
                <span className={caps[key] ? 'text-fg' : 'text-muted line-through'}>
                  {localizeText(label)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </PageBody>
    </>
  );
}
