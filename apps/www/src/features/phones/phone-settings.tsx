import { useQueryClient } from '@tanstack/react-query';
import {
  useBlockUsers,
  useGetPhoneCommerceSettings,
  useGetPhoneEncryption,
  useListBlockedUsers,
  useSetPhoneEncryption,
  useUnblockUsers,
  useUpdatePhoneCommerceSettings,
} from '@wacc/api-client';
import { Button, Input, Textarea } from '@wacc/ui';
import * as React from 'react';
import { toast } from 'sonner';
import { Section } from '@/components/page';
import { ErrorPanel } from '@/components/states';
import { t as tr, useLocale } from '@/lib/i18n';
import { useCan, useOrg } from '@/lib/org';

function failureDetails(failure: unknown): string {
  if (!failure || typeof failure !== 'object') return tr('Unknown Meta error');
  const row = failure as Record<string, unknown>;
  const firstError = Array.isArray(row.errors) ? row.errors[0] : row.error;
  const error = firstError && typeof firstError === 'object' ? (firstError as Record<string, unknown>) : {};
  const input = typeof row.input === 'string' ? row.input : tr('User');
  const code = typeof error.code === 'number' ? ` (code ${error.code})` : '';
  const message =
    typeof error.message === 'string'
      ? error.message
      : typeof row.message === 'string'
        ? row.message
        : typeof error.title === 'string'
          ? error.title
          : tr('Could not change block status');
  const safeMessage = message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/access_token=[^\s&]+/gi, 'access_token=[redacted]')
    .slice(0, 240);
  return `${input}: ${safeMessage}${code}`;
}

export function CommerceSettings({ phoneId }: { phoneId: string }) {
  useLocale();
  const { orgId } = useOrg();
  const canManage = useCan('phones.manage');
  const settings = useGetPhoneCommerceSettings(orgId, phoneId);
  const update = useUpdatePhoneCommerceSettings();
  const [cart, setCart] = React.useState(false);
  const [catalog, setCatalog] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    if (!settings.data || dirty) return;
    setCart(settings.data.isCartEnabled);
    setCatalog(settings.data.isCatalogVisible);
  }, [settings.data, dirty]);

  return (
    <Section
      title={tr('Commerce')}
      description={tr('Control the shopping cart and catalog visibility for this number.')}
    >
      {settings.isLoading ? <p className="text-sm text-muted">{tr('Loading commerce settings…')}</p> : null}
      {settings.error && (
        <>
          <ErrorPanel error={settings.error} title={tr('Could not load commerce settings')} />
          <Button variant="secondary" onClick={() => settings.refetch()}>
            {tr('Retry')}
          </Button>
        </>
      )}
      {settings.data && (
        <form
          className="grid max-w-xl gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canManage || update.isPending) return;
            update.mutate(
              { organizationId: orgId, phoneId, data: { isCartEnabled: cart, isCatalogVisible: catalog } },
              {
                onSuccess: async () => {
                  await settings.refetch();
                  setDirty(false);
                  toast.success(tr('Commerce settings saved'));
                },
              },
            );
          }}
        >
          <label className="flex items-center gap-3 text-sm text-fg">
            <input
              type="checkbox"
              checked={catalog}
              disabled={!canManage || update.isPending}
              onChange={(e) => {
                setDirty(true);
                setCatalog(e.target.checked);
              }}
            />
            {tr('Show catalog in WhatsApp')}
          </label>
          <label className="flex items-center gap-3 text-sm text-fg">
            <input
              type="checkbox"
              checked={cart}
              disabled={!canManage || update.isPending}
              onChange={(e) => {
                setDirty(true);
                setCart(e.target.checked);
              }}
            />
            {tr('Enable shopping cart')}
          </label>
          {canManage && (
            <Button type="submit" className="w-fit" loading={update.isPending}>
              {tr('Save settings')}
            </Button>
          )}
        </form>
      )}
      {update.error && <ErrorPanel error={update.error} title={tr('Could not save commerce settings')} />}
    </Section>
  );
}

