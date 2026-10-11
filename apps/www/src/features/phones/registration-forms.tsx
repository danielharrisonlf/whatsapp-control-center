import type { PhoneNumber } from '@wacc/api-client';
import {
  useRegisterPhoneNumber,
  useRequestVerificationCode,
  useSetTwoStepPin,
  useVerifyCode,
} from '@wacc/api-client';
import {
  Button,
  Field,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wacc/ui';
import { MessageSquareText, PhoneCall } from 'lucide-react';
import * as React from 'react';
import { ErrorPanel } from '@/components/states';
import { formatPhone } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { useOrg } from '@/lib/org';

const CODE_LANGUAGES: [string, string][] = [
  ['en_US', 'English'],
  ['pt_BR', 'Portuguese (BR)'],
  ['es_ES', 'Spanish'],
  ['fr_FR', 'French'],
  ['de_DE', 'German'],
  ['it_IT', 'Italian'],
  ['id_ID', 'Indonesian'],
  ['hi_IN', 'Hindi'],
];

export function RequestCodeForm({
  phone,
  onSent,
}: {
  phone: PhoneNumber;
  onSent: (method: 'SMS' | 'VOICE') => void;
}) {
  useLocale();
  const { orgId } = useOrg();
  const [method, setMethod] = React.useState<'SMS' | 'VOICE'>('SMS');
  const [language, setLanguage] = React.useState('en_US');
  const request = useRequestVerificationCode();
  return (
    <div className="grid gap-4">
      <RadioGroup
        value={method}
        onValueChange={(v) => setMethod(v as 'SMS' | 'VOICE')}
        className="grid gap-2 sm:grid-cols-2"
        aria-label={tr('Verification method')}
      >
        {(
          [
            ['SMS', tr('Text message'), tr('A 6-digit code by SMS.'), MessageSquareText],
            [
              'VOICE',
              tr('Voice call'),
              tr('An automated call reads the code. Use for landlines.'),
              PhoneCall,
            ],
          ] as const
        ).map(([value, title, text, Icon]) => (
          <label
            key={value}
            htmlFor={`method-${value}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent-soft/40"
          >
            <RadioGroupItem id={`method-${value}`} value={value} className="mt-0.5" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <Icon className="size-4 text-subtle" aria-hidden /> {title}
              </span>
              <span className="mt-0.5 block text-[13px] text-muted">{text}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <Field label={tr('Code language')} htmlFor="code-lang">
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger id="code-lang" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODE_LANGUAGES.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {tr(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {request.error && <ErrorPanel error={request.error} title={tr('Meta could not send the code')} />}
      <Button
        variant="primary"
        className="w-fit"
        loading={request.isPending}
        onClick={() =>
          request.mutate(
            { organizationId: orgId, phoneId: phone.id, data: { method, language } },
            { onSuccess: () => onSent(method) },
          )
        }
      >
        {tr('Send code to')} {formatPhone(phone.displayPhoneNumber)}
      </Button>
    </div>
  );
}

export function VerifyCodeForm({
  phone,
  onVerified,
  onResend,
}: {
  phone: PhoneNumber;
  onVerified: (p: PhoneNumber) => void;
  onResend?: () => void;
}) {
  useLocale();
  const { orgId } = useOrg();
  const [code, setCode] = React.useState('');
  const verify = useVerifyCode();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        verify.mutate(
          { organizationId: orgId, phoneId: phone.id, data: { code } },
          { onSuccess: onVerified },
        );
      }}
    >
      <Field
        label={tr('Verification code')}
        htmlFor="verify-code"
        hint={tr('Codes expire after a few minutes. Request a new one if it does not arrive.')}
      >
        <Input
          id="verify-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-10 w-40 font-mono text-lg tracking-[0.3em]"
          autoFocus
        />
      </Field>
      {verify.error && <ErrorPanel error={verify.error} title={tr('Code not accepted')} />}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={code.length < 4} loading={verify.isPending}>
          {tr('Verify')}
        </Button>
        {onResend && (
          <Button type="button" variant="ghost" onClick={onResend}>
            {tr('Send a new code')}
          </Button>
        )}
      </div>
    </form>
  );
}

function PinInputs({
  pin,
  setPin,
  confirm,
  setConfirm,
}: {
  pin: string;
  setPin: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
}) {
  useLocale();
  const mismatch = confirm.length === 6 && confirm !== pin;
  return (
    <div className="flex flex-wrap gap-4">
      <Field label={tr('6-digit PIN')} htmlFor="pin">
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-36 font-mono tracking-[0.3em]"
        />
      </Field>
      <Field
        label={tr('Confirm PIN')}
        htmlFor="pin-confirm"
        error={mismatch ? tr('PINs do not match.') : undefined}
      >
        <Input
          id="pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-36 font-mono tracking-[0.3em]"
        />
      </Field>
    </div>
  );
}

export function RegisterForm({
  phone,
  onRegistered,
}: {
  phone: PhoneNumber;
  onRegistered: (p: PhoneNumber) => void;
}) {
  useLocale();
  const { orgId } = useOrg();
  const [pin, setPin] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [region, setRegion] = React.useState('');
  const register = useRegisterPhoneNumber();
  const valid = pin.length === 6 && pin === confirm && (!region || /^[A-Z]{2}$/.test(region));
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        register.mutate(
          {
            organizationId: orgId,
            phoneId: phone.id,
            data: { pin, dataLocalizationRegion: region || undefined },
          },
          { onSuccess: onRegistered },
        );
      }}
    >
      <p className="text-[13px] text-muted">
        {tr(
          'If the number already has two-step verification, enter that PIN. Otherwise the PIN you choose becomes its two-step PIN. Keep it: Meta cannot show it again, and resetting it is done in WhatsApp Manager.',
        )}
      </p>
      <PinInputs pin={pin} setPin={setPin} confirm={confirm} setConfirm={setConfirm} />
      <Field
        label={tr('Local storage region')}
        htmlFor="region"
        optional
        hint={tr(
          'Only when regulation requires data at rest in a specific country (ISO code, e.g. BR, DE, IN).',
        )}
      >
        <Input
          id="region"
          value={region}
          onChange={(e) => setRegion(e.target.value.toUpperCase().slice(0, 2))}
          className="w-20 font-mono"
        />
      </Field>
      <p className="text-[13px] text-muted">
        {tr('Meta allows 10 register or deregister requests per number every 72 hours.')}
      </p>
      {register.error && <ErrorPanel error={register.error} title={tr('Registration failed')} />}
      <Button
        type="submit"
        variant="primary"
        className="w-fit"
        disabled={!valid}
        loading={register.isPending}
      >
        {tr('Register number')}
      </Button>
    </form>
  );
}

export function ChangePinForm({ phone, onDone }: { phone: PhoneNumber; onDone: () => void }) {
  useLocale();
  const { orgId } = useOrg();
  const [pin, setPin] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const setTwoStep = useSetTwoStepPin();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTwoStep.mutate({ organizationId: orgId, phoneId: phone.id, data: { pin } }, { onSuccess: onDone });
      }}
    >
      <PinInputs pin={pin} setPin={setPin} confirm={confirm} setConfirm={setConfirm} />
      <p className="text-[13px] text-muted">
        {tr(
          'There is no API to turn two-step verification off; it can only be changed or reset in WhatsApp Manager.',
        )}
      </p>
      {setTwoStep.error && <ErrorPanel error={setTwoStep.error} title={tr('PIN not changed')} />}
      <Button
        type="submit"
        variant="primary"
        className="w-fit"
        disabled={pin.length !== 6 || pin !== confirm}
        loading={setTwoStep.isPending}
      >
        {tr('Save PIN')}
      </Button>
    </form>
  );
}
