import { useQueryClient } from '@tanstack/react-query';
import { type PhoneNumber, useAddPhoneNumber, useGetPhoneNumber } from '@wacc/api-client';
import { Button, buttonVariants, cn, Field, Input } from '@wacc/ui';
import { Check } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageBody, PageHeader } from '@/components/page';
import { WabaSelect } from '@/components/pickers';
import { ErrorPanel } from '@/components/states';
import { formatPhone } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';
import { RegisterForm, RequestCodeForm, VerifyCodeForm } from './registration-forms';

const STEPS = ['Number', 'Verification method', 'Code', 'PIN', 'Registration', 'Done'] as const;

function Stepper({ step }: { step: number }) {
  useLocale();
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px]" aria-label={tr('Progress')}>
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                done && 'bg-accent text-accent-fg',
                current && 'bg-fg text-surface',
                !done && !current && 'bg-raised text-subtle ring-1 ring-border',
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn(current ? 'font-medium text-fg' : 'text-muted')}>{localizeText(label)}</span>
            {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-5 bg-border-strong" />}
          </li>
        );
      })}
    </ol>
  );
}

function NumberStep({ onAdded }: { onAdded: (p: PhoneNumber) => void }) {
  useLocale();
  const { orgId } = useOrg();
  const [wabaId, setWabaId] = React.useState<string>();
  const [cc, setCc] = React.useState('');
  const [number, setNumber] = React.useState('');
  const [name, setName] = React.useState('');
  const add = useAddPhoneNumber();
  const valid = wabaId && /^\d{1,4}$/.test(cc) && /^\d{4,15}$/.test(number) && name.trim().length >= 3;
  return (
    <form
      className="grid max-w-lg gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!wabaId) return;
        add.mutate(
          { organizationId: orgId, data: { wabaId, cc, phoneNumber: number, verifiedName: name.trim() } },
          { onSuccess: onAdded },
        );
      }}
    >
      <Field label={tr('WhatsApp account')} htmlFor="wiz-waba">
        <WabaSelect id="wiz-waba" value={wabaId} onChange={setWabaId} className="w-full" />
      </Field>
      <div className="grid grid-cols-[96px_1fr] gap-3">
        <Field label={tr('Country code')} htmlFor="wiz-cc">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-subtle">
              +
            </span>
            <Input
              id="wiz-cc"
              inputMode="numeric"
              value={cc}
              onChange={(e) => setCc(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="pl-5 tabular-nums"
              placeholder={tr('55')}
            />
          </div>
        </Field>
        <Field
          label={tr('Phone number')}
          htmlFor="wiz-number"
          hint={tr('Without the country code. The number must be able to receive an SMS or call.')}
        >
          <Input
            id="wiz-number"
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
            className="tabular-nums"
            placeholder={tr('91999999999')}
          />
        </Field>
      </div>
      <Field
        label={tr('Display name')}
        htmlFor="wiz-name"
        hint={tr(
          'Shown to customers. Meta reviews it against the display name guidelines; it should match your business brand.',
        )}
      >
        <Input
          id="wiz-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr('Acme Support')}
        />
      </Field>
      {add.error && <ErrorPanel error={add.error} title={tr('Meta did not add the number')} />}
      <Button type="submit" variant="primary" className="w-fit" disabled={!valid} loading={add.isPending}>
        {tr('Add number')}
      </Button>
    </form>
  );
}

export function AddPhonePage() {
  useLocale();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const resumeId = params.get('phone');
  const resumed = useGetPhoneNumber(orgId, resumeId ?? '', { query: { enabled: Boolean(resumeId) } });
  const [phone, setPhone] = React.useState<PhoneNumber | null>(null);
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (resumed.data && !phone) {
      setPhone(resumed.data);
      setStep(resumed.data.codeVerificationStatus === 'VERIFIED' ? 3 : 1);
    }
  }, [resumed.data, phone]);

  const update = (p: PhoneNumber, next: number) => {
    setPhone(p);
    setStep(next);
    invalidateOrg(qc, orgId);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: tr('Phone numbers'), to: orgPath(orgId, 'phone-numbers') },
          { label: tr('Add number') },
        ]}
        title={tr('Add a phone number')}
        description={tr(
          'Add the number to a WhatsApp Business Account, prove you own it, and register it on the Cloud API.',
        )}
      />
      <PageBody className="grid gap-8">
        <Stepper step={step} />
        {phone && step > 0 && step < 5 && (
          <p className="text-sm text-muted">
            {tr('Number')}{' '}
            <span className="font-medium tabular-nums text-fg">{formatPhone(phone.displayPhoneNumber)}</span>
            {phone.verifiedName && <> ({phone.verifiedName})</>}
          </p>
        )}
        {step === 0 && (
          <NumberStep onAdded={(p) => update(p, p.codeVerificationStatus === 'VERIFIED' ? 3 : 1)} />
        )}
        {step === 1 && phone && (
          <div className="max-w-xl">
            <RequestCodeForm phone={phone} onSent={() => setStep(2)} />
          </div>
        )}
        {step === 2 && phone && (
          <VerifyCodeForm phone={phone} onResend={() => setStep(1)} onVerified={(p) => update(p, 3)} />
        )}
        {(step === 3 || step === 4) && phone && (
          <div className="max-w-xl">
            <RegisterForm phone={phone} onRegistered={(p) => update(p, 5)} />
          </div>
        )}
        {step === 5 && phone && (
          <div className="max-w-lg">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-success-soft text-success-text">
                <Check className="size-4" />
              </span>
              <div>
                <p className="font-medium text-fg">
                  {formatPhone(phone.displayPhoneNumber)} {tr('is registered')}
                </p>
                <p className="text-[13px] text-muted">
                  {tr('Status:')} {phone.status ?? 'unknown'}
                  {tr('. The display name may still be under review by Meta.')}
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <Link
                to={orgPath(orgId, `phone-numbers/${phone.id}?tab=profile`)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {tr('Set up business profile')}
              </Link>
              <Link
                to={`${orgPath(orgId, 'messages/playground')}?phone=${phone.id}`}
                className={buttonVariants({ variant: 'primary' })}
              >
                {tr('Send a test message')}
              </Link>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
