import { useListPhoneNumbers } from '@wacc/api-client';
import { MESSAGING_LIMIT_TIERS } from '@wacc/types';
import { buttonVariants, Table, TBody, TD, TH, THead, TR } from '@wacc/ui';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { IdChip } from '@/components/copy';
import { ConnectFirst } from '@/components/notices';
import { PageHeader } from '@/components/page';
import { WabaSelect } from '@/components/pickers';
import { ErrorState, TableSkeleton } from '@/components/states';
import { NameStatusBadge, PhoneStatusBadge, QualityBadge } from '@/components/status';
import { formatPhone, formatRelative, humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useCapabilities, useOrg } from '@/lib/org';

export function PhoneNumbersPage() {
  useLocale();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const [wabaId, setWabaId] = React.useState<string>();
  const phones = useListPhoneNumbers(orgId, wabaId ? { wabaId } : undefined);
  const canManage = useCan('phones.manage');
  const caps = useCapabilities();

  return (
    <>
      <PageHeader
        title={tr('Phone numbers')}
        description={tr('Business phone numbers registered on the WhatsApp Cloud API.')}
        actions={
          <>
            <WabaSelect value={wabaId} onChange={setWabaId} allowAll />
            {canManage && caps.canManagePhoneNumbers && (
              <Link
                to={orgPath(orgId, 'phone-numbers/new')}
                className={buttonVariants({ variant: 'primary' })}
              >
                <Plus /> {tr('Add number')}
              </Link>
            )}
          </>
        }
      />
      {phones.isLoading ? (
        <TableSkeleton columns={6} />
      ) : phones.error ? (
        <ErrorState error={phones.error} onRetry={() => phones.refetch()} />
      ) : phones.data?.length === 0 ? (
        wabaId ? (
          <p className="px-6 py-10 text-center text-sm text-muted">{tr('No numbers in this account.')}</p>
        ) : (
          <ConnectFirst what={tr('phone numbers')} />
        )
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{tr('Number')}</TH>
              <TH>{tr('Display name')}</TH>
              <TH>{tr('Status')}</TH>
              <TH>{tr('Quality')}</TH>
              <TH>{tr('Messaging limit')}</TH>
              <TH>{tr('Phone number ID')}</TH>
              <TH className="text-right">{tr('Synced')}</TH>
            </TR>
          </THead>
          <TBody>
            {phones.data?.map((p) => {
              const go = () => navigate(orgPath(orgId, `phone-numbers/${p.id}`));
              return (
                <TR
                  key={p.id}
                  data-interactive="true"
                  tabIndex={0}
                  onClick={go}
                  onKeyDown={(e) => e.key === 'Enter' && go()}
                >
                  <TD>
                    <div className="font-medium tabular-nums text-fg">
                      {formatPhone(p.displayPhoneNumber)}
                    </div>
                    <div className="text-xs text-muted">{p.displayLabel ?? p.waba.name}</div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{p.verifiedName ?? '—'}</span>
                      {p.nameStatus && p.nameStatus !== 'APPROVED' && (
                        <NameStatusBadge status={p.nameStatus} />
                      )}
                    </div>
                  </TD>
                  <TD>
                    <PhoneStatusBadge status={p.status} />
                  </TD>
                  <TD>
                    <QualityBadge rating={p.qualityRating} />
                  </TD>
                  <TD className="text-[13px] text-muted">
                    {p.messagingLimitTier
                      ? tr(MESSAGING_LIMIT_TIERS[p.messagingLimitTier] ?? humanize(p.messagingLimitTier))
                      : '—'}
                  </TD>
                  <TD>
                    <IdChip value={p.metaPhoneNumberId} />
                  </TD>
                  <TD className="text-right text-xs text-subtle">{formatRelative(p.lastSyncedAt)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
