import { useQueryClient } from '@tanstack/react-query';
import {
  getGetPhoneNumberQueryKey,
  type PhoneNumber,
  useDeregisterPhoneNumber,
  useGetPhoneNumber,
  useSyncPhoneNumber,
  useUpdatePhoneNumber,
} from '@wacc/api-client';
import { MESSAGING_LIMIT_TIERS } from '@wacc/types';
import {
  Button,
  buttonVariants,
  ConfirmDialog,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@wacc/ui';
import { RefreshCw, Send } from 'lucide-react';
import * as React from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { IdChip } from '@/components/copy';
import { ManualActionNotice, META_LINKS, PermissionNotice } from '@/components/notices';
import { DetailList, PageBody, PageHeader, Section } from '@/components/page';
import { BlockSkeleton, ErrorPanel, ErrorState } from '@/components/states';
import { NameStatusBadge, PhoneStatusBadge, QualityBadge } from '@/components/status';
import { formatDateTime, formatPhone, formatRelative, humanize } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useCapabilities, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';
import { BusinessProfileEditor } from './business-profile';
import { PhoneQrCodes } from './phone-qr-codes';
import { BlockedUsersSettings, CommerceSettings, FlowEncryptionSettings } from './phone-settings';
import { ChangePinForm, RegisterForm, RequestCodeForm, VerifyCodeForm } from './registration-forms';

type Panel = 'code' | 'verify' | 'register' | 'pin' | null;

function DisplayLabelEditor({
  phone,
  onChange,
}: {
  phone: PhoneNumber;
  onChange: (phone?: PhoneNumber) => void;
}) {
  useLocale();
  const { orgId } = useOrg();
  const [label, setLabel] = React.useState(phone.displayLabel ?? '');
  const update = useUpdatePhoneNumber();
  React.useEffect(() => setLabel(phone.displayLabel ?? ''), [phone.displayLabel]);
  return (
    <form
      className="grid max-w-md gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (update.isPending) return;
        update.mutate(
          { organizationId: orgId, phoneId: phone.id, data: { displayLabel: label.trim() || null } },
          {
            onSuccess: (next) => {
              onChange(next);
              toast.success(tr('Label saved'));
            },
          },
        );
      }}
    >
      <label htmlFor="phone-display-label" className="text-sm font-medium text-fg">
        {tr('Internal label')}
      </label>
      <Input
        id="phone-display-label"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        maxLength={80}
        placeholder={tr("For your team's reference")}
      />
      <Button type="submit" className="w-fit" loading={update.isPending}>
        {tr('Save label')}
      </Button>
      {update.error && <ErrorPanel error={update.error} title={tr('Could not save label')} />}
    </form>
  );
}

