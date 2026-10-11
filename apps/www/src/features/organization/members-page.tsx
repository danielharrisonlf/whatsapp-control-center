import { useQueryClient } from '@tanstack/react-query';
import {
  type CreatedInvitation,
  type Member,
  useCreateInvitation,
  useListInvitations,
  useListMembers,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMember,
} from '@wacc/api-client';
import { ROLES, type Role } from '@wacc/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@wacc/ui';
import { UserPlus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy';
import { PageBody, PageHeader, Section } from '@/components/page';
import { ErrorPanel, ErrorState, TableSkeleton } from '@/components/states';
import { formatRelative, humanize } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { useCan, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';

const ROLE_HELP: Record<Role, string> = {
  OWNER: 'Everything, including deleting the organization.',
  ADMIN: 'Meta connections, phone registration, webhooks and members.',
  DEVELOPER: 'Templates, flows, test messages, media and logs.',
  VIEWER: 'Read-only access. Never sees secrets.',
};

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<'ADMIN' | 'DEVELOPER' | 'VIEWER'>('DEVELOPER');
  const [created, setCreated] = React.useState<CreatedInvitation | null>(null);
  const invite = useCreateInvitation();
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setCreated(null);
      setEmail('');
      invite.reset();
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr('Invite a member')}</DialogTitle>
          <DialogDescription>
            {tr('Invitations expire in 7 days. The link is shown once; share it with the person.')}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="grid gap-2">
            <p className="text-[13px] text-muted">
              {tr('Invitation for')} <span className="font-medium text-fg">{created.email}</span> {tr('as')}{' '}
              {humanize(created.role)}:
            </p>
            <div className="flex items-center gap-1 rounded-md border border-border bg-raised pl-3">
              <code className="min-w-0 flex-1 truncate py-1.5 font-mono text-xs">{created.acceptUrl}</code>
              <CopyButton value={created.acceptUrl} label={tr('Copy invitation link')} />
            </div>
          </div>
        ) : (
          <>
            <Field label={tr('Email')} htmlFor="inv-email">
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={tr('Role')} htmlFor="inv-role" hint={localizeText(ROLE_HELP[role])}>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger id="inv-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['ADMIN', 'DEVELOPER', 'VIEWER'] as const).map((r) => (
                    <SelectItem key={r} value={r}>
                      {humanize(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {invite.error && <ErrorPanel error={invite.error} />}
          </>
        )}
        <DialogFooter>
          {created ? (
            <Button onClick={() => close(false)}>{tr('Done')}</Button>
          ) : (
            <Button
              variant="primary"
              disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
              loading={invite.isPending}
              onClick={() =>
                invite.mutate(
                  { organizationId: orgId, data: { email, role } },
                  {
                    onSuccess: (r) => {
                      setCreated(r);
                      invalidateOrg(qc, orgId, 'invitations');
                    },
                  },
                )
              }
            >
              {tr('Create invitation')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MembersPage() {
  useLocale();
  const { orgId, user, role: myRole } = useOrg();
  const qc = useQueryClient();
  const canManage = useCan('members.manage');
  const members = useListMembers(orgId);
  const invitations = useListInvitations(orgId, { query: { enabled: canManage } });
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const revoke = useRevokeInvitation();
  const [inviting, setInviting] = React.useState(false);
  const [removing, setRemoving] = React.useState<Member | null>(null);

  return (
    <>
      <PageHeader
        title={tr('Members')}
        description={tr('People with access to this organization and their roles.')}
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setInviting(true)}>
              <UserPlus /> {tr('Invite')}
            </Button>
          )
        }
      />
      {(update.error || remove.error) && (
        <ErrorPanel className="mx-6 mt-4" error={update.error ?? remove.error} />
      )}
      {members.isLoading ? (
        <TableSkeleton columns={4} />
      ) : members.error ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{tr('Member')}</TH>
              <TH>{tr('Role')}</TH>
              <TH>{tr('Last sign-in')}</TH>
              <TH className="w-24">
                <span className="sr-only">{tr('Actions')}</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {members.data?.map((m) => {
              const isMe = m.user.id === user?.id;
              const editable = canManage && !isMe && (myRole === 'OWNER' || m.role !== 'OWNER');
              return (
                <TR key={m.id}>
                  <TD>
                    <div className="font-medium text-fg">
                      {m.user.name} {isMe && <Badge className="ml-1">{tr('You')}</Badge>}
                    </div>
                    <div className="text-xs text-muted">{m.user.email}</div>
                  </TD>
                  <TD>
                    {editable ? (
                      <Select
                        value={m.role}
                        onValueChange={(role) =>
                          update.mutate(
                            { organizationId: orgId, memberId: m.id, data: { role: role as Role } },
                            {
                              onSuccess: () => {
                                invalidateOrg(qc, orgId, 'members');
                                toast.success(tr('{0} is now {1}', m.user.name, humanize(role)));
                              },
                            },
                          )
                        }
                      >
                        <SelectTrigger className="w-36" aria-label={tr('Role of {0}', m.user.name)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.filter((r) => myRole === 'OWNER' || r !== 'OWNER').map((r) => (
                            <SelectItem key={r} value={r}>
                              {humanize(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-[13px]" title={localizeText(ROLE_HELP[m.role])}>
                        {humanize(m.role)}
                      </span>
                    )}
                  </TD>
                  <TD className="text-[13px] text-muted">{formatRelative(m.user.lastLoginAt)}</TD>
                  <TD>
                    {editable && (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>
                        {tr('Remove')}
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {canManage && (invitations.data?.length ?? 0) > 0 && (
        <PageBody>
          <Section title={tr('Pending invitations')} framed>
            <ul className="divide-y divide-border">
              {invitations.data?.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="flex-1 text-fg">{i.email}</span>
                  <span className="text-muted">{humanize(i.role)}</span>
                  <span className="text-subtle">
                    {tr('expires')} {formatRelative(i.expiresAt).replace(' ago', '')}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={revoke.isPending && revoke.variables?.invitationId === i.id}
                    onClick={() =>
                      revoke.mutate(
                        { organizationId: orgId, invitationId: i.id },
                        { onSuccess: () => invalidateOrg(qc, orgId, 'invitations') },
                      )
                    }
                  >
                    {tr('Revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        </PageBody>
      )}

      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={tr('Remove {0}?', removing?.user.name)}
        description={
          <p>
            {removing?.user.email} {tr('loses access to this organization immediately.')}
          </p>
        }
        consequences={[tr('Their audit history is kept.'), tr('Meta assets are not affected.')]}
        confirmLabel={tr('Remove member')}
        loading={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(
            { organizationId: orgId, memberId: removing.id },
            { onSuccess: () => invalidateOrg(qc, orgId, 'members'), onSettled: () => setRemoving(null) },
          )
        }
      />
    </>
  );
}
