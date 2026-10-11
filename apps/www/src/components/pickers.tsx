import { useListPhoneNumbers, useListWabas } from '@wacc/api-client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wacc/ui';
import { formatPhone } from '@/lib/format';
import { t as tr, useLocale } from '@/lib/i18n';
import { useOrg } from '@/lib/org';

const ALL = '__all__';

export function WabaSelect({
  value,
  onChange,
  allowAll,
  id,
  className,
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  allowAll?: boolean;
  id?: string;
  className?: string;
}) {
  useLocale();
  const { orgId } = useOrg();
  const wabas = useListWabas(orgId);
  return (
    <Select
      value={value ?? (allowAll ? ALL : undefined)}
      onValueChange={(v) => onChange(v === ALL ? undefined : v)}
    >
      <SelectTrigger id={id} className={className ?? 'w-56'} aria-label={tr('WhatsApp account')}>
        <SelectValue placeholder={wabas.isLoading ? tr('Loading…') : tr('Select an account')} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL}>{tr('All accounts')}</SelectItem>}
        {wabas.data?.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            {w.displayLabel ?? w.name ?? w.metaWabaId}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PhoneSelect({
  value,
  onChange,
  wabaId,
  allowAll,
  id,
  className,
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  wabaId?: string;
  allowAll?: boolean;
  id?: string;
  className?: string;
}) {
  useLocale();
  const { orgId } = useOrg();
  const phones = useListPhoneNumbers(orgId, wabaId ? { wabaId } : undefined);
  return (
    <Select
      value={value ?? (allowAll ? ALL : undefined)}
      onValueChange={(v) => onChange(v === ALL ? undefined : v)}
    >
      <SelectTrigger id={id} className={className ?? 'w-60'} aria-label={tr('Phone number')}>
        <SelectValue placeholder={phones.isLoading ? tr('Loading…') : tr('Select a phone number')} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL}>{tr('All phone numbers')}</SelectItem>}
        {phones.data?.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {formatPhone(p.displayPhoneNumber)} {p.verifiedName ? `(${p.verifiedName})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
