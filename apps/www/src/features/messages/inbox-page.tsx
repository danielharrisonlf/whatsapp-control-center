import { useQueryClient } from '@tanstack/react-query';
import {
  type Conversation,
  type Message,
  useGetMessage,
  useListConversationMessagesInfinite,
  useListConversationsInfinite,
  useListMessagesInfinite,
  useMarkMessageRead,
  useSendMessage,
  useSendTypingIndicator,
} from '@wacc/api-client';
import {
  Badge,
  Button,
  buttonVariants,
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
import { FlaskConical, Inbox, Search, Send } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { IdChip } from '@/components/copy';
import { JsonView } from '@/components/json-view';
import { PageHeader } from '@/components/page';
import { PhoneSelect } from '@/components/pickers';
import {
  BlockSkeleton,
  EmptyState,
  ErrorPanel,
  ErrorState,
  LoadMore,
  TableSkeleton,
} from '@/components/states';
import { MessageStatusBadge } from '@/components/status';
import { formatDateTime, formatPhone, formatRelative, formatShortDateTime, humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';
import { WhatsAppText } from '../templates/wa-preview';

/** Short human summary of any message payload. */
function summarize(m: Message): string {
  // biome-ignore lint/suspicious/noExplicitAny: summarizes arbitrary Meta payload shapes defensively
  const p = (m.payload ?? {}) as Record<string, any>;
  const body = p[m.type] ?? p;
  switch (m.type) {
    case 'text':
      return body?.body ?? '';
    case 'template':
      return `Template ${body?.name ?? ''}`;
    case 'interactive':
      return (
        body?.body?.text ??
        body?.button_reply?.title ??
        body?.list_reply?.title ??
        (body?.nfm_reply ? tr('Flow response') : tr('Interactive message'))
      );
    case 'button':
      return body?.text ?? tr('Button reply');
    case 'reaction':
      return `Reacted ${body?.emoji ?? ''}`;
    case 'location':
      return `Location ${body?.name ?? `${body?.latitude}, ${body?.longitude}`}`;
    default:
      return body?.caption ?? humanize(m.type);
  }
}

function MessageDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  useLocale();
  const { orgId } = useOrg();
  const message = useGetMessage(orgId, id ?? '', { query: { enabled: Boolean(id) } });
  const m = message.data;
  return (
    <Sheet open={Boolean(id)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent>
        <div className="border-b border-border px-5 py-4">
          <SheetTitle>{tr('Message')}</SheetTitle>
          {m && <IdChip value={m.wamid} truncate={false} />}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {message.isLoading ? (
            <BlockSkeleton lines={6} />
          ) : message.error ? (
            <ErrorPanel error={message.error} />
          ) : m ? (
            <div className="grid gap-5">
              <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
                <dt className="text-muted">{tr('Direction')}</dt>
                <dd>{humanize(m.direction)}</dd>
                <dt className="text-muted">{tr('From')}</dt>
                <dd className="tabular-nums">{formatPhone(m.sender)}</dd>
                <dt className="text-muted">{tr('To')}</dt>
                <dd className="tabular-nums">{formatPhone(m.recipient)}</dd>
                <dt className="text-muted">{tr('Type')}</dt>
                <dd>{m.type}</dd>
                <dt className="text-muted">{tr('Status')}</dt>
                <dd>
                  <MessageStatusBadge status={m.status} />
                </dd>
                <dt className="text-muted">{tr('Created')}</dt>
                <dd>{formatDateTime(m.createdAt)}</dd>
              </dl>
              {m.statusEvents.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[13px] font-medium text-fg">{tr('Status timeline')}</h3>
                  <ol className="grid gap-2 border-l border-border pl-4">
                    {m.statusEvents.map((e) => (
                      <li key={e.id} className="relative text-[13px]">
                        <span
                          aria-hidden
                          className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border-strong"
                        />
                        <div className="flex items-center gap-2">
                          <MessageStatusBadge status={e.status} />
                          <time className="text-xs text-subtle" dateTime={e.metaTimestamp}>
                            {formatDateTime(e.metaTimestamp)}
                          </time>
                        </div>
                        {e.errors != null && <JsonView value={e.errors} maxHeight={160} className="mt-1.5" />}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {m.pricing != null && (
                <div>
                  <h3 className="mb-2 text-[13px] font-medium text-fg">{tr('Pricing')}</h3>
                  <JsonView value={m.pricing} maxHeight={160} />
                </div>
              )}
              {m.error != null && (
                <div>
                  <h3 className="mb-2 text-[13px] font-medium text-danger-text">{tr('Error')}</h3>
                  <JsonView value={m.error} maxHeight={200} />
                </div>
              )}
              <div>
                <h3 className="mb-2 text-[13px] font-medium text-fg">{tr('Payload')}</h3>
                <JsonView value={m.payload} />
              </div>
              {m.webhookEventId && (
                <Link
                  className="text-[13px] font-medium text-accent-text hover:underline"
                  to={`${orgPath(orgId, 'developers/events')}?event=${m.webhookEventId}`}
                >
                  {tr('Open the webhook event')}
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Thread({
  conversation,
  onOpenMessage,
}: {
  conversation: Conversation;
  onOpenMessage: (id: string) => void;
}) {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const canSend = useCan('messages.send');
  const [text, setText] = React.useState('');
  const send = useSendMessage();
  const markRead = useMarkMessageRead();
  const typing = useSendTypingIndicator();
  const messages = useListConversationMessagesInfinite(
    orgId,
    conversation.id,
    { limit: 30 },
    {
      query: {
        getNextPageParam: (l) => l.nextCursor ?? undefined,
        initialPageParam: undefined,
        refetchInterval: 10_000,
      },
    },
  );
  const items = (messages.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse();
  const endRef = React.useRef<HTMLDivElement>(null);
  const lastId = items[items.length - 1]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the newest message changes
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);
  const lastInbound = [...items].reverse().find((m) => m.direction === 'INBOUND');
  const inboundPayload = lastInbound?.payload;
  const inboundIdentity =
    inboundPayload && typeof inboundPayload === 'object' && !Array.isArray(inboundPayload)
      ? (inboundPayload as Record<string, unknown>)
      : null;
  const bsuidWithoutPhone =
    typeof inboundIdentity?.from_user_id === 'string' && typeof inboundIdentity.from !== 'string';
  const canReplyToNumber = /^\+?\d{6,20}$/.test(conversation.waId) && !bsuidWithoutPhone;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {conversation.profileName ?? formatPhone(conversation.waId)}
          </p>
          <p className="truncate text-xs text-muted">
            {formatPhone(conversation.waId)} {tr('via')}{' '}
            {formatPhone(conversation.phoneNumber.displayPhoneNumber)}
          </p>
        </div>
        {conversation.windowOpen ? (
          <Badge tone="success" dot title={tr('Free-form messages allowed')}>
            {tr('Window open until')} {formatShortDateTime(conversation.windowExpiresAt)}
          </Badge>
        ) : (
          <Badge tone="neutral">{tr('Window closed: templates only')}</Badge>
        )}
        {lastInbound?.wamid && canSend && (
          <Button
            size="sm"
            variant="ghost"
            loading={typing.isPending}
            disabled={!conversation.windowOpen || typing.isPending}
            onClick={() =>
              typing.mutate(
                { organizationId: orgId, messageId: lastInbound.id },
                { onSuccess: () => messages.refetch() },
              )
            }
          >
            {tr('Show typing')}
          </Button>
        )}
        {lastInbound?.wamid && lastInbound.status !== 'read' && canSend && (
          <Button
            size="sm"
            variant="ghost"
            loading={markRead.isPending}
            onClick={() =>
              markRead.mutate(
                { organizationId: orgId, messageId: lastInbound.id },
                { onSuccess: () => messages.refetch() },
              )
            }
          >
            {tr('Mark as read')}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--wa-wallpaper)] px-4 py-4">
        {messages.hasNextPage && (
          <div className="mb-3 flex justify-center">
            <Button
              size="sm"
              variant="secondary"
              loading={messages.isFetchingNextPage}
              onClick={() => messages.fetchNextPage()}
            >
              {tr('Older messages')}
            </Button>
          </div>
        )}
        {messages.error && <ErrorPanel error={messages.error} title={tr('Could not load messages')} />}
        {messages.isLoading ? (
          <BlockSkeleton lines={4} />
        ) : (
          <div className="grid gap-1.5">
            {items.map((m) => {
              const out = m.direction === 'OUTBOUND';
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpenMessage(m.id)}
                  className={cn(
                    'max-w-[75%] rounded-lg px-2.5 py-1.5 text-left text-[13.5px] text-[var(--wa-text)] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    out
                      ? 'justify-self-end rounded-tr-none bg-[var(--wa-bubble-out)]'
                      : 'justify-self-start rounded-tl-none bg-[var(--wa-bubble)]',
                  )}
                >
                  <span className="whitespace-pre-wrap break-words">
                    <WhatsAppText text={summarize(m)} />
                  </span>
                  <span className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-[var(--wa-meta)]">
                    {formatShortDateTime(m.createdAt)}
                    {out && (
                      <span className={m.status === 'failed' ? 'text-danger-text' : undefined}>
                        {m.status}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {canSend && (
        <form
          className="flex items-center gap-2 border-t border-border px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const submittedText = text.trim();
            if (!submittedText || !conversation.windowOpen || !canReplyToNumber || send.isPending) return;
            send.mutate(
              {
                organizationId: orgId,
                data: {
                  phoneNumberId: conversation.phoneNumber.id,
                  to: conversation.waId,
                  type: 'text',
                  payload: { body: submittedText },
                },
              },
              {
                onSuccess: (result) => {
                  if (!result.ok) return;
                  setText((current) => (current.trim() === submittedText ? '' : current));
                  messages.refetch();
                  invalidateOrg(qc, orgId, 'conversations');
                },
              },
            );
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              conversation.windowOpen
                ? tr('Reply…')
                : tr('The 24h window is closed. Send a template from the playground.')
            }
            disabled={!conversation.windowOpen || !canReplyToNumber}
            aria-label={tr('Reply')}
          />
          <Button
            type="submit"
            variant="primary"
            size="icon"
            aria-label={tr('Send')}
            disabled={!conversation.windowOpen || !canReplyToNumber || !text.trim() || send.isPending}
            loading={send.isPending}
          >
            <Send />
          </Button>
        </form>
      )}
      {canSend && !canReplyToNumber && (
        <p className="px-4 pb-2 text-[13px] text-muted">
          {tr('This contact has no phone number available for a reply.')}
        </p>
      )}
      {markRead.error && <ErrorPanel error={markRead.error} title={tr('Could not mark message as read')} />}
      {typing.error && <ErrorPanel error={typing.error} title={tr('Could not show typing indicator')} />}
      {send.error && <ErrorPanel error={send.error} title={tr('Could not send message')} />}
      {send.data?.ok === false && send.data.error && (
        <p className="px-4 pb-2 text-[13px] text-danger-text">
          {send.data.error.userMessage ?? send.data.error.message}
        </p>
      )}
    </div>
  );
}

function Conversations({ onOpenMessage }: { onOpenMessage: (id: string) => void }) {
  useLocale();
  const { orgId } = useOrg();
  const [phoneId, setPhoneId] = React.useState<string>();
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(null);
  const conversations = useListConversationsInfinite(
    orgId,
    { phoneNumberId: phoneId, search: search || undefined, limit: 30 },
    {
      query: {
        getNextPageParam: (l) => l.nextCursor ?? undefined,
        initialPageParam: undefined,
        refetchInterval: 15_000,
      },
    },
  );
  const items = conversations.data?.pages.flatMap((p) => p.items) ?? [];
  // On wide screens open the most recent conversation right away.
  const current =
    items.find((c) => c.id === selected) ??
    (window.matchMedia('(min-width: 768px)').matches ? (items[0] ?? null) : null);

  if (conversations.error)
    return <ErrorState error={conversations.error} onRetry={() => conversations.refetch()} />;

  return (
    <div className="grid min-h-[600px] flex-1 md:grid-cols-[320px_1fr]">
      <div className="flex min-h-0 flex-col border-border md:border-r">
        <div className="grid gap-2 border-b border-border p-3">
          <PhoneSelect value={phoneId} onChange={setPhoneId} allowAll className="w-full" />
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('Search name or number')}
              className="pl-8"
              aria-label={tr('Search conversations')}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.isLoading ? (
            <BlockSkeleton className="p-3" lines={6} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={tr('No conversations yet')}
              description={tr(
                'History starts when this app sends or receives a message. Meta does not provide past history.',
              )}
            />
          ) : (
            <ul>
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    aria-current={c.id === selected}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      c.id === selected && 'bg-raised',
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-muted">
                      {(c.profileName ?? c.waId).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-fg">
                          {c.profileName ?? formatPhone(c.waId)}
                        </span>
                        <time
                          className="shrink-0 text-[11px] text-subtle"
                          dateTime={c.lastMessageAt ?? undefined}
                        >
                          {formatShortDateTime(c.lastMessageAt)}
                        </time>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">
                        {c.lastMessage ? summarize(c.lastMessage) : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <LoadMore
            hasMore={Boolean(conversations.hasNextPage)}
            loading={conversations.isFetchingNextPage}
            onLoad={() => conversations.fetchNextPage()}
          />
        </div>
      </div>
      {current ? (
        <Thread key={current.id} conversation={current} onOpenMessage={onOpenMessage} />
      ) : (
        <div className="hidden items-center justify-center text-sm text-muted md:flex">
          {tr('Select a conversation')}
        </div>
      )}
    </div>
  );
}

function MessageLog({ onOpenMessage }: { onOpenMessage: (id: string) => void }) {
  useLocale();
  const { orgId } = useOrg();
  const [direction, setDirection] = React.useState<'all' | 'OUTBOUND' | 'INBOUND'>('all');
  const [status, setStatus] = React.useState<string>('');
  const messages = useListMessagesInfinite(
    orgId,
    { direction: direction === 'all' ? undefined : direction, status: status || undefined, limit: 50 },
    {
      query: { getNextPageParam: (l) => l.nextCursor ?? undefined, initialPageParam: undefined },
    },
  );
  const items = messages.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <Segmented
          aria-label={tr('Direction')}
          size="sm"
          value={direction}
          onValueChange={setDirection}
          options={[
            { value: 'all', label: tr('All') },
            { value: 'OUTBOUND', label: tr('Sent') },
            { value: 'INBOUND', label: tr('Received') },
          ]}
        />
        <Segmented
          aria-label={tr('Status')}
          size="sm"
          value={status || 'any'}
          onValueChange={(v) => setStatus(v === 'any' ? '' : v)}
          options={[
            { value: 'any', label: tr('Any status') },
            { value: 'delivered', label: tr('Delivered') },
            { value: 'read', label: tr('Read') },
            { value: 'failed', label: tr('Failed') },
          ]}
        />
      </div>
      {messages.isLoading ? (
        <TableSkeleton columns={6} />
      ) : messages.error ? (
        <ErrorState error={messages.error} onRetry={() => messages.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tr('No messages')}
          description={tr('Messages sent through the playground or received by webhook appear here.')}
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{tr('Message')}</TH>
                <TH>{tr('Type')}</TH>
                <TH>{tr('From')}</TH>
                <TH>{tr('To')}</TH>
                <TH>{tr('Status')}</TH>
                <TH>{tr('wamid')}</TH>
                <TH className="text-right">{tr('Time')}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((m) => (
                <TR
                  key={m.id}
                  data-interactive="true"
                  tabIndex={0}
                  onClick={() => onOpenMessage(m.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpenMessage(m.id)}
                >
                  <TD className="max-w-72 truncate">{summarize(m)}</TD>
                  <TD className="text-[13px] text-muted">{m.type}</TD>
                  <TD className="tabular-nums text-[13px]">{formatPhone(m.sender)}</TD>
                  <TD className="tabular-nums text-[13px]">{formatPhone(m.recipient)}</TD>
                  <TD>
                    <MessageStatusBadge status={m.status} />
                  </TD>
                  <TD className="max-w-40">
                    <IdChip value={m.wamid} />
                  </TD>
                  <TD className="text-right text-xs text-subtle" title={formatDateTime(m.createdAt)}>
                    {formatRelative(m.createdAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <LoadMore
            hasMore={Boolean(messages.hasNextPage)}
            loading={messages.isFetchingNextPage}
            onLoad={() => messages.fetchNextPage()}
          />
        </>
      )}
    </div>
  );
}

export function InboxPage() {
  useLocale();
  const { orgId } = useOrg();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'log' ? 'log' : 'inbox';
  const [openMessage, setOpenMessage] = React.useState<string | null>(null);
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={tr('Messages')}
        description={tr(
          'Conversations and messages observed by this app. Meta does not offer retroactive history, so it starts at connection time.',
        )}
        actions={
          <>
            <Segmented
              aria-label={tr('View')}
              value={view}
              onValueChange={(v) => setParams(v === 'log' ? { view: 'log' } : {}, { replace: true })}
              options={[
                { value: 'inbox', label: tr('Inbox') },
                { value: 'log', label: tr('Log') },
              ]}
            />
            <Link
              to={orgPath(orgId, 'messages/playground')}
              className={buttonVariants({ variant: 'primary' })}
            >
              <FlaskConical /> {tr('Playground')}
            </Link>
          </>
        }
      />
      {view === 'inbox' ? (
        <Conversations onOpenMessage={setOpenMessage} />
      ) : (
        <MessageLog onOpenMessage={setOpenMessage} />
      )}
      <MessageDetail id={openMessage} onClose={() => setOpenMessage(null)} />
    </div>
  );
}
