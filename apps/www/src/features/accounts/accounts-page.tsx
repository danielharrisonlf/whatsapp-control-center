import { useListWabas } from '@wacc/api-client';
import { Badge, Table, TBody, TD, TH, THead, TR } from '@wacc/ui';
import { useNavigate } from 'react-router';
import { IdChip } from '@/components/copy';
import { ConnectFirst } from '@/components/notices';
import { PageHeader } from '@/components/page';
import { ErrorState, TableSkeleton } from '@/components/states';
import { ReviewStatusBadge } from '@/components/status';
import { formatRelative } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useOrg } from '@/lib/org';

export function AccountsPage() {
  useLocale();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const wabas = useListWabas(orgId);

  return (
    <>
      <PageHeader
        title={tr('WhatsApp accounts')}
        description={tr('WhatsApp Business Accounts (WABAs) linked through your Meta connections.')}
      />
      {wabas.isLoading ? (
        <TableSkeleton columns={6} />
      ) : wabas.error ? (
        <ErrorState error={wabas.error} onRetry={() => wabas.refetch()} />
      ) : wabas.data?.length === 0 ? (
        <ConnectFirst what={tr('your WhatsApp Business Accounts')} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{tr('Account')}</TH>
              <TH>{tr('WABA ID')}</TH>
              <TH>{tr('Review')}</TH>
              <TH>{tr('Business verification')}</TH>
              <TH className="text-right">{tr('Numbers')}</TH>
              <TH className="text-right">{tr('Templates')}</TH>
              <TH>{tr('Webhooks')}</TH>
              <TH className="text-right">{tr('Synced')}</TH>
            </TR>
          </THead>
          <TBody>
            {wabas.data?.map((w) => (
              <TR
                key={w.id}
                data-interactive="true"
                tabIndex={0}
                onClick={() => navigate(orgPath(orgId, `accounts/${w.id}`))}
                onKeyDown={(e) => e.key === 'Enter' && navigate(orgPath(orgId, `accounts/${w.id}`))}
              >
                <TD>
                  <div className="font-medium text-fg">
                    {w.displayLabel ?? w.name ?? tr('Unnamed account')}
                  </div>
                  <div className="text-xs text-muted">{w.ownerBusinessName ?? w.connection.name}</div>
                </TD>
                <TD>
                  <IdChip value={w.metaWabaId} />
                </TD>
                <TD>
                  <ReviewStatusBadge status={w.accountReviewStatus} />
                </TD>
                <TD>
                  <ReviewStatusBadge status={w.businessVerificationStatus} />
                </TD>
                <TD className="text-right tabular-nums">{w.phoneNumberCount}</TD>
                <TD className="text-right tabular-nums">
                  {w.templateCounts.approved}
                  <span className="text-subtle">/{w.templateCounts.total}</span>
                </TD>
                <TD>
                  {w.appSubscribed ? (
                    <Badge tone="success" dot>
                      {tr('Subscribed')}
                    </Badge>
                  ) : w.appSubscribed === false ? (
                    <Badge tone="danger" dot>
                      {tr('Not subscribed')}
                    </Badge>
                  ) : (
                    <Badge>{tr('Unknown')}</Badge>
                  )}
                </TD>
                <TD className="text-right text-xs text-subtle">{formatRelative(w.lastSyncedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
