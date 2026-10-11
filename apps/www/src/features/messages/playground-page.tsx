import {
  type SendResult,
  useGetTemplate,
  useListMedia,
  useListTemplates,
  useSendMessage,
} from '@wacc/api-client';
import { buildTemplateSendComponents, type OutboundMessageType } from '@wacc/types';
import {
  Badge,
  Button,
  cn,
  Field,
  Input,
  Segmented,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@wacc/ui';
import { Clock, Plus, Send, Trash2 } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import * as React from 'react';
import { useSearchParams } from 'react-router';
import { IdChip } from '@/components/copy';
import { JsonEditor } from '@/components/json-editor';
import { JsonView } from '@/components/json-view';
import { PermissionNotice } from '@/components/notices';
import { PageHeader } from '@/components/page';
import { PhoneSelect, WabaSelect } from '@/components/pickers';
import { EmptyState, ErrorPanel, MetaErrorPanel } from '@/components/states';
import { HttpStatus, MessageStatusBadge } from '@/components/status';
import { formatShortDateTime } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { useCan, useCapabilities, useOrg } from '@/lib/org';
import { TemplateSendFields } from '../templates/template-send-fields';

type Kind = OutboundMessageType | 'flow';

const TYPES: { value: Kind; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'template', label: 'Template' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Document' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'location', label: 'Location' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'reaction', label: 'Reaction' },
  { value: 'interactive', label: 'Interactive' },
  { value: 'flow', label: 'WhatsApp Flow' },
];

type InteractiveKind = 'button' | 'list' | 'cta_url' | 'location_request_message';

interface FormState {
  text: { body: string; previewUrl: boolean };
  template: { templateId?: string; values: Record<string, string> };
  media: { ref: string; caption: string; filename: string };
  location: { latitude: string; longitude: string; name: string; address: string };
  contacts: { name: string; phone: string; email: string };
  reaction: { messageId: string; emoji: string };
  interactive: {
    kind: InteractiveKind;
    header: string;
    body: string;
    footer: string;
    buttons: string[];
    listButton: string;
    rows: string[];
    ctaText: string;
    ctaUrl: string;
  };
  flow: {
    flowId: string;
    cta: string;
    body: string;
    screen: string;
    token: string;
    mode: 'draft' | 'published';
  };
}

const initial: FormState = {
  text: { body: 'Hello from the playground 👋', previewUrl: false },
  template: { values: {} },
  media: { ref: '', caption: '', filename: '' },
  location: { latitude: '-1.4558', longitude: '-48.4902', name: 'Store', address: '' },
  contacts: { name: '', phone: '', email: '' },
  reaction: { messageId: '', emoji: '👍' },
  interactive: {
    kind: 'button',
    header: '',
    body: 'Choose an option',
    footer: '',
    buttons: ['Yes', 'No'],
    listButton: 'Options',
    rows: ['First', 'Second'],
    ctaText: 'Open site',
    ctaUrl: 'https://',
  },
  flow: {
    flowId: '',
    cta: 'Start',
    body: 'Fill in the form',
    screen: '',
    token: 'playground',
    mode: 'draft',
  },
};

const mediaRef = (ref: string) =>
  /^https?:\/\//.test(ref.trim()) ? { link: ref.trim() } : { id: ref.trim() };

function buildPayload(
  kind: Kind,
  f: FormState,
  template?: Parameters<typeof buildTemplateSendComponents>[0] & { name: string; language: string },
): { type: OutboundMessageType; payload: unknown } {
  switch (kind) {
    case 'text':
      return { type: 'text', payload: { body: f.text.body, preview_url: f.text.previewUrl } };
    case 'template':
      return {
        type: 'template',
        payload: template
          ? {
              name: template.name,
              language: { code: template.language },
              components: buildTemplateSendComponents(template, f.template.values),
            }
          : { name: '', language: { code: '' } },
      };
    case 'image':
    case 'video':
      return {
        type: kind,
        payload: { ...mediaRef(f.media.ref), ...(f.media.caption ? { caption: f.media.caption } : {}) },
      };
    case 'document':
      return {
        type: 'document',
        payload: {
          ...mediaRef(f.media.ref),
          ...(f.media.caption ? { caption: f.media.caption } : {}),
          ...(f.media.filename ? { filename: f.media.filename } : {}),
        },
      };
    case 'audio':
    case 'sticker':
      return { type: kind, payload: mediaRef(f.media.ref) };
    case 'location':
      return {
        type: 'location',
        payload: {
          latitude: Number(f.location.latitude),
          longitude: Number(f.location.longitude),
          ...(f.location.name ? { name: f.location.name } : {}),
          ...(f.location.address ? { address: f.location.address } : {}),
        },
      };
    case 'contacts':
      return {
        type: 'contacts',
        payload: [
          {
            name: { formatted_name: f.contacts.name, first_name: f.contacts.name.split(' ')[0] },
            ...(f.contacts.phone ? { phones: [{ phone: f.contacts.phone, type: 'CELL' }] } : {}),
            ...(f.contacts.email ? { emails: [{ email: f.contacts.email, type: 'WORK' }] } : {}),
          },
        ],
      };
    case 'reaction':
      return { type: 'reaction', payload: { message_id: f.reaction.messageId, emoji: f.reaction.emoji } };
    case 'interactive': {
      const i = f.interactive;
      const common = {
        ...(i.header && i.kind !== 'location_request_message'
          ? { header: { type: 'text', text: i.header } }
          : {}),
        body: { text: i.body },
        ...(i.footer && i.kind !== 'location_request_message' ? { footer: { text: i.footer } } : {}),
      };
      if (i.kind === 'button')
        return {
          type: 'interactive',
          payload: {
            type: 'button',
            ...common,
            action: {
              buttons: i.buttons
                .filter(Boolean)
                .map((t, n) => ({ type: 'reply', reply: { id: `btn_${n + 1}`, title: t } })),
            },
          },
        };
      if (i.kind === 'list')
        return {
          type: 'interactive',
          payload: {
            type: 'list',
            ...common,
            action: {
              button: i.listButton,
              sections: [
                {
                  title: i.listButton,
                  rows: i.rows.filter(Boolean).map((t, n) => ({ id: `row_${n + 1}`, title: t })),
                },
              ],
            },
          },
        };
      if (i.kind === 'cta_url')
        return {
          type: 'interactive',
          payload: {
            type: 'cta_url',
            ...common,
            action: { name: 'cta_url', parameters: { display_text: i.ctaText, url: i.ctaUrl } },
          },
        };
      return {
        type: 'interactive',
        payload: {
          type: 'location_request_message',
          body: { text: i.body },
          action: { name: 'send_location' },
        },
      };
    }
    case 'flow': {
      const fl = f.flow;
      return {
        type: 'interactive',
        payload: {
          type: 'flow',
          body: { text: fl.body },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_id: fl.flowId,
              flow_cta: fl.cta,
              flow_token: fl.token,
              mode: fl.mode,
              flow_action: 'navigate',
              ...(fl.screen ? { flow_action_payload: { screen: fl.screen } } : {}),
            },
          },
        },
      };
    }
  }
}

