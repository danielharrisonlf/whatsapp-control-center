import type { MessageTemplate } from '@wacc/api-client';
import { getTemplateSendSlots } from '@wacc/types';
import { Field, Input } from '@wacc/ui';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';

const PLACEHOLDER: Record<string, string> = {
  text: 'Value',
  image: 'Media ID or https://… link',
  video: 'Media ID or https://… link',
  document: 'Media ID or https://… link',
  location: 'latitude|longitude|name|address',
  coupon_code: 'SAVE10',
  otp: '123456',
  flow_token: 'Optional token',
};

/** Inputs for the values a template needs at send time (variables, media, codes). */
export function TemplateSendFields({
  template,
  values,
  onChange,
}: {
  template: Pick<MessageTemplate, 'category' | 'parameterFormat' | 'components'>;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  useLocale();
  const slots = getTemplateSendSlots(template);
  if (slots.length === 0)
    return <p className="text-[13px] text-muted">{tr('This template has no parameters.')}</p>;
  return (
    <div className="grid gap-3">
      {slots.map((slot) => (
        <Field key={slot.id} label={localizeText(slot.label)} htmlFor={`slot-${slot.id}`}>
          <Input
            id={`slot-${slot.id}`}
            value={values[slot.id] ?? ''}
            placeholder={localizeText(PLACEHOLDER[slot.kind])}
            onChange={(e) => onChange({ ...values, [slot.id]: e.target.value })}
            className={slot.kind === 'text' ? undefined : 'font-mono text-[13px]'}
          />
        </Field>
      ))}
    </div>
  );
}

export function missingSlots(
  template: Pick<MessageTemplate, 'category' | 'parameterFormat' | 'components'>,
  values: Record<string, string>,
) {
  return getTemplateSendSlots(template).filter((s) => s.kind !== 'flow_token' && !values[s.id]?.trim());
}
