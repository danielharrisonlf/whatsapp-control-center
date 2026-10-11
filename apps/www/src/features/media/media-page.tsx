import { useQueryClient } from '@tanstack/react-query';
import {
  type Media,
  useDeleteMedia,
  useListMediaInfinite,
  useRefreshMedia,
  useUploadMedia,
} from '@wacc/api-client';
import { ALL_MEDIA_MIME_TYPES, MEDIA_TYPES, mediaKindForMime } from '@wacc/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@wacc/ui';
import { Download, Image, MoreHorizontal, RefreshCw, Trash2, Upload } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { IdChip } from '@/components/copy';
import { PageHeader } from '@/components/page';
import { PhoneSelect } from '@/components/pickers';
import { EmptyState, ErrorPanel, ErrorState, LoadMore, TableSkeleton } from '@/components/states';
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format';
import { formatMessage, t as tr, useLocale } from '@/lib/i18n';
import { useCan, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

function expiryBadge(m: Media) {
  if (m.deletedAt) return <Badge>{tr('Deleted or expired')}</Badge>;
  if (!m.estimatedExpiresAt) return <Badge tone="info">{tr('Received')}</Badge>;
  const left = new Date(m.estimatedExpiresAt).getTime() - Date.now();
  if (left <= 0) return <Badge tone="warning">{tr('Probably expired')}</Badge>;
  const days = Math.ceil(left / 86_400_000);
  return (
    <Badge tone={days <= 1 ? 'warning' : 'neutral'}>
      {days}
      {tr('d left')}
    </Badge>
  );
}

export function MediaPage() {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const canManage = useCan('media.manage');
  const [phoneId, setPhoneId] = React.useState<string>();
  const [toDelete, setToDelete] = React.useState<Media | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const media = useListMediaInfinite(
    orgId,
    { phoneNumberId: phoneId, limit: 50 },
    {
      query: { getNextPageParam: (l) => l.nextCursor ?? undefined, initialPageParam: undefined },
    },
  );
  const upload = useUploadMedia();
  const refresh = useRefreshMedia();
  const del = useDeleteMedia();
  const items = media.data?.pages.flatMap((p) => p.items) ?? [];
  const [localError, setLocalError] = React.useState<string | null>(null);

  const onFile = (file: File) => {
    setLocalError(null);
    const kind = mediaKindForMime(file.type);
    if (!kind)
      return setLocalError(formatMessage('{0} is not accepted by WhatsApp.', file.type || 'This file type'));
    if (file.size > MEDIA_TYPES[kind].maxBytes)
      return setLocalError(
        formatMessage('{0} files are limited to {1}.', kind, formatBytes(MEDIA_TYPES[kind].maxBytes)),
      );
    if (!phoneId) return setLocalError('Choose the phone number that will own this media.');
    upload.mutate(
      { organizationId: orgId, data: { file, phoneNumberId: phoneId } },
      {
        onSuccess: (m) => {
          invalidateOrg(qc, orgId, 'media');
          toast.success(tr('Uploaded: {0}', m.metaMediaId));
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title={tr('Media')}
        description={tr(
          'Files uploaded to Meta for sending, and media received in messages. Meta keeps uploaded media for 7 days; download links expire after 5 minutes, so files are fetched on demand.',
        )}
        actions={
          <>
            <PhoneSelect value={phoneId} onChange={setPhoneId} allowAll />
            {canManage && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  className="sr-only"
                  accept={ALL_MEDIA_MIME_TYPES.join(',')}
                  aria-label={tr('File to upload')}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="primary"
                  loading={upload.isPending}
                  onClick={() => fileRef.current?.click()}
                  disabled={!phoneId}
                  title={phoneId ? undefined : tr('Choose a phone number first')}
                >
                  <Upload /> {tr('Upload')}
                </Button>
              </>
            )}
          </>
        }
      />
      {(localError || upload.error || refresh.error || del.error) && (
        <div className="px-6 pt-4">
          {localError ? (
            <ErrorPanel error={new Error(localError)} title={tr('File not uploaded')} />
          ) : (
            <ErrorPanel error={upload.error ?? refresh.error ?? del.error} />
          )}
        </div>
      )}
      {media.isLoading ? (
        <TableSkeleton columns={6} />
      ) : media.error ? (
        <ErrorState error={media.error} onRetry={() => media.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Image}
          title={tr('No media yet')}
          description={tr(
            'Upload images, video, audio, documents or stickers to get a media ID for messages.',
          )}
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>{tr('File')}</TH>
                <TH>{tr('Type')}</TH>
                <TH className="text-right">{tr('Size')}</TH>
                <TH>{tr('Media ID')}</TH>
                <TH>{tr('Origin')}</TH>
                <TH>{tr('Retention')}</TH>
                <TH className="text-right">{tr('Added')}</TH>
                <TH className="w-10">
                  <span className="sr-only">{tr('Actions')}</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {items.map((m) => (
                <TR key={m.id}>
                  <TD className="max-w-60">
                    <div className="truncate font-medium text-fg">{m.fileName ?? tr('Untitled')}</div>
                    <div className="text-xs text-muted">{m.phoneNumber.displayPhoneNumber}</div>
                  </TD>
                  <TD>
                    <div className="text-[13px] text-fg">{m.kind ?? 'unknown'}</div>
                    <div className="font-mono text-xs text-subtle">{m.mimeType}</div>
                  </TD>
                  <TD className="text-right tabular-nums text-[13px]">{formatBytes(m.fileSize)}</TD>
                  <TD>
                    <IdChip value={m.metaMediaId} />
                  </TD>
                  <TD className="text-[13px] text-muted">
                    {m.origin === 'UPLOADED' ? tr('Uploaded') : tr('Received')}
                  </TD>
                  <TD>{expiryBadge(m)}</TD>
                  <TD className="text-right text-xs text-subtle" title={formatDateTime(m.createdAt)}>
                    {formatRelative(m.createdAt)}
                  </TD>
                  <TD>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={tr('Actions for {0}', m.fileName ?? m.metaMediaId)}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild disabled={Boolean(m.deletedAt)}>
                          <a href={`/api/organizations/${orgId}/media/${m.id}/download`} download>
                            <Download /> {tr('Download')}
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            refresh.mutate(
                              { organizationId: orgId, mediaId: m.id },
                              { onSuccess: () => invalidateOrg(qc, orgId, 'media') },
                            )
                          }
                        >
                          <RefreshCw /> {tr('Check at Meta')}
                        </DropdownMenuItem>
                        {canManage && !m.deletedAt && (
                          <DropdownMenuItem tone="danger" onSelect={() => setToDelete(m)}>
                            <Trash2 /> {tr('Delete')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <LoadMore
            hasMore={Boolean(media.hasNextPage)}
            loading={media.isFetchingNextPage}
            onLoad={() => media.fetchNextPage()}
          />
        </>
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={tr('Delete this media from Meta?')}
        description={
          <p>
            {toDelete?.fileName ?? toDelete?.metaMediaId} {tr("is removed from Meta's servers.")}
          </p>
        }
        consequences={[
          tr('Messages that reference this media ID and have not been sent yet will fail.'),
          tr('Messages already delivered keep their copy on the recipient device.'),
        ]}
        confirmLabel={tr('Delete media')}
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(
            { organizationId: orgId, mediaId: toDelete.id },
            {
              onSettled: () => setToDelete(null),
              onSuccess: () => {
                invalidateOrg(qc, orgId, 'media');
                toast.success(tr('Media deleted'));
              },
            },
          )
        }
      />
    </>
  );
}
