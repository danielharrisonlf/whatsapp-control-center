import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMeQueryKey,
  type MetaConnection,
  useDeleteConnection,
  useDeleteOrganization,
  useListConnections,
  useRotateCredentials,
  useSyncConnection,
  useUpdateOrganization,
} from '@wacc/api-client';
import {
  Badge,
  Button,
  buttonVariants,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
} from '@wacc/ui';
import { KeyRound, Plus, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageBody, PageHeader, Section } from '@/components/page';
import { BlockSkeleton, ErrorPanel, ErrorState } from '@/components/states';
import { ConnectionStatusBadge } from '@/components/status';
import { formatRelative, humanize, pluralize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

function RotateDialog({ connection, onClose }: { connection: MetaConnection | null; onClose: () => void }) {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [token, setToken] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const rotate = useRotateCredentials();
  return (
    <Dialog
      open={Boolean(connection)}
      onOpenChange={(v) => {
        if (v) return;
        onClose();
        setToken('');
        setSecret('');
        rotate.reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr('Replace credentials')}</DialogTitle>
          <DialogDescription>
            {tr('The new values are validated with Meta, encrypted, and never shown again. Current token:')}{' '}
            {connection?.accessTokenPreview}
          </DialogDescription>
        </DialogHeader>
        <Field label={tr('New access token')} htmlFor="rot-token" optional>
          <Input
            id="rot-token"
            type="password"
            className="font-mono"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
          />
        </Field>
        {connection && !connection.usesPlatformApp && (
          <Field label={tr('New app secret')} htmlFor="rot-secret" optional>
            <Input
              id="rot-secret"
              type="password"
              className="font-mono"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value.trim())}
            />
          </Field>
        )}
        {rotate.error && <ErrorPanel error={rotate.error} />}
        <DialogFooter>
          <Button
            variant="primary"
            disabled={!token && !secret}
            loading={rotate.isPending}
            onClick={() =>
              connection &&
              rotate.mutate(
                {
                  organizationId: orgId,
                  connectionId: connection.id,
                  data: { accessToken: token || undefined, appSecret: secret || undefined },
                },
                {
                  onSuccess: () => {
                    invalidateOrg(qc, orgId);
                    toast.success(tr('Credentials replaced'));
                    onClose();
                  },
                },
              )
            }
          >
            {tr('Validate and save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  useLocale();
  const { orgId, organization, role } = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canUpdate = useCan('org.update');
  const canConnections = useCan('connections.manage');
  const canSync = useCan('wabas.sync');
  const connections = useListConnections(orgId);
  const updateOrg = useUpdateOrganization();
  const deleteOrg = useDeleteOrganization();
  const sync = useSyncConnection();
  const disconnect = useDeleteConnection();
  const [name, setName] = React.useState(organization?.name ?? '');
  const [rotating, setRotating] = React.useState<MetaConnection | null>(null);
  const [disconnecting, setDisconnecting] = React.useState<MetaConnection | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  return (
    <>
      <PageHeader title={tr('Settings')} description={tr('Organization details and Meta connections.')} />
      <PageBody className="grid max-w-4xl gap-10">
        <Section title={tr('Organization')}>
          <form
            className="flex max-w-md items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              updateOrg.mutate(
                { organizationId: orgId, data: { name } },
                {
                  onSuccess: () => {
                    qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
                    toast.success(tr('Organization renamed'));
                  },
                },
              );
            }}
          >
            <Field label={tr('Name')} htmlFor="org-name" className="flex-1">
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canUpdate}
              />
            </Field>
            {canUpdate && (
              <Button
                type="submit"
                disabled={!name.trim() || name === organization?.name}
                loading={updateOrg.isPending}
              >
                {tr('Save')}
              </Button>
            )}
          </form>
          {updateOrg.error && <ErrorPanel className="mt-3" error={updateOrg.error} />}
        </Section>

        <Section
          title={tr('Meta connections')}
          description={tr(
            'Tokens and app secrets are encrypted at rest (AES-256-GCM). Only masked previews are ever shown.',
          )}
          actions={
            canConnections && (
              <Link
                to={orgPath(orgId, 'connect')}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <Plus /> {tr('Add connection')}
              </Link>
            )
          }
        >
          {connections.isLoading ? (
            <BlockSkeleton lines={3} />
          ) : connections.error ? (
            <ErrorState className="px-0" error={connections.error} onRetry={() => connections.refetch()} />
          ) : connections.data?.length === 0 ? (
            <p className="text-[13px] text-muted">{tr('No connections yet.')}</p>
          ) : (
            <ul className="grid gap-3">
              {connections.data?.map((c) => (
                <li key={c.id} className="grid gap-3 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-fg">{c.name}</p>
                    <ConnectionStatusBadge status={c.status} />
                    <Badge>{humanize(c.kind)}</Badge>
                    <span className="text-[13px] text-muted">{pluralize(c.wabaCount, 'account')}</span>
                    <div className="ml-auto flex gap-1.5">
                      {canSync && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={sync.isPending && sync.variables?.connectionId === c.id}
                          onClick={() =>
                            sync.mutate(
                              { organizationId: orgId, connectionId: c.id },
                              {
                                onSuccess: (r) => {
                                  invalidateOrg(qc, orgId);
                                  toast.success(
                                    `Synced ${r.wabas} accounts, ${r.phoneNumbers} numbers, ${r.templates} templates`,
                                  );
                                },
                              },
                            )
                          }
                        >
                          <RefreshCw /> {tr('Sync')}
                        </Button>
                      )}
                      {canConnections && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setRotating(c)}>
                            <KeyRound /> {tr('Credentials')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger-text"
                            onClick={() => setDisconnecting(c)}
                          >
                            {tr('Disconnect')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4">
                    <div>
                      <dt className="text-muted">{tr('App ID')}</dt>
                      <dd className="font-mono text-xs">{c.metaAppId}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{tr('Token')}</dt>
                      <dd className="font-mono text-xs">{c.accessTokenPreview}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{tr('Expires')}</dt>
                      <dd>
                        {c.tokenExpiresAt
                          ? formatRelative(c.tokenExpiresAt).replace(' ago', '')
                          : tr('Never')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{tr('Last sync')}</dt>
                      <dd>{formatRelative(c.lastSyncedAt)}</dd>
                    </div>
                  </dl>
                  {c.capabilities.missingPermissions.length > 0 && (
                    <p className="text-[13px] text-warning-text">
                      {tr('Missing permissions:')} {c.capabilities.missingPermissions.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(sync.error || disconnect.error) && (
            <ErrorPanel className="mt-3" error={sync.error ?? disconnect.error} />
          )}
        </Section>

        {role === 'OWNER' && (
          <Section title={tr('Danger zone')}>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-fg">{tr('Delete organization')}</p>
                <p className="text-[13px] text-muted">
                  {tr('Removes all local data. Nothing is deleted at Meta.')}
                </p>
              </div>
              <Button variant="danger-outline" onClick={() => setDeleting(true)}>
                {tr('Delete')}
              </Button>
            </div>
          </Section>
        )}
      </PageBody>

      <RotateDialog connection={rotating} onClose={() => setRotating(null)} />
      <ConfirmDialog
        open={Boolean(disconnecting)}
        onOpenChange={(v) => !v && setDisconnecting(null)}
        title={tr('Disconnect {0}?', disconnecting?.name)}
        description={
          <p>{tr('The encrypted token is deleted and this app stops managing these WhatsApp accounts.')}</p>
        }
        consequences={[
          tr(
            '{0} and their cached numbers, templates, flows and message history are removed from this app.',
            pluralize(disconnecting?.wabaCount ?? 0, 'account'),
          ),
          tr('Nothing is deleted at Meta: numbers keep working and templates stay approved.'),
          tr('The app stays subscribed to the WABA webhooks until you unsubscribe it in Meta.'),
        ]}
        confirmText={disconnecting?.name}
        confirmLabel={tr('Disconnect')}
        loading={disconnect.isPending}
        onConfirm={() =>
          disconnecting &&
          disconnect.mutate(
            { organizationId: orgId, connectionId: disconnecting.id },
            {
              onSuccess: () => {
                invalidateOrg(qc, orgId);
                toast.success(tr('Disconnected'));
              },
              onSettled: () => setDisconnecting(null),
            },
          )
        }
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={tr('Delete {0}?', organization?.name)}
        description={<p>{tr('All members lose access and every local record is deleted permanently.')}</p>}
        consequences={[
          tr('Meta connections, cached assets, messages, webhook events and logs are deleted.'),
          tr('Meta assets (WABAs, numbers, templates) are not affected.'),
        ]}
        confirmText={organization?.name}
        confirmLabel={tr('Delete organization')}
        loading={deleteOrg.isPending}
        onConfirm={() =>
          deleteOrg.mutate(
            { organizationId: orgId },
            {
              onSuccess: async () => {
                await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
                navigate('/', { replace: true });
              },
            },
          )
        }
      />
    </>
  );
}