function RegistrationSection({
  phone,
  onChange,
}: {
  phone: PhoneNumber;
  onChange: (p?: PhoneNumber) => void;
}) {
  useLocale();
  const { orgId } = useOrg();
  const [panel, setPanel] = React.useState<Panel>(null);
  const [confirmDeregister, setConfirmDeregister] = React.useState(false);
  const deregister = useDeregisterPhoneNumber();
  const caps = useCapabilities();
  const verified = phone.codeVerificationStatus === 'VERIFIED';
  const connected = phone.status === 'CONNECTED';

  if (!caps.isLoading && !caps.canManagePhoneNumbers) {
    return <PermissionNotice permission={caps.missingPermissions[0] ?? 'whatsapp_business_messaging'} />;
  }

  return (
    <div className="grid gap-4">
      <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {[
          [
            tr('Ownership verified'),
            verified,
            verified ? tr('Code verified') : humanize(phone.codeVerificationStatus ?? 'NOT_VERIFIED'),
          ],
          [tr('Registered on Cloud API'), connected, humanize(phone.status)],
          [
            tr('Display name'),
            phone.nameStatus === 'APPROVED' || phone.nameStatus === 'AVAILABLE_WITHOUT_REVIEW',
            humanize(phone.nameStatus),
          ],
        ].map(([label, ok, detail]) => (
          <li key={label as string} className="bg-surface px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
              <span
                aria-hidden
                className={ok ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-border-strong'}
              />
              {label as string}
            </p>
            <p className="mt-0.5 text-xs text-muted">{detail as string}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {!verified && (
          <Button variant={panel === 'code' ? 'primary' : 'secondary'} onClick={() => setPanel('code')}>
            {tr('Request verification code')}
          </Button>
        )}
        {!verified && (
          <Button variant="secondary" onClick={() => setPanel('verify')}>
            {tr('I have a code')}
          </Button>
        )}
        {!connected && (
          <Button
            variant={panel === 'register' ? 'primary' : 'secondary'}
            onClick={() => setPanel('register')}
          >
            {tr('Register')}
          </Button>
        )}
        <Button variant="secondary" onClick={() => setPanel('pin')}>
          {tr('Change two-step PIN')}
        </Button>
        {connected && (
          <Button variant="danger-outline" onClick={() => setConfirmDeregister(true)}>
            {tr('Deregister')}
          </Button>
        )}
      </div>

      {panel && (
        <div className="rounded-lg border border-border p-4">
          {panel === 'code' && (
            <RequestCodeForm
              phone={phone}
              onSent={(m) => {
                toast.success(m === 'SMS' ? tr('Code sent by SMS') : tr('Calling the number now'));
                setPanel('verify');
              }}
            />
          )}
          {panel === 'verify' && (
            <VerifyCodeForm
              phone={phone}
              onResend={() => setPanel('code')}
              onVerified={(p) => {
                onChange(p);
                toast.success(tr('Number verified'));
                setPanel(p.status === 'CONNECTED' ? null : 'register');
              }}
            />
          )}
          {panel === 'register' && (
            <RegisterForm
              phone={phone}
              onRegistered={(p) => {
                onChange(p);
                toast.success(tr('Number registered on the Cloud API'));
                setPanel(null);
              }}
            />
          )}
          {panel === 'pin' && (
            <ChangePinForm
              phone={phone}
              onDone={() => {
                toast.success(tr('Two-step PIN changed'));
                setPanel(null);
              }}
            />
          )}
        </div>
      )}
      {deregister.error && <ErrorPanel error={deregister.error} title={tr('Deregistration failed')} />}

      <ConfirmDialog
        open={confirmDeregister}
        onOpenChange={setConfirmDeregister}
        title={tr('Deregister {0}?', formatPhone(phone.displayPhoneNumber))}
        description={
          <p>{tr('The number stops working on the Cloud API until it is registered again with its PIN.')}</p>
        }
        consequences={[
          tr('Sending fails immediately, including approved templates.'),
          tr('Incoming messages are no longer delivered to webhooks.'),
          tr('Counts toward the limit of 10 register/deregister requests in 72 hours.'),
          tr('Not allowed for numbers also used in the WhatsApp Business app (coexistence).'),
        ]}
        confirmText={phone.displayPhoneNumber?.replace(/\D/g, '').slice(-4)}
        confirmLabel={tr('Deregister number')}
        loading={deregister.isPending}
        onConfirm={() =>
          deregister.mutate(
            { organizationId: orgId, phoneId: phone.id },
            {
              onSuccess: (p) => {
                onChange(p);
                setConfirmDeregister(false);
                toast.success(tr('Number deregistered'));
              },
              onError: () => setConfirmDeregister(false),
            },
          )
        }
      />
    </div>
  );
}

export function PhoneDetailPage() {
  useLocale();
  const { phoneId } = useParams<{ phoneId: string }>();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const phone = useGetPhoneNumber(orgId, phoneId!);
  const sync = useSyncPhoneNumber();
  const canSync = useCan('wabas.sync');
  const canManage = useCan('phones.manage');
  const tab = params.get('tab') ?? 'overview';

  if (phone.isLoading) return <BlockSkeleton className="max-w-2xl px-6 py-8" lines={8} />;
  if (phone.error || !phone.data) return <ErrorState error={phone.error} onRetry={() => phone.refetch()} />;
  const p = phone.data;
  const setPhone = (next?: PhoneNumber) => {
    if (next) qc.setQueryData(getGetPhoneNumberQueryKey(orgId, p.id), next);
    invalidateOrg(qc, orgId);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: tr('Phone numbers'), to: orgPath(orgId, 'phone-numbers') },
          { label: formatPhone(p.displayPhoneNumber) },
        ]}
        title={<span className="tabular-nums">{formatPhone(p.displayPhoneNumber)}</span>}
        description={p.verifiedName ?? tr('No display name')}
        meta={
          <>
            <PhoneStatusBadge status={p.status} />
            <QualityBadge rating={p.qualityRating} />
            <IdChip value={p.metaPhoneNumberId} />
          </>
        }
        actions={
          <>
            <Link
              to={`${orgPath(orgId, 'messages/playground')}?phone=${p.id}`}
              className={buttonVariants({ variant: 'secondary' })}
            >
              <Send /> {tr('Send test')}
            </Link>
            {canSync && (
              <Button
                variant="secondary"
                loading={sync.isPending}
                onClick={() =>
                  sync.mutate(
                    { organizationId: orgId, phoneId: p.id },
                    {
                      onSuccess: (n) => {
                        setPhone(n);
                        toast.success(tr('Refreshed from Meta'));
                      },
                    },
                  )
                }
              >
                <RefreshCw /> {tr('Sync')}
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid gap-6">
        {sync.error && <ErrorPanel error={sync.error} title={tr('Could not refresh from Meta')} />}
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="overview">{tr('Overview')}</TabsTrigger>
            <TabsTrigger value="profile">{tr('Business profile')}</TabsTrigger>
            <TabsTrigger value="commerce">{tr('Commerce')}</TabsTrigger>
            <TabsTrigger value="encryption">{tr('Flow encryption')}</TabsTrigger>
            <TabsTrigger value="blocked">{tr('Blocked users')}</TabsTrigger>
            <TabsTrigger value="qr">{tr('QR codes')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="grid max-w-5xl gap-8 pt-6">
            {canManage && (
              <Section
                title={tr('Internal label')}
                description={tr('A name for your team; it does not change the WhatsApp display name.')}
              >
                <DisplayLabelEditor phone={p} onChange={setPhone} />
              </Section>
            )}
            {canManage && (
              <Section
                title={tr('Registration')}
                description={tr('Verify ownership, register on the Cloud API and manage the two-step PIN.')}
              >
                <RegistrationSection phone={p} onChange={setPhone} />
              </Section>
            )}
            <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
              <Section title={tr('Details')}>
                <DetailList
                  items={[
                    {
                      label: tr('Display number'),
                      value: <span className="tabular-nums">{formatPhone(p.displayPhoneNumber)}</span>,
                    },
                    {
                      label: tr('Display name'),
                      value: (
                        <span className="inline-flex items-center gap-2">
                          {p.verifiedName ?? '—'} <NameStatusBadge status={p.nameStatus} />
                        </span>
                      ),
                    },
                    {
                      label: tr('Phone number ID'),
                      value: <IdChip value={p.metaPhoneNumberId} truncate={false} />,
                    },
                    {
                      label: tr('Account'),
                      value: (
                        <Link
                          className="text-accent-text hover:underline"
                          to={orgPath(orgId, `accounts/${p.waba.id}`)}
                        >
                          {p.waba.name ?? p.waba.metaWabaId}
                        </Link>
                      ),
                    },
                    { label: tr('Quality rating'), value: <QualityBadge rating={p.qualityRating} /> },
                    {
                      label: tr('Messaging limit'),
                      value: p.messagingLimitTier
                        ? tr(MESSAGING_LIMIT_TIERS[p.messagingLimitTier] ?? p.messagingLimitTier)
                        : null,
                      hint: tr('Business-initiated conversations per 24h, set per business portfolio.'),
                    },
                    { label: tr('Throughput'), value: humanize(p.throughputLevel) },
                    { label: tr('Platform'), value: humanize(p.platformType) },
                    { label: tr('Account mode'), value: humanize(p.accountMode) },
                    {
                      label: tr('Official business account'),
                      value: p.isOfficialBusinessAccount ? tr('Yes') : tr('No'),
                    },
                    { label: tr('Onboarded'), value: formatDateTime(p.lastOnboardedTime) },
                    { label: tr('Last synced'), value: formatRelative(p.lastSyncedAt) },
                  ]}
                />
              </Section>
              <div className="grid h-fit gap-4">
                <ManualActionNotice
                  href={META_LINKS.phoneNumbers}
                  linkLabel="Open phone numbers in WhatsApp Manager"
                >
                  {tr(
                    'Changing the display name, resetting a forgotten two-step PIN, requesting an official business account and deleting a number are done in WhatsApp Manager.',
                  )}
                </ManualActionNotice>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="profile" className="pt-6">
            <BusinessProfileEditor phone={p} />
          </TabsContent>
          <TabsContent value="commerce" className="pt-6">
            <CommerceSettings phoneId={p.id} />
          </TabsContent>
          <TabsContent value="encryption" className="pt-6">
            <FlowEncryptionSettings phoneId={p.id} />
          </TabsContent>
          <TabsContent value="blocked" className="pt-6">
            <BlockedUsersSettings phoneId={p.id} />
          </TabsContent>
          <TabsContent value="qr" className="pt-6">
            <PhoneQrCodes phoneId={p.id} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