export function FlowEncryptionSettings({ phoneId }: { phoneId: string }) {
  useLocale();
  const { orgId } = useOrg();
  const canManage = useCan('phones.manage');
  const encryption = useGetPhoneEncryption(orgId, phoneId);
  const update = useSetPhoneEncryption();
  const [publicKey, setPublicKey] = React.useState('');
  const validPem = /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/.test(publicKey.trim());

  return (
    <Section
      title={tr('Flow endpoint encryption')}
      description={tr(
        'Upload the public key used to encrypt Flow data exchange requests. Keep the matching private key on your Flow endpoint.',
      )}
    >
      {encryption.isLoading && <p className="text-sm text-muted">{tr('Loading encryption status…')}</p>}
      {encryption.error && (
        <>
          <ErrorPanel error={encryption.error} title={tr('Could not load encryption status')} />
          <Button variant="secondary" onClick={() => encryption.refetch()}>
            {tr('Retry')}
          </Button>
        </>
      )}
      {encryption.data && (
        <div className="grid max-w-2xl gap-4">
          <p className="text-sm text-fg">
            {tr('Current key:')} {encryption.data.businessPublicKey ? tr('Configured') : tr('Not configured')}
            {encryption.data.signatureStatus ? ` · Signature ${encryption.data.signatureStatus}` : ''}
          </p>
          {canManage && (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!validPem || update.isPending) return;
                update.mutate(
                  { organizationId: orgId, phoneId, data: { businessPublicKey: publicKey.trim() } },
                  {
                    onSuccess: () => {
                      setPublicKey('');
                      encryption.refetch();
                      toast.success(tr('Flow public key saved'));
                    },
                  },
                );
              }}
            >
              <label htmlFor="flow-public-key" className="text-sm font-medium text-fg">
                {tr('New public key (PEM)')}
              </label>
              <Textarea
                id="flow-public-key"
                rows={8}
                spellCheck={false}
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="-----BEGIN PUBLIC KEY-----"
              />
              <Button type="submit" className="w-fit" disabled={!validPem} loading={update.isPending}>
                {tr('Set public key')}
              </Button>
            </form>
          )}
        </div>
      )}
      {update.error && <ErrorPanel error={update.error} title={tr('Could not set Flow public key')} />}
    </Section>
  );
}

export function BlockedUsersSettings({ phoneId }: { phoneId: string }) {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const canSend = useCan('messages.send');
  const [cursor, setCursor] = React.useState<string>();
  const [previous, setPrevious] = React.useState<(string | undefined)[]>([]);
  const [users, setUsers] = React.useState('');
  const [failures, setFailures] = React.useState<unknown[]>([]);
  const blocked = useListBlockedUsers(orgId, phoneId, { after: cursor, limit: 50 });
  const block = useBlockUsers();
  const unblock = useUnblockUsers();
  const parsed = users
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <Section
      title={tr('Blocked users')}
      description={tr('Blocked users cannot message this business number.')}
    >
      {canSend && (
        <form
          className="mb-5 flex max-w-xl flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!parsed.length || block.isPending) return;
            block.mutate(
              { organizationId: orgId, phoneId, data: { users: parsed } },
              {
                onSuccess: (result) => {
                  setFailures(result.failed);
                  if (result.failed.length)
                    toast.warning(
                      tr('{0} blocked; {1} failed', result.successful.length, result.failed.length),
                    );
                  else toast.success(tr('{0} user(s) blocked', result.successful.length));
                  if (!result.failed.length) setUsers('');
                  setCursor(undefined);
                  setPrevious([]);
                  qc.invalidateQueries({
                    queryKey: [`/organizations/${orgId}/phone-numbers/${phoneId}/blocked-users`],
                  });
                },
              },
            );
          }}
        >
          <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium text-fg" htmlFor="block-users">
            {tr('Phone numbers to block')}
          </label>
          <Input
            id="block-users"
            className="min-w-64 flex-1"
            value={users}
            onChange={(e) => setUsers(e.target.value)}
            placeholder={tr('One or more numbers, separated by commas')}
          />
          <Button type="submit" disabled={!parsed.length} loading={block.isPending}>
            {tr('Block')}
          </Button>
        </form>
      )}
      {block.error && <ErrorPanel error={block.error} title={tr('Could not block users')} />}
      {unblock.error && <ErrorPanel error={unblock.error} title={tr('Could not unblock user')} />}
      {failures.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg border border-border p-3 text-sm text-danger-text">
          <p className="font-medium">{tr('Some users could not be changed:')}</p>
          <p className="mt-1 whitespace-pre-line">{failures.map(failureDetails).join('\n')}</p>
        </div>
      )}
      {blocked.error && (
        <>
          <ErrorPanel error={blocked.error} title={tr('Could not load blocked users')} />
          <Button variant="secondary" onClick={() => blocked.refetch()}>
            {tr('Retry')}
          </Button>
        </>
      )}
      {blocked.isLoading ? <p className="text-sm text-muted">{tr('Loading blocked users…')}</p> : null}
      {blocked.data && (
        <div className="max-w-xl">
          {blocked.data.items.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {blocked.data.items.map((item) => (
                <li key={item.waId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="tabular-nums">{item.waId}</span>
                  {canSend && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={unblock.isPending}
                      onClick={() =>
                        unblock.mutate(
                          { organizationId: orgId, phoneId, data: { users: [item.waId] } },
                          {
                            onSuccess: (result) => {
                              setFailures(result.failed);
                              if (result.failed.length) toast.warning(tr('Could not unblock this user'));
                              else toast.success(tr('User unblocked'));
                              qc.invalidateQueries({
                                queryKey: [`/organizations/${orgId}/phone-numbers/${phoneId}/blocked-users`],
                              });
                            },
                          },
                        )
                      }
                    >
                      {tr('Unblock')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{tr('No blocked users on this page.')}</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!previous.length}
              onClick={() => {
                setCursor(previous.at(-1));
                setPrevious((v) => v.slice(0, -1));
              }}
            >
              {tr('Previous')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!blocked.data.nextCursor}
              onClick={() => {
                setPrevious((v) => [...v, cursor]);
                setCursor(blocked.data.nextCursor ?? undefined);
              }}
            >
              {tr('Next')}
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
