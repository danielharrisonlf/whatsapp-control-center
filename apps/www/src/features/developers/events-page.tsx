import { useQueryClient } from '@tanstack/react-query';
import {
  getGetWebhookEventQueryKey,
  type ListWebhookEventsParams,
  useGetWebhookEvent,
  useGetWebhookEventFacets,
  useListWabas,
  useListWebhookEventsInfinite,
  useReplayWebhookEvent,
} from '@wacc/api-client';
import {
  Badge,
  Button,
  cn,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetTitle,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@wacc/ui';
import { Activity, Play, RotateCw, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { IdChip } from '@/components/copy';
import { JsonView } from '@/components/json-view';
import { PageHeader } from '@/components/page';
import { WabaSelect } from '@/components/pickers';
import {
  BlockSkeleton,
  EmptyState,
  ErrorPanel,
  ErrorState,
  LoadMore,
  TableSkeleton,
} from '@/components/states';
import { HttpStatus, ProcessingStatusBadge } from '@/components/status';
import { formatDateTime, formatShortDateTime, humanize } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useOrg } from '@/lib/org';

const STATUSES = ['PROCESSED', 'PENDING', 'IGNORED', 'FAILED', 'REJECTED'] as const;
const ANY = '__any__';

function EventDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const canReplay = useCan('webhooks.replay');
  const event = useGetWebhookEvent(orgId, id ?? '', { query: { enabled: Boolean(id) } });
  const replay = useReplayWebhookEvent();
  const e = event.data;
  return (
    <Sheet open={Boolean(id)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent width="w-[min(760px,100vw)]">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4 pr-12">
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-mono text-sm">{e?.eventType ?? tr('Event')}</SheetTitle>
            {e && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <ProcessingStatusBadge status={e.processingStatus} />
                <HttpStatus code={e.responseStatus} />
                {!e.signatureValid && <Badge tone="danger">{tr('Invalid signature')}</Badge>}
                <span className="text-xs text-muted">{formatDateTime(e.receivedAt)}</span>
              </div>
            )}
          </div>
          {e && canReplay && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!e.signatureValid}
              title={
                e.signatureValid
                  ? tr('Run our handler again on the stored payload')
                  : tr('Events with invalid signatures are never processed')
              }
              loading={replay.isPending}
              onClick={() =>
                replay.mutate(
                  { organizationId: orgId, eventId: e.id },
                  {
                    onSuccess: (r) => {
                      qc.setQueryData(getGetWebhookEventQueryKey(orgId, e.id), r);
                      toast.success(tr('Replayed: {0}', humanize(r.processingStatus)));
                    },
                  },
                )
              }
            >
              <Play /> {tr('Replay internally')}
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {event.isLoading ? (
            <BlockSkeleton lines={8} />
          ) : event.error ? (
            <ErrorPanel error={event.error} />
          ) : e ? (
            <div className="grid gap-4">
              {replay.error && <ErrorPanel error={replay.error} />}
              {e.error && (
                <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger-text">{e.error}</p>
              )}
              <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[13px]">
                <dt className="text-muted">{tr('Field')}</dt>
                <dd className="font-mono text-xs">{e.field ?? '—'}</dd>
                <dt className="text-muted">{tr('WABA')}</dt>
                <dd>
                  <IdChip value={e.metaWabaId} />
                </dd>
                <dt className="text-muted">{tr('Phone number ID')}</dt>
                <dd>
                  <IdChip value={e.metaPhoneNumberId} />
                </dd>
                <dt className="text-muted">{tr('Endpoint')}</dt>
                <dd>{e.endpoint === 'platform' ? tr('Platform app') : tr('Connection endpoint')}</dd>
                <dt className="text-muted">{tr('Attempts')}</dt>
                <dd className="tabular-nums">{e.attempts}</dd>
              </dl>
              <Tabs defaultValue="payload">
                <TabsList>
                  <TabsTrigger value="payload">{tr('Payload')}</TabsTrigger>
                  <TabsTrigger value="log">
                    {tr('Processing log (')}
                    {e.processingLog.length})
                  </TabsTrigger>
                  <TabsTrigger value="headers">{tr('Headers')}</TabsTrigger>
                  <TabsTrigger value="related">
                    {tr('Related (')}
                    {e.relatedMessages.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="payload" className="pt-3">
                  <JsonView value={e.payload} maxHeight={520} />
                </TabsContent>
                <TabsContent value="log" className="pt-3">
                  <ol className="grid gap-1 font-mono text-xs">
                    {e.processingLog.map((l, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: log lines are ordered
                      <li key={i} className="flex gap-3">
                        <time className="shrink-0 text-subtle">{formatShortDateTime(l.at)}</time>
                        <span
                          className={cn(
                            l.level === 'error'
                              ? 'text-danger-text'
                              : l.level === 'warn'
                                ? 'text-warning-text'
                                : 'text-fg',
                          )}
                        >
                          {l.message}
                        </span>
                      </li>
                    ))}
                  </ol>
                </TabsContent>
                <TabsContent value="headers" className="pt-3">
                  <JsonView value={e.headers} />
                </TabsContent>
                <TabsContent value="related" className="pt-3">
                  {e.relatedMessages.length === 0 ? (
                    <p className="text-[13px] text-muted">{tr('No messages linked to this event.')}</p>
                  ) : (
                    <ul className="grid gap-1.5 text-[13px]">
                      {e.relatedMessages.map((m) => (
                        <li key={`${m.wamid}:${m.label}`} className="flex items-center gap-3">
                          <span className="text-fg">{localizeText(m.label)}</span>
                          <IdChip value={m.wamid} />
                          {m.messageId && (
                            <Link
                              className="text-accent-text hover:underline"
                              to={`${orgPath(orgId, 'messages')}?view=log`}
                            >
                              {tr('Messages')}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function EventsPage() {
  useLocale();
  const { orgId } = useOrg();
  const [params, setParams] = useSearchParams();
  const wabas = useListWabas(orgId);
  const filters = {
    field: params.get('field') ?? undefined,
    eventType: params.get('type') ?? undefined,
    metaWabaId: params.get('waba') ?? undefined,
    metaPhoneNumberId: params.get('phone') ?? undefined,
    status: (params.get('status') as ListWebhookEventsParams['status'] | null) ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  };
  const setFilter = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('event');
    setParams(next, { replace: true });
  };
  const facets = useGetWebhookEventFacets(orgId);
  const events = useListWebhookEventsInfinite(
    orgId,
    { ...filters, limit: 50 },
    {
      query: {
        getNextPageParam: (l) => l.nextCursor ?? undefined,
        initialPageParam: undefined,
        refetchInterval: 15_000,
      },
    },
  );
  const items = events.data?.pages.flatMap((p) => p.items) ?? [];
  const openId = params.get('event');
  const filtered = Object.values(filters).some(Boolean);
  const wabaLocalId = wabas.data?.find((w) => w.metaWabaId === filters.metaWabaId)?.id;

  return (
    <>
      <PageHeader
        title={tr('Event logs')}
        description={tr(
          'Every webhook delivery received, with its payload and how our handler processed it.',
        )}
        actions={
          <Button variant="secondary" onClick={() => events.refetch()} loading={events.isRefetching}>
            <RotateCw /> {tr('Refresh')}
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <Select
          value={filters.eventType ?? ANY}
          onValueChange={(v) => setFilter('type', v === ANY ? undefined : v)}
        >
          <SelectTrigger className="w-auto min-w-48" aria-label={tr('Event type')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{tr('All event types')}</SelectItem>
            {facets.data?.eventTypes.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="font-mono text-xs">{t.value}</span>{' '}
                <span className="ml-1 text-subtle tabular-nums">{t.count}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <WabaSelect
          value={wabaLocalId}
          onChange={(id) => setFilter('waba', wabas.data?.find((w) => w.id === id)?.metaWabaId)}
          allowAll
          className="w-auto min-w-40"
        />
        <Input
          defaultValue={filters.metaPhoneNumberId}
          onBlur={(e) => setFilter('phone', e.target.value.trim() || undefined)}
          onKeyDown={(e) =>
            e.key === 'Enter' && setFilter('phone', (e.target as HTMLInputElement).value.trim() || undefined)
          }
          placeholder={tr('Phone number ID')}
          aria-label={tr('Phone number ID')}
          className="w-44 font-mono text-[13px]"
        />
        <Select
          value={filters.status ?? ANY}
          onValueChange={(v) => setFilter('status', v === ANY ? undefined : v)}
        >
          <SelectTrigger className="w-40" aria-label={tr('Processing status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{tr('Any status')}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          {tr('Since')}
          <input
            type="date"
            value={filters.from?.slice(0, 10) ?? ''}
            onChange={(e) =>
              setFilter(
                'from',
                e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : undefined,
              )
            }
            className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            <X /> {tr('Clear')}
          </Button>
        )}
      </div>
      {events.isLoading ? (
        <TableSkeleton columns={6} />
      ) : events.error ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={filtered ? tr('No events match these filters') : tr('No webhook events yet')}
          description={
            filtered
              ? undefined
              : tr(
                  'Check the Webhooks page: the callback URL must be configured in Meta and the WABA subscribed.',
                )
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{tr('Event')}</TH>
                <TH>{tr('WABA')}</TH>
                <TH>{tr('Phone number ID')}</TH>
                <TH>{tr('Processing')}</TH>
                <TH>{tr('HTTP')}</TH>
                <TH className="text-right">{tr('Received')}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((e) => {
                const open = () =>
                  setParams(
                    (p) => {
                      p.set('event', e.id);
                      return p;
                    },
                    { replace: true },
                  );
                return (
                  <TR
                    key={e.id}
                    data-interactive="true"
                    data-selected={openId === e.id}
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={(k) => k.key === 'Enter' && open()}
                  >
                    <TD>
                      <span className="font-mono text-[13px] text-fg">
                        {e.eventType ?? e.field ?? 'unknown'}
                      </span>
                      {e.attempts > 1 && (
                        <span className="ml-2 text-xs text-subtle">
                          {e.attempts} {tr('runs')}
                        </span>
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-muted">{e.metaWabaId ?? '—'}</TD>
                    <TD className="font-mono text-xs text-muted">{e.metaPhoneNumberId ?? '—'}</TD>
                    <TD>
                      <ProcessingStatusBadge status={e.processingStatus} />
                    </TD>
                    <TD>
                      <HttpStatus code={e.responseStatus} />
                    </TD>
                    <TD className="text-right text-xs text-subtle">
                      <time dateTime={e.receivedAt} title={formatDateTime(e.receivedAt)}>
                        {formatShortDateTime(e.receivedAt)}
                      </time>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <LoadMore
            hasMore={Boolean(events.hasNextPage)}
            loading={events.isFetchingNextPage}
            onLoad={() => events.fetchNextPage()}
          />
        </>
      )}
      <EventDetail
        id={openId}
        onClose={() =>
          setParams(
            (p) => {
              p.delete('event');
              return p;
            },
            { replace: true },
          )
        }
      />
    </>
  );
}
