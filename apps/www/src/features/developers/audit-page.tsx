import { useListAuditLogsInfinite } from '@wacc/api-client';
import { Popover, PopoverContent, PopoverTrigger, Table, TBody, TD, TH, THead, TR } from '@wacc/ui';
import { ShieldCheck } from 'lucide-react';
import { JsonView } from '@/components/json-view';
import { PageHeader } from '@/components/page';
import { EmptyState, ErrorState, LoadMore, TableSkeleton } from '@/components/states';
import { formatDateTime, formatRelative, humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { useCan, useOrg } from '@/lib/org';

export function AuditPage() {
  useLocale();
  const { orgId } = useOrg();
  const canRead = useCan('audit.read');
  const logs = useListAuditLogsInfinite(
    orgId,
    { limit: 50 },
    {
      query: {
        enabled: canRead,
        getNextPageParam: (l) => l.nextCursor ?? undefined,
        initialPageParam: undefined,
      },
    },
  );
  const items = logs.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageHeader
        title={tr('Audit log')}
        description={tr(
          'Sensitive actions in this organization: who did what, and when. Metadata never contains secrets.',
        )}
      />
      {!canRead ? (
        <EmptyState icon={ShieldCheck} title={tr('Only owners and admins can read the audit log')} />
      ) : logs.isLoading ? (
        <TableSkeleton columns={5} />
      ) : logs.error ? (
        <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={tr('No audited actions yet')} />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{tr('Action')}</TH>
                <TH>{tr('Actor')}</TH>
                <TH>{tr('Resource')}</TH>
                <TH>{tr('Details')}</TH>
                <TH className="text-right">{tr('When')}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((a) => (
                <TR key={a.id}>
                  <TD className="font-mono text-xs text-fg">{a.action}</TD>
                  <TD className="text-[13px]">
                    {a.actor ? a.actor.name : <span className="text-subtle">{tr('System')}</span>}
                  </TD>
                  <TD className="text-[13px] text-muted">
                    {humanize(a.resource)}{' '}
                    {a.resourceId && (
                      <span className="font-mono text-xs text-subtle">{a.resourceId.slice(0, 8)}</span>
                    )}
                  </TD>
                  <TD>
                    {Object.keys(a.metadata).length > 0 ? (
                      <Popover>
                        <PopoverTrigger className="text-[13px] font-medium text-accent-text hover:underline">
                          {tr('View')}
                        </PopoverTrigger>
                        <PopoverContent className="w-96">
                          <JsonView value={a.metadata} maxHeight={260} />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </TD>
                  <TD className="text-right text-xs text-subtle" title={formatDateTime(a.createdAt)}>
                    {formatRelative(a.createdAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <LoadMore
            hasMore={Boolean(logs.hasNextPage)}
            loading={logs.isFetchingNextPage}
            onLoad={() => logs.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}
