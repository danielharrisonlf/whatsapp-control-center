import {
  useCreatePhoneQrCode,
  useDeletePhoneQrCode,
  useGetPhoneQrCode,
  useListPhoneQrCodes,
  useUpdatePhoneQrCode,
} from '@wacc/api-client';
import { Button, ConfirmDialog, Input, Textarea } from '@wacc/ui';
import * as React from 'react';
import { toast } from 'sonner';
import { Section } from '@/components/page';
import { ErrorPanel } from '@/components/states';
import { t as tr, useLocale } from '@/lib/i18n';
import { useCan, useOrg } from '@/lib/org';

export function PhoneQrCodes({ phoneId }: { phoneId: string }) {
  useLocale();
  const { orgId } = useOrg();
  const canManage = useCan('phones.manage');
  const list = useListPhoneQrCodes(orgId, phoneId);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [newMessage, setNewMessage] = React.useState('');
  const [editMessage, setEditMessage] = React.useState('');
  const detail = useGetPhoneQrCode(orgId, phoneId, selected ?? '', { query: { enabled: Boolean(selected) } });
  const create = useCreatePhoneQrCode();
  const update = useUpdatePhoneQrCode();
  const remove = useDeletePhoneQrCode();
  const rows = list.data ?? [];

  React.useEffect(() => {
    setEditMessage(detail.data?.prefilledMessage ?? '');
  }, [detail.data]);

  const refresh = () => {
    list.refetch();
    if (selected) detail.refetch();
  };

  return (
    <Section
      title={tr('QR codes')}
      description={tr('A QR code opens a chat with a suggested first message for this number.')}
    >
      {canManage && (
        <form
          className="mb-6 grid max-w-xl gap-3 rounded-lg border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const message = newMessage.trim();
            if (!message || message.length > 140 || create.isPending) return;
            create.mutate(
              { organizationId: orgId, phoneId, data: { prefilledMessage: message, imageFormat: 'PNG' } },
              {
                onSuccess: (created) => {
                  setNewMessage('');
                  setSelected(created.code);
                  refresh();
                  toast.success(tr('QR code created'));
                },
              },
            );
          }}
        >
          <label htmlFor="qr-new-message" className="text-sm font-medium text-fg">
            {tr('Suggested message')}
          </label>
          <Textarea
            id="qr-new-message"
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            rows={3}
            maxLength={140}
            placeholder={tr('Hello, I would like to learn more…')}
          />
          <Button
            type="submit"
            className="w-fit"
            disabled={!newMessage.trim() || newMessage.trim().length > 140}
            loading={create.isPending}
          >
            {tr('Create QR code')}
          </Button>
        </form>
      )}
      {create.error && <ErrorPanel error={create.error} title={tr('Could not create QR code')} />}
      {list.error && <ErrorPanel error={list.error} title={tr('Could not load QR codes')} />}
      {list.isLoading && <p className="text-sm text-muted">{tr('Loading QR codes…')}</p>}
      {list.data &&
        (rows.length ? (
          <ul className="grid max-w-2xl gap-2">
            {rows.map((row) => (
              <li
                key={row.code}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{row.prefilledMessage}</p>
                  <p className="font-mono text-xs text-muted">{row.code}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setSelected(row.code)}>
                  {tr('View')}
                </Button>
                {canManage && (
                  <Button size="sm" variant="danger-outline" onClick={() => setDeleting(row.code)}>
                    {tr('Delete')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{tr('No QR codes for this number yet.')}</p>
        ))}

      {selected && (
        <div className="mt-6 grid max-w-2xl gap-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-fg">
              {tr('QR code')} {selected}
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              {tr('Close')}
            </Button>
          </div>
          {detail.isLoading && <p className="text-sm text-muted">{tr('Loading QR code…')}</p>}
          {detail.error && <ErrorPanel error={detail.error} title={tr('Could not load QR code')} />}
          {detail.data && (
            <>
              {detail.data.qrImageUrl && /^https:\/\//i.test(detail.data.qrImageUrl) && (
                <img
                  src={detail.data.qrImageUrl}
                  alt={tr('WhatsApp QR code {0}', selected)}
                  className="size-48 rounded-md border border-border bg-white object-contain p-2"
                />
              )}
              {/^https:\/\//i.test(detail.data.deepLinkUrl) && (
                <a
                  href={detail.data.deepLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm text-accent-text hover:underline"
                >
                  {tr('Open WhatsApp chat link')}
                </a>
              )}
              {canManage ? (
                <form
                  className="grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editMessage.trim() || editMessage.trim().length > 140 || update.isPending) return;
                    update.mutate(
                      {
                        organizationId: orgId,
                        phoneId,
                        code: selected,
                        data: { prefilledMessage: editMessage.trim() },
                      },
                      {
                        onSuccess: () => {
                          refresh();
                          toast.success(tr('QR code updated'));
                        },
                      },
                    );
                  }}
                >
                  <label htmlFor="qr-edit-message" className="text-sm font-medium text-fg">
                    {tr('Suggested message')}
                  </label>
                  <Input
                    id="qr-edit-message"
                    value={editMessage}
                    onChange={(event) => setEditMessage(event.target.value)}
                    maxLength={140}
                  />
                  <Button
                    type="submit"
                    className="w-fit"
                    disabled={!editMessage.trim() || editMessage.trim().length > 140}
                    loading={update.isPending}
                  >
                    {tr('Save message')}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-fg">{detail.data.prefilledMessage}</p>
              )}
              {update.error && <ErrorPanel error={update.error} title={tr('Could not update QR code')} />}
            </>
          )}
        </div>
      )}

      {remove.error && <ErrorPanel error={remove.error} title={tr('Could not delete QR code')} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={tr('Delete QR code?')}
        description={<p>{tr('The existing QR image and chat link will stop working.')}</p>}
        confirmLabel={tr('Delete QR code')}
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(
            { organizationId: orgId, phoneId, code: deleting },
            {
              onSuccess: () => {
                if (selected === deleting) setSelected(null);
                setDeleting(null);
                list.refetch();
                toast.success(tr('QR code deleted'));
              },
            },
          );
        }}
      />
    </Section>
  );
}
