import { useGetApiLog, useListApiLogsInfinite } from '@wacc/api-client';
import {
  Badge,
  cn,
  Input,
  Segmented,
  Sheet,
  SheetContent,
  SheetTitle,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@wacc/ui';
import { ArrowDownLeft, ArrowUpRight, ScrollText, Search } from 'lucide-react';
import * as React from 'react';
import { IdChip } from '@/components/copy';
import { JsonView } from '@/components/json-view';
import { PageHeader } from '@/components/page';
import {
  BlockSkeleton,
  EmptyState,
  ErrorPanel,
  ErrorState,
  LoadMore,
  TableSkeleton,
} from '@/components/states';
import { HttpStatus } from '@/components/status';
import { formatDateTime, formatShortDateTime } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { useOrg } from '@/lib/org';

function displayUrl(url: string) {
  return url.replace(/^https:\/\/graph\.facebook\.com/, 'graph.facebook.com');
}

function LogDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  useLocale();
  const { orgId } = useOrg();
  const log = useGetApiLog(orgId, id ?? '', { query: { enabled: Boolean(id) } });
  const l = log.data;
  return (
    <Sheet open={Boolean(id)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent width="w-[min(720px,100vw)]">
        <div className="border-b border-border px-5 py-4 pr-12">
          <SheetTitle className="break-all font-mono text-sm">
            {l ? `${l.method} ${displayUrl(l.url)}` : tr('Request')}
          </SheetTitle>
          {l && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <HttpStatus code={l.statusCode} />
              <span className="tabular-nums">
                {l.durationMs} {tr('ms')}
              </span>
              <span>{formatDateTime(l.createdAt)}</span>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {log.isLoading ? (
            <BlockSkeleton lines={8} />
          ) : log.error ? (
            <ErrorPanel error={log.error} />
          ) : l ? (
            <div className="grid gap-5">
              <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[13px]">
                <dt className="text-muted">{tr('Request ID')}</dt>
                <dd>
                  <IdChip value={l.requestId} />
                </dd>
                {l.metaTraceId && (
                  <>
                    <dt className="text-muted">{tr('fbtrace_id')}</dt>
                    <dd>
                      <IdChip value={l.metaTraceId} />
                    </dd>
                  </>
                )}
                {l.errorCode != null && (
                  <>
                    <dt className="text-muted">{tr('Meta error')}</dt>
                    <dd className="font-mono text-xs text-danger-text">{l.errorCode}</dd>
                  </>
                )}
              </dl>
              {l.related.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[13px] font-medium text-fg">{tr('Same request')}</h3>
                  <ul className="divide-y divide-border rounded-md border border-border text-[13px]">
                    {l.related.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                        <HttpStatus code={r.statusCode} />
                        <span className="truncate font-mono text-xs">
                          {r.method} {displayUrl(r.url)}
                        </span>
                        <span className="ml-auto text-xs tabular-nums text-subtle">
                          {r.durationMs} {tr('ms')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-[13px] font-medium text-fg">{tr('Request body')}</h3>
                {l.requestBody != null ? (
                  <JsonView value={l.requestBody} />
                ) : (
                  <p className="text-[13px] text-muted">{tr('No body.')}</p>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-[13px] font-medium text-fg">{tr('Response body')}</h3>
                {l.responseBody != null ? (
                  <JsonView value={l.responseBody} />
                ) : (
                  <p className="text-[13px] text-muted">{tr('Not recorded.')}</p>
                )}
              </div>
              <p className="text-xs text-subtle">
                {tr('Tokens, secrets, PINs, codes and verify tokens are redacted before storage.')}
              </p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ApiLogsPage() {
  useLocale();
  const { orgId } = useOrg();
  const [direction, setDirection] = React.useState<'all' | 'INBOUND' | 'OUTBOUND'>('all');
  const [status, setStatus] = React.useState<'all' | 'success' | 'error'>('all');
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState<string | null>(null);
  const logs = useListApiLogsInfinite(
    orgId,
    {
      direction: direction === 'all' ? undefined : direction,
      status: status === 'all' ? undefined : status,
      search: search || undefined,
      limit: 50,
    },
    { query: { getNextPageParam: (l) => l.nextCursor ?? undefined, initialPageParam: undefined } },
  );
  const items = logs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title={tr('API logs')}
        description={tr('Requests to this API and the Graph API calls they made. Bodies are sanitized.')}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <Segmented
          aria-label={tr('Direction')}
          size="sm"
          value={direction}
          onValueChange={setDirection}
          options={[
            { value: 'all', label: tr('All') },
            { value: 'INBOUND', label: tr('This API') },
            { value: 'OUTBOUND', label: tr('Graph API') },
          ]}
        />
        <Segmented
          aria-label={tr('Result')}
          size="sm"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'all', label: tr('Any result') },
            { value: 'success', label: tr('Succeeded') },
            { value: 'error', label: tr('Failed') },
          ]}
        />
        <div className="relative w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Filter by path')}
            className="pl-8"
            aria-label={tr('Filter by path')}
          />
        </div>
      </div>
      {logs.isLoading ? (
        <TableSkeleton columns={5} />
      ) : logs.error ? (
        <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ScrollText} title={tr('No requests logged')} />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH className="w-8">
                  <span className="sr-only">{tr('Direction')}</span>
                </TH>
                <TH>{tr('Request')}</TH>
                <TH>{tr('Status')}</TH>
                <TH className="text-right">{tr('Duration')}</TH>
                <TH className="text-right">{tr('Time')}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((l) => (
                <TR
                  key={l.id}
                  data-interactive="true"
                  data-selected={open === l.id}
                  tabIndex={0}
                  onClick={() => setOpen(l.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setOpen(l.id)}
                >
                  <TD>
                    {l.direction === 'OUTBOUND' ? (
                      <ArrowUpRight className="size-4 text-info-text" aria-label={tr('Graph API call')} />
                    ) : (
                      <ArrowDownLeft className="size-4 text-subtle" aria-label={tr('Request to this API')} />
                    )}
                  </TD>
                  <TD className="max-w-[640px]">
                    <span className="mr-2 font-mono text-xs font-medium text-fg">{l.method}</span>
                    <span className="truncate font-mono text-xs text-muted">{displayUrl(l.url)}</span>
                    {l.errorCode != null && (
                      <Badge tone="danger" className="ml-2 font-mono">
                        #{l.errorCode}
                      </Badge>
                    )}
                  </TD>
                  <TD>
                    <HttpStatus code={l.statusCode} />
                  </TD>
                  <TD
                    className={cn(
                      'text-right text-[13px] tabular-nums',
                      l.durationMs > 2000 ? 'text-warning-text' : 'text-muted',
                    )}
                  >
                    {l.durationMs} {tr('ms')}
                  </TD>
                  <TD className="text-right text-xs text-subtle">{formatShortDateTime(l.createdAt)}</TD>
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
      <LogDetail id={open} onClose={() => setOpen(null)} />
    </>
  );
}