function StringList({
  values,
  onChange,
  max,
  label,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  label: string;
}) {
  useLocale();
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-medium text-fg">{localizeText(label)}</span>
      {values.map((v, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional inputs
        <div key={i} className="flex gap-2">
          <Input
            value={v}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            aria-label={`${label} ${i + 1}`}
            maxLength={24}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label={tr('Remove')}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {values.length < max && (
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => onChange([...values, ''])}>
          <Plus /> {tr('Add')}
        </Button>
      )}
    </div>
  );
}

interface HistoryItem {
  at: string;
  to: string;
  type: string;
  result: SendResult;
}

export function PlaygroundPage() {
  useLocale();
  const { orgId } = useOrg();
  const [params] = useSearchParams();
  const canSend = useCan('messages.send');
  const caps = useCapabilities();
  const [wabaId, setWabaId] = React.useState<string>();
  const [phoneId, setPhoneId] = React.useState<string | undefined>(params.get('phone') ?? undefined);
  const [to, setTo] = React.useState('');
  const [kind, setKind] = React.useState<Kind>(params.get('template') ? 'template' : 'text');
  const [form, setForm] = React.useState<FormState>(() => ({
    ...initial,
    template: { templateId: params.get('template') ?? undefined, values: {} },
  }));
  const [requestView, setRequestView] = React.useState<'form' | 'json'>('form');
  const [jsonOverride, setJsonOverride] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [selected, setSelected] = React.useState<number>(0);
  const send = useSendMessage();

  const templates = useListTemplates(
    orgId,
    { wabaId, status: 'APPROVED', limit: 100 },
    { query: { enabled: kind === 'template' } },
  );
  const template = useGetTemplate(orgId, form.template.templateId ?? '', {
    query: { enabled: Boolean(form.template.templateId) },
  });
  const media = useListMedia(
    orgId,
    { phoneNumberId: phoneId, limit: 50 },
    {
      query: {
        enabled: Boolean(phoneId) && ['image', 'video', 'audio', 'document', 'sticker'].includes(kind),
      },
    },
  );

  const built = buildPayload(kind, form, template.data);
  const set = <K extends keyof FormState>(key: K, patch: Partial<FormState[K]>) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));

  let payload: unknown = built.payload;
  let jsonError: string | null = null;
  if (requestView === 'json' && jsonOverride !== null) {
    try {
      payload = JSON.parse(jsonOverride);
    } catch (e) {
      jsonError = (e as Error).message;
    }
  }
  const requestBody = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to || '<recipient>',
    type: built.type,
    [built.type]: payload,
  };
  const current = history[selected];

  const submit = () => {
    if (!phoneId) return;
    send.mutate(
      { organizationId: orgId, data: { phoneNumberId: phoneId, to, type: built.type, payload } },
      {
        onSuccess: (result) => {
          setHistory((h) => [{ at: new Date().toISOString(), to, type: kind, result }, ...h].slice(0, 20));
          setSelected(0);
        },
      },
    );
  };

  if (!caps.isLoading && caps.connected && !caps.canSendMessages) {
    return (
      <>
        <PageHeader title={tr('Messaging playground')} />
        <div className="p-6">
          <PermissionNotice permission="whatsapp_business_messaging" />
        </div>
      </>
    );
  }

  const mediaKind = ['image', 'video', 'audio', 'document', 'sticker'].includes(kind);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={tr('Messaging playground')}
        description={tr(
          "Send real messages through the Cloud API and inspect the exact request and Meta's response.",
        )}
      />
      <div className="grid flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-5 border-border px-6 py-5 xl:border-r">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tr('Account')} htmlFor="pg-waba">
              <WabaSelect
                id="pg-waba"
                value={wabaId}
                onChange={(v) => {
                  setWabaId(v);
                  setPhoneId(undefined);
                }}
                allowAll
                className="w-full"
              />
            </Field>
            <Field label={tr('From')} htmlFor="pg-phone">
              <PhoneSelect
                id="pg-phone"
                value={phoneId}
                onChange={setPhoneId}
                wabaId={wabaId}
                className="w-full"
              />
            </Field>
            <Field label={tr('To')} htmlFor="pg-to">
              <Input
                id="pg-to"
                value={to}
                onChange={(e) => setTo(e.target.value.replace(/[^\d+]/g, ''))}
                placeholder={tr('5591999999999')}
                className="tabular-nums"
              />
            </Field>
          </div>

          {/* Roving focus: arrow keys move between types, Enter/Space selects. */}
          <ToggleGroup.Root
            type="single"
            value={kind}
            onValueChange={(v) => {
              if (!v) return;
              setKind(v as Kind);
              setJsonOverride(null);
            }}
            aria-label={tr('Message type')}
            className="flex flex-wrap gap-1.5"
          >
            {TYPES.map((t) => (
              <ToggleGroup.Item
                key={t.value}
                value={t.value}
                className={cn(
                  'h-7 rounded-md border px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'border-border text-muted hover:border-border-strong hover:text-fg data-[state=on]:border-fg data-[state=on]:bg-fg data-[state=on]:text-surface',
                )}
              >
                {localizeText(t.label)}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">{tr('Message')}</h2>
            <Segmented
              aria-label={tr('Request view')}
              size="sm"
              value={requestView}
              onValueChange={(v) => {
                setRequestView(v);
                setJsonOverride(v === 'json' ? JSON.stringify(built.payload, null, 2) : null);
              }}
              options={[
                { value: 'form', label: tr('Form') },
                { value: 'json', label: tr('View JSON') },
              ]}
            />
          </div>

          {requestView === 'json' ? (
            <div className="grid gap-2">
              <p className="text-[13px] text-muted">
                {tr('Editing the')} <code className="font-mono text-xs">{built.type}</code>{' '}
                {tr('object. Recipient and type come from the fields above.')}
              </p>
              <JsonEditor value={jsonOverride ?? ''} onChange={setJsonOverride} height="300px" />
              {jsonError && (
                <p className="text-[13px] text-danger-text">
                  {tr('Invalid JSON:')} {jsonError}
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {kind === 'text' && (
                <>
                  <Field
                    label={tr('Body')}
                    htmlFor="pg-body"
                    aside={
                      <span className="font-mono text-xs text-subtle tabular-nums">
                        {form.text.body.length}/4096
                      </span>
                    }
                  >
                    <Textarea
                      id="pg-body"
                      rows={5}
                      value={form.text.body}
                      onChange={(e) => set('text', { body: e.target.value })}
                    />
                  </Field>
                  <label htmlFor="pg-preview" className="flex items-center gap-2 text-[13px] text-muted">
                    <Switch
                      id="pg-preview"
                      checked={form.text.previewUrl}
                      onCheckedChange={(v) => set('text', { previewUrl: v })}
                    />{' '}
                    {tr('Show link preview')}
                  </label>
                  <p className="text-[13px] text-muted">
                    {tr(
                      'Free-form messages only reach users who wrote to you in the last 24 hours. Otherwise use a template.',
                    )}
                  </p>
                </>
              )}
              {kind === 'template' && (
                <>
                  <Field label={tr('Approved template')} htmlFor="pg-template">
                    <Select
                      value={form.template.templateId}
                      onValueChange={(v) => set('template', { templateId: v, values: {} })}
                    >
                      <SelectTrigger id="pg-template">
                        <SelectValue
                          placeholder={templates.isLoading ? tr('Loading…') : tr('Select a template')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.data?.items.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="font-mono text-[13px]">{t.name}</span>{' '}
                            <span className="text-subtle">{t.language}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {template.data && (
                    <TemplateSendFields
                      template={template.data}
                      values={form.template.values}
                      onChange={(values) => set('template', { values })}
                    />
                  )}
                </>
              )}
              {mediaKind && (
                <>
                  <Field
                    label={tr('Media ID or public HTTPS link')}
                    htmlFor="pg-media"
                    hint={tr('Upload files in Media to get an ID (valid 7 days).')}
                  >
                    <Input
                      id="pg-media"
                      value={form.media.ref}
                      onChange={(e) => set('media', { ref: e.target.value })}
                      className="font-mono text-[13px]"
                    />
                  </Field>
                  {(media.data?.items.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {media.data?.items
                        .filter(
                          (m) =>
                            !m.deletedAt && (m.kind === kind || (kind === 'sticker' && m.kind === 'sticker')),
                        )
                        .slice(0, 8)
                        .map((m) => (
                          <Button
                            key={m.id}
                            size="sm"
                            variant="secondary"
                            onClick={() => set('media', { ref: m.metaMediaId })}
                          >
                            {m.fileName ?? m.metaMediaId}
                          </Button>
                        ))}
                    </div>
                  )}
                  {(kind === 'image' || kind === 'video' || kind === 'document') && (
                    <Field label={tr('Caption')} htmlFor="pg-caption" optional>
                      <Input
                        id="pg-caption"
                        value={form.media.caption}
                        onChange={(e) => set('media', { caption: e.target.value })}
                      />
                    </Field>
                  )}
                  {kind === 'document' && (
                    <Field label={tr('File name')} htmlFor="pg-filename" optional>
                      <Input
                        id="pg-filename"
                        value={form.media.filename}
                        onChange={(e) => set('media', { filename: e.target.value })}
                      />
                    </Field>
                  )}
                </>
              )}
              {kind === 'location' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={tr('Latitude')} htmlFor="pg-lat">
                    <Input
                      id="pg-lat"
                      value={form.location.latitude}
                      onChange={(e) => set('location', { latitude: e.target.value })}
                      className="tabular-nums"
                    />
                  </Field>
                  <Field label={tr('Longitude')} htmlFor="pg-lng">
                    <Input
                      id="pg-lng"
                      value={form.location.longitude}
                      onChange={(e) => set('location', { longitude: e.target.value })}
                      className="tabular-nums"
                    />
                  </Field>
                  <Field label={tr('Name')} htmlFor="pg-locname" optional>
                    <Input
                      id="pg-locname"
                      value={form.location.name}
                      onChange={(e) => set('location', { name: e.target.value })}
                    />
                  </Field>
                  <Field label={tr('Address')} htmlFor="pg-addr" optional>
                    <Input
                      id="pg-addr"
                      value={form.location.address}
                      onChange={(e) => set('location', { address: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              {kind === 'contacts' && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={tr('Full name')} htmlFor="pg-cname">
                    <Input
                      id="pg-cname"
                      value={form.contacts.name}
                      onChange={(e) => set('contacts', { name: e.target.value })}
                    />
                  </Field>
                  <Field label={tr('Phone')} htmlFor="pg-cphone" optional>
                    <Input
                      id="pg-cphone"
                      value={form.contacts.phone}
                      onChange={(e) => set('contacts', { phone: e.target.value })}
                    />
                  </Field>
                  <Field label={tr('Email')} htmlFor="pg-cemail" optional>
                    <Input
                      id="pg-cemail"
                      value={form.contacts.email}
                      onChange={(e) => set('contacts', { email: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              {kind === 'reaction' && (
                <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                  <Field label={tr('Message to react to (wamid)')} htmlFor="pg-react-id">
                    <Input
                      id="pg-react-id"
                      value={form.reaction.messageId}
                      onChange={(e) => set('reaction', { messageId: e.target.value })}
                      className="font-mono text-[13px]"
                    />
                  </Field>
                  <Field label={tr('Emoji')} htmlFor="pg-emoji" hint={tr('Empty removes it.')}>
                    <Input
                      id="pg-emoji"
                      value={form.reaction.emoji}
                      onChange={(e) => set('reaction', { emoji: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              {kind === 'interactive' && (
                <>
                  <Segmented
                    aria-label={tr('Interactive type')}
                    size="sm"
                    value={form.interactive.kind}
                    onValueChange={(v) => set('interactive', { kind: v })}
                    options={[
                      { value: 'button', label: tr('Reply buttons') },
                      { value: 'list', label: tr('List') },
                      { value: 'cta_url', label: tr('CTA URL') },
                      { value: 'location_request_message', label: tr('Location request') },
                    ]}
                  />
                  {form.interactive.kind !== 'location_request_message' && (
                    <Field label={tr('Header')} htmlFor="pg-ih" optional>
                      <Input
                        id="pg-ih"
                        value={form.interactive.header}
                        maxLength={60}
                        onChange={(e) => set('interactive', { header: e.target.value })}
                      />
                    </Field>
                  )}
                  <Field label={tr('Body')} htmlFor="pg-ib">
                    <Textarea
                      id="pg-ib"
                      rows={3}
                      value={form.interactive.body}
                      onChange={(e) => set('interactive', { body: e.target.value })}
                    />
                  </Field>
                  {form.interactive.kind !== 'location_request_message' && (
                    <Field label={tr('Footer')} htmlFor="pg-if" optional>
                      <Input
                        id="pg-if"
                        value={form.interactive.footer}
                        maxLength={60}
                        onChange={(e) => set('interactive', { footer: e.target.value })}
                      />
                    </Field>
                  )}
                  {form.interactive.kind === 'button' && (
                    <StringList
                      label={tr('Buttons (max 3, 20 characters)')}
                      max={3}
                      values={form.interactive.buttons}
                      onChange={(buttons) => set('interactive', { buttons })}
                    />
                  )}
                  {form.interactive.kind === 'list' && (
                    <>
                      <Field label={tr('List button text')} htmlFor="pg-lb">
                        <Input
                          id="pg-lb"
                          value={form.interactive.listButton}
                          maxLength={20}
                          onChange={(e) => set('interactive', { listButton: e.target.value })}
                        />
                      </Field>
                      <StringList
                        label={tr('Rows (max 10, 24 characters)')}
                        max={10}
                        values={form.interactive.rows}
                        onChange={(rows) => set('interactive', { rows })}
                      />
                    </>
                  )}
                  {form.interactive.kind === 'cta_url' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={tr('Button text')} htmlFor="pg-ct">
                        <Input
                          id="pg-ct"
                          value={form.interactive.ctaText}
                          maxLength={20}
                          onChange={(e) => set('interactive', { ctaText: e.target.value })}
                        />
                      </Field>
                      <Field label={tr('URL')} htmlFor="pg-cu">
                        <Input
                          id="pg-cu"
                          value={form.interactive.ctaUrl}
                          onChange={(e) => set('interactive', { ctaUrl: e.target.value })}
                          className="font-mono text-[13px]"
                        />
                      </Field>
                    </div>
                  )}
                </>
              )}
              {kind === 'flow' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={tr('Flow ID (Meta)')} htmlFor="pg-fid">
                    <Input
                      id="pg-fid"
                      value={form.flow.flowId}
                      onChange={(e) => set('flow', { flowId: e.target.value })}
                      className="font-mono"
                    />
                  </Field>
                  <Field
                    label={tr('Mode')}
                    htmlFor="pg-fmode"
                    hint={tr('Draft flows can be tested before publishing.')}
                  >
                    <Select
                      value={form.flow.mode}
                      onValueChange={(v) => set('flow', { mode: v as 'draft' | 'published' })}
                    >
                      <SelectTrigger id="pg-fmode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{tr('Draft')}</SelectItem>
                        <SelectItem value="published">{tr('Published')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={tr('Body')} htmlFor="pg-fbody">
                    <Input
                      id="pg-fbody"
                      value={form.flow.body}
                      onChange={(e) => set('flow', { body: e.target.value })}
                    />
                  </Field>
                  <Field label={tr('Button text')} htmlFor="pg-fcta">
                    <Input
                      id="pg-fcta"
                      value={form.flow.cta}
                      maxLength={30}
                      onChange={(e) => set('flow', { cta: e.target.value })}
                    />
                  </Field>
                  <Field label={tr('First screen ID')} htmlFor="pg-fscreen" optional>
                    <Input
                      id="pg-fscreen"
                      value={form.flow.screen}
                      onChange={(e) => set('flow', { screen: e.target.value })}
                      className="font-mono"
                    />
                  </Field>
                  <Field label={tr('Flow token')} htmlFor="pg-ftoken">
                    <Input
                      id="pg-ftoken"
                      value={form.flow.token}
                      onChange={(e) => set('flow', { token: e.target.value })}
                      className="font-mono"
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <h3 className="text-[13px] font-medium text-fg">
              {tr('Request')}{' '}
              <span className="ml-1 font-mono text-xs font-normal text-muted">
                {tr('POST /')}
                {'{phone-number-id}'}
                {tr('/messages')}
              </span>
            </h3>
            <JsonView value={requestBody} maxHeight={260} />
          </div>
          {send.error && <ErrorPanel error={send.error} title={tr('The request was not sent')} />}
          <Button
            variant="primary"
            size="lg"
            className="w-fit"
            disabled={!canSend || !phoneId || to.replace(/\D/g, '').length < 6 || Boolean(jsonError)}
            loading={send.isPending}
            onClick={submit}
          >
            <Send /> {tr('Send message')}
          </Button>
          {!canSend && (
            <p className="text-[13px] text-muted">
              {tr('Your role cannot send messages. Ask a developer or admin.')}
            </p>
          )}
        </div>

        <aside className="grid min-w-0 content-start gap-5 bg-raised/50 px-6 py-5">
          <h2 className="text-sm font-semibold text-fg">{tr('Response')}</h2>
          {!current ? (
            <EmptyState
              icon={Clock}
              title={tr('No requests yet')}
              description={tr('Responses, wamids and Meta errors appear here.')}
              className="py-10"
            />
          ) : (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <HttpStatus code={current.result.response.status} />
                <MessageStatusBadge status={current.result.message.status} />
                <Badge className="tabular-nums">
                  {current.result.durationMs} {tr('ms')}
                </Badge>
                {current.result.messageStatus && <Badge tone="info">{current.result.messageStatus}</Badge>}
              </div>
              <div className="grid gap-1 text-[13px]">
                <span className="text-muted">{tr('wamid')}</span>
                {current.result.wamid ? (
                  <IdChip value={current.result.wamid} truncate={false} />
                ) : (
                  <span className="text-subtle">{tr('Not assigned')}</span>
                )}
              </div>
              {current.result.error && <MetaErrorPanel error={current.result.error} />}
              <div className="grid gap-1.5">
                <span className="text-[13px] text-muted">{tr('Response body')}</span>
                <JsonView value={current.result.response.body} maxHeight={300} />
              </div>
              <p className="text-[13px] text-muted">
                {tr('Delivery, read and failure statuses arrive by webhook and update this message in')}{' '}
                <a className="font-medium text-accent-text hover:underline" href={`/o/${orgId}/messages`}>
                  {tr('Messages')}
                </a>
                .
              </p>
            </div>
          )}
          {history.length > 1 && (
            <div className="grid gap-1.5">
              <h3 className="text-[13px] font-medium text-fg">{tr('This session')}</h3>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {history.map((h, i) => (
                  <li key={h.at}>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      aria-current={i === selected}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-raised',
                        i === selected && 'bg-raised',
                      )}
                    >
                      <HttpStatus code={h.result.response.status} />
                      <span className="flex-1 truncate text-fg">
                        {h.type} {tr('to')} {h.to}
                      </span>
                      <span className="text-xs text-subtle">{formatShortDateTime(h.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
