import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ConnectResult,
  useConnectEmbeddedSignup,
  useConnectManual,
  useGetMetaConfig,
  useListConnections,
} from '@wacc/api-client';
import { Badge, Button, buttonVariants, cn, Field, Input } from '@wacc/ui';
import { ArrowRight, Check, ChevronRight, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { META_LINKS } from '@/components/notices';
import { PageBody, PageHeader } from '@/components/page';
import { BlockSkeleton, ErrorPanel, PartialErrorBanner } from '@/components/states';
import { pluralize } from '@/lib/format';
import { formatMessage, localizeText, t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useCan, useOrg } from '@/lib/org';
import {
  launchEmbeddedSignup,
  listenForSessionInfo,
  loadFacebookSdk,
  type SessionInfo,
} from './embedded-signup';

function ConnectedSummary({ result }: { result: ConnectResult }) {
  useLocale();
  const { orgId } = useOrg();
  const { report, connection } = result;
  const subscribed = connection.wabaCount > 0;
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-success-soft text-success-text">
        <Check className="size-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-fg">{tr('WhatsApp connected')}</h2>
      <dl className="mx-auto mt-5 grid max-w-sm grid-cols-3 divide-x divide-border rounded-lg border border-border">
        {[
          [tr('Accounts'), report.wabas],
          [tr('Phone numbers'), report.phoneNumbers],
          [tr('Templates'), report.templates],
        ].map(([label, n]) => (
          <div key={label} className="px-3 py-3">
            <dt className="text-xs text-muted">{localizeText(label)}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[13px] text-muted">
        {subscribed
          ? tr('The app was subscribed to webhooks for the connected accounts.')
          : tr('No account linked yet.')}
      </p>
      {report.errors.length > 0 && (
        <div className="mt-4 text-left">
          <PartialErrorBanner>
            <p className="font-medium">{tr('Some resources could not be synced')}</p>
            <ul className="mt-1 grid gap-0.5 text-fg/80">
              {report.errors.map((e) => (
                <li key={`${e.resource}:${e.id}`}>
                  <code className="font-mono text-xs">{e.resource}</code> {e.message}
                </li>
              ))}
            </ul>
          </PartialErrorBanner>
        </div>
      )}
      <div className="mt-6 flex justify-center gap-2">
        <Link to={orgPath(orgId, 'developers/webhooks')} className={buttonVariants({ variant: 'secondary' })}>
          {tr('Check webhook health')}
        </Link>
        <Link to={orgPath(orgId)} className={buttonVariants({ variant: 'primary' })}>
          {tr('Go to dashboard')} <ArrowRight />
        </Link>
      </div>
    </div>
  );
}

function EmbeddedSignupPanel({ onConnected }: { onConnected: (r: ConnectResult) => void }) {
  useLocale();
  const { orgId } = useOrg();
  const config = useGetMetaConfig(orgId);
  const connect = useConnectEmbeddedSignup();
  const [stage, setStage] = React.useState<'idle' | 'popup' | 'exchanging'>('idle');
  const [sdkError, setSdkError] = React.useState<string | null>(null);
  const session = React.useRef<SessionInfo | null>(null);

  React.useEffect(() => listenForSessionInfo((info) => (session.current = info)), []);

  if (config.isLoading) return <BlockSkeleton lines={3} />;
  const es = config.data?.embeddedSignup;

  const start = async () => {
    if (!es?.appId || !es.configId) return;
    setSdkError(null);
    session.current = null;
    try {
      const sdk = await loadFacebookSdk(es.appId, config.data!.graphApiVersion);
      setStage('popup');
      const code = await launchEmbeddedSignup(sdk, es.configId);
      // The session-info message can arrive just after the callback; the code lives ~30 seconds.
      if (!session.current) await new Promise((r) => setTimeout(r, 800));
      const info = session.current as SessionInfo | null;
      setStage('exchanging');
      connect.mutate(
        {
          organizationId: orgId,
          data: {
            code,
            wabaId: info?.wabaId,
            phoneNumberId: info?.phoneNumberId,
            businessId: info?.businessId,
          },
        },
        { onSuccess: onConnected, onSettled: () => setStage('idle') },
      );
    } catch (error) {
      setStage('idle');
      const info = session.current as SessionInfo | null;
      setSdkError(
        info?.event === 'CANCEL'
          ? formatMessage(
              'Signup was closed at step "{0}". Nothing was connected.',
              info.currentStep ?? 'unknown',
            )
          : info?.event === 'ERROR'
            ? (info.errorMessage ?? 'Meta reported an error during signup.')
            : (error as Error).message,
      );
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-base font-semibold text-fg">{tr('Connect with Meta')}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr(
            "Opens Meta's Embedded Signup. You pick or create a business portfolio, a WhatsApp Business Account and a phone number, and grant this app access. We then subscribe to webhooks and sync everything.",
          )}
        </p>
      </div>
      <ul className="grid gap-1.5 text-[13px] text-muted">
        {[
          tr('Business portfolio, WABA and phone number selected in Meta'),
          'whatsapp_business_management and whatsapp_business_messaging granted',
          tr('Token stored encrypted; never shown again'),
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-accent-text" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
      {es?.available ? (
        <Button variant="primary" size="lg" className="w-fit" onClick={start} loading={stage !== 'idle'}>
          {stage === 'popup'
            ? tr('Waiting for Meta…')
            : stage === 'exchanging'
              ? tr('Connecting…')
              : tr('Connect with Meta')}
        </Button>
      ) : (
        <div className="rounded-lg border border-border bg-raised px-3.5 py-3 text-[13px]">
          <p className="flex items-center gap-1.5 font-medium text-fg">
            <TriangleAlert className="size-4 text-warning-text" aria-hidden />{' '}
            {tr('Embedded Signup is not configured on this server')}
          </p>
          <p className="mt-1 text-muted">
            {tr('Set')}{' '}
            {es?.missing.map((m) => (
              <code key={m} className="mx-0.5 rounded bg-surface px-1 font-mono text-xs text-fg">
                {m}
              </code>
            ))}{' '}
            {tr(
              'in the API environment. It requires a Meta app with Facebook Login for Business and, to onboard other businesses, Tech Provider or Solution Partner status. Use the advanced setup meanwhile.',
            )}
          </p>
        </div>
      )}
      {sdkError && <ErrorPanel error={new Error(sdkError)} title={tr('Signup did not complete')} />}
      {connect.error && <ErrorPanel error={connect.error} title={tr('Could not finish the connection')} />}
    </div>
  );
}

const manualSchema = z.object({
  name: z.string().trim().min(1, 'Name the connection.').max(80),
  appId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, 'The App ID is numeric (App settings → Basic).'),
  appSecret: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i, 'The App secret has 32 hexadecimal characters.'),
  accessToken: z.string().trim().min(20, 'Paste the full system user token.'),
  wabaId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, 'The WABA ID is numeric.'),
});

function ManualPanel({ onConnected }: { onConnected: (r: ConnectResult) => void }) {
  useLocale();
  const { orgId } = useOrg();
  const connect = useConnectManual();
  const form = useForm({
    resolver: zodResolver(manualSchema),
    defaultValues: { name: 'Production', appId: '', appSecret: '', accessToken: '', wabaId: '' },
  });
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={form.handleSubmit((data) =>
        connect.mutate({ organizationId: orgId, data }, { onSuccess: onConnected }),
      )}
    >
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-raised px-3.5 py-3 text-[13px] text-muted">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
        <p>
          {tr('For technical admins with their own Meta app. Create a')}{' '}
          <a
            className="font-medium text-accent-text hover:underline"
            href={META_LINKS.systemUsers}
            target="_blank"
            rel="noreferrer"
          >
            {tr('system user')}
          </a>{' '}
          {tr('with')} <code className="font-mono text-xs">{tr('whatsapp_business_management')}</code>{' '}
          {tr('and')} <code className="font-mono text-xs">{tr('whatsapp_business_messaging')}</code>
          {tr(', assign the WABA to it and generate a token. This connection gets its own webhook URL.')}
        </p>
      </div>
      <Field label={tr('Connection name')} htmlFor="m-name" error={e.name?.message}>
        <Input id="m-name" {...form.register('name')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('Meta App ID')} htmlFor="m-app" error={e.appId?.message}>
          <Input
            id="m-app"
            inputMode="numeric"
            className="font-mono"
            autoComplete="off"
            {...form.register('appId')}
          />
        </Field>
        <Field label={tr('WABA ID')} htmlFor="m-waba" error={e.wabaId?.message}>
          <Input
            id="m-waba"
            inputMode="numeric"
            className="font-mono"
            autoComplete="off"
            {...form.register('wabaId')}
          />
        </Field>
      </div>
      <Field
        label={tr('App secret')}
        htmlFor="m-secret"
        hint={tr('Used to verify webhook signatures and inspect the token.')}
        error={e.appSecret?.message}
      >
        <Input
          id="m-secret"
          type="password"
          className="font-mono"
          autoComplete="off"
          spellCheck={false}
          {...form.register('appSecret')}
        />
      </Field>
      <Field
        label={tr('Access token')}
        htmlFor="m-token"
        hint={tr('Encrypted with AES-256-GCM before storage; only a masked preview is shown afterwards.')}
        error={e.accessToken?.message}
      >
        <Input
          id="m-token"
          type="password"
          className="font-mono"
          autoComplete="off"
          spellCheck={false}
          {...form.register('accessToken')}
        />
      </Field>
      {connect.error && (
        <ErrorPanel error={connect.error} title={tr('Meta did not accept these credentials')} />
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={connect.isPending}>
          {tr('Validate and connect')}
        </Button>
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <ShieldCheck className="size-4 text-subtle" aria-hidden /> {tr('Checked with Meta before saving')}
        </span>
      </div>
    </form>
  );
}

export function ConnectPage() {
  useLocale();
  const { orgId } = useOrg();
  const canManage = useCan('connections.manage');
  const connections = useListConnections(orgId);
  const qc = useQueryClient();
  const [result, setResult] = React.useState<ConnectResult | null>(null);
  const [mode, setMode] = React.useState<'embedded' | 'manual'>('embedded');

  const onConnected = (r: ConnectResult) => {
    setResult(r);
    qc.invalidateQueries();
  };

  const hasConnections = (connections.data?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title={hasConnections ? tr('Add a Meta connection') : tr('Connect your WhatsApp Business account')}
        description={tr('Connect your Meta account to start managing phone numbers, templates and webhooks.')}
        meta={
          hasConnections ? (
            <Badge tone="success" dot>
              {pluralize(connections.data!.length, 'connection')} {tr('active')}
            </Badge>
          ) : undefined
        }
      />
      <PageBody>
        {result ? (
          <ConnectedSummary result={result} />
        ) : !canManage ? (
          <ErrorPanel
            error={new Error(tr('Only owners and admins can connect Meta accounts.'))}
            title={tr('Not allowed')}
          />
        ) : (
          <div className="grid max-w-5xl gap-8 lg:grid-cols-[1fr_280px]">
            <div className="grid gap-6">
              {mode === 'embedded' ? (
                <EmbeddedSignupPanel onConnected={onConnected} />
              ) : (
                <ManualPanel onConnected={onConnected} />
              )}
            </div>
            <aside className="grid h-fit gap-2 text-[13px]">
              <p className="text-xs font-medium text-subtle">{tr('Setup method')}</p>
              {(
                [
                  [
                    'embedded',
                    tr('Embedded Signup'),
                    tr('Recommended. Meta guides you through account and number setup.'),
                  ],
                  [
                    'manual',
                    tr('Advanced: manual setup'),
                    tr('Bring your own app ID, app secret and system user token.'),
                  ],
                ] as const
              ).map(([value, title, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    mode === value ? 'border-accent bg-accent-soft/40' : 'border-border hover:bg-raised',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">{title}</span>
                    <span className="mt-0.5 block text-muted">{text}</span>
                  </span>
                  <ChevronRight className="mt-0.5 size-4 text-subtle" aria-hidden />
                </button>
              ))}
            </aside>
          </div>
        )}
      </PageBody>
    </>
  );
}
