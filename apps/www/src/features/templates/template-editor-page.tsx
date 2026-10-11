import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateTemplate,
  useEditTemplate,
  useGetTemplate,
  useListFlows,
  useUploadTemplateHeaderSample,
} from '@wacc/api-client';
import {
  buildTemplateCreatePayload,
  draftFromMetaTemplate,
  emptyTemplateDraft,
  type HeaderFormat,
  TEMPLATE_LIMITS as LIMITS,
  TEMPLATE_LANGUAGES,
  type TemplateButtonDraft,
  type TemplateDraft,
  type TemplateIssue,
  validateTemplateDraft,
  variableKeys,
} from '@wacc/types';
import {
  Button,
  CharCount,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Braces,
  CircleAlert,
  Code,
  Copy,
  ExternalLink,
  Italic,
  List,
  Phone,
  Plus,
  Reply,
  Strikethrough,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { JsonEditor } from '@/components/json-editor';
import { PageHeader } from '@/components/page';
import { WabaSelect } from '@/components/pickers';
import { BlockSkeleton, ErrorPanel, ErrorState } from '@/components/states';
import { humanize } from '@/lib/format';
import { formatMessage, localizeText, t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useOrg } from '@/lib/org';
import { invalidateOrg } from '@/lib/query-client';
import { previewFromDraft } from './template-preview-model';
import { WhatsAppPreview } from './wa-preview';

type Issues = TemplateIssue[];
const errorAt = (issues: Issues, path: string) =>
  issues.find((i) => i.path === path && i.severity === 'error')?.message;
const warningsAt = (issues: Issues, prefix: string) =>
  issues.filter((i) => i.severity === 'warning' && i.path.startsWith(prefix));

const CATEGORY_HELP: Record<TemplateDraft['category'], string> = {
  MARKETING: 'Promotions, offers, announcements, re-engagement.',
  UTILITY: 'Updates about an existing order, account or request.',
  AUTHENTICATION: 'One-time passcodes. Meta defines the text.',
};

function BuilderSection({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  useLocale();
  return (
    <section className="grid gap-3 border-b border-border py-5 first:pt-0 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Warnings({ items }: { items: Issues }) {
  useLocale();
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-1">
      {items.map((w) => (
        <li key={w.message} className="flex gap-1.5 text-[13px] text-warning-text">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w.message}
        </li>
      ))}
    </ul>
  );
}

/** Example inputs for every variable in a text. */
function ExamplesEditor({
  text,
  examples,
  onChange,
  issues,
  pathPrefix,
}: {
  text: string;
  examples: Record<string, string>;
  onChange: (examples: Record<string, string>) => void;
  issues: Issues;
  pathPrefix: string;
}) {
  useLocale();
  const keys = variableKeys(text);
  if (keys.length === 0) return null;
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-raised p-3">
      <p className="text-xs font-medium text-muted">
        {tr('Sample values (sent to Meta for review, also used in the preview)')}
      </p>
      {keys.map((key) => {
        const err = errorAt(issues, `${pathPrefix}.examples.${key}`);
        return (
          <div key={key} className="grid grid-cols-[88px_1fr] items-start gap-2">
            <label htmlFor={`${pathPrefix}-ex-${key}`} className="pt-1.5 font-mono text-xs text-fg">
              {`{{${key}}}`}
            </label>
            <div>
              <Input
                id={`${pathPrefix}-ex-${key}`}
                value={examples[key] ?? ''}
                onChange={(e) => onChange({ ...examples, [key]: e.target.value })}
                aria-invalid={err ? true : undefined}
                placeholder={key === '1' ? 'e.g. Daniel' : tr('Sample for {0}', key)}
              />
              {err && <p className="mt-1 text-xs text-danger-text">{err}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function nextVariable(draft: TemplateDraft, text: string) {
  const keys = variableKeys(text);
  if (draft.parameterFormat === 'NAMED') return `{{var_${keys.length + 1}}}`;
  const numbers = keys.map(Number).filter((n) => Number.isInteger(n));
  return `{{${(numbers.length ? Math.max(...numbers) : 0) + 1}}}`;
}

/** Textarea with WhatsApp formatting shortcuts and "add variable". */
function BodyEditor({
  draft,
  setDraft,
  issues,
}: {
  draft: TemplateDraft;
  setDraft: (d: TemplateDraft) => void;
  issues: Issues;
}) {
  useLocale();
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const wrap = (before: string, after = before) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    setDraft({ ...draft, body: { ...draft.body, text: next } });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, e + before.length);
    });
  };
  const tools = [
    { label: tr('Bold'), icon: Bold, run: () => wrap('*') },
    { label: tr('Italic'), icon: Italic, run: () => wrap('_') },
    { label: tr('Strikethrough'), icon: Strikethrough, run: () => wrap('~') },
    { label: tr('Monospace'), icon: Code, run: () => wrap('```') },
  ];
  const err = errorAt(issues, 'body.text');
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5" role="toolbar" aria-label={tr('Formatting')}>
          {tools.map((t) => (
            <Button
              key={t.label}
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={localizeText(t.label)}
              title={localizeText(t.label)}
              onClick={t.run}
            >
              <t.icon />
            </Button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => wrap(nextVariable(draft, draft.body.text), '')}
          >
            <Braces /> {tr('Add variable')}
          </Button>
        </div>
        <CharCount value={draft.body.text.length} max={LIMITS.body} />
      </div>
      <Textarea
        ref={ref}
        id="body-text"
        rows={6}
        value={draft.body.text}
        onChange={(e) => setDraft({ ...draft, body: { ...draft.body, text: e.target.value } })}
        placeholder={tr('Hello {{1}}, your order {{2}} is ready for pickup.')}
        aria-invalid={err ? true : undefined}
        aria-label={tr('Body text')}
      />
      {issues
        .filter((i) => i.path === 'body.text' && i.severity === 'error')
        .map((i) => (
          <p key={i.message} className="text-[13px] text-danger-text">
            {i.message}
          </p>
        ))}
      <Warnings items={warningsAt(issues, 'body')} />
      <ExamplesEditor
        text={draft.body.text}
        examples={draft.body.examples}
        onChange={(examples) => setDraft({ ...draft, body: { ...draft.body, examples } })}
        issues={issues}
        pathPrefix="body"
      />
    </div>
  );
}

const BUTTON_TYPES: {
  type: TemplateButtonDraft['type'];
  label: string;
  icon: typeof Reply;
  make: () => TemplateButtonDraft;
}[] = [
  { type: 'QUICK_REPLY', label: 'Quick reply', icon: Reply, make: () => ({ type: 'QUICK_REPLY', text: '' }) },
  {
    type: 'URL',
    label: 'Visit website',
    icon: ExternalLink,
    make: () => ({ type: 'URL', text: '', url: 'https://', example: '' }),
  },
  {
    type: 'PHONE_NUMBER',
    label: 'Call phone number',
    icon: Phone,
    make: () => ({ type: 'PHONE_NUMBER', text: '', phoneNumber: '' }),
  },
  {
    type: 'COPY_CODE',
    label: 'Copy offer code',
    icon: Copy,
    make: () => ({ type: 'COPY_CODE', example: '' }),
  },
  {
    type: 'FLOW',
    label: 'Complete flow',
    icon: List,
    make: () => ({ type: 'FLOW', text: '', flowId: '', flowAction: 'navigate', navigateScreen: '' }),
  },
];

function buttonDisabledReason(draft: TemplateDraft, type: TemplateButtonDraft['type']): string | null {
  const count = (t: string) => draft.buttons.filter((b) => b.type === t).length;
  if (draft.buttons.length >= LIMITS.buttons) return tr('Up to 10 buttons');
  if (type === 'URL' && count(tr('URL')) >= LIMITS.urlButtons) return tr('Up to 2 website buttons');
  if (type === 'PHONE_NUMBER' && count('PHONE_NUMBER') >= LIMITS.phoneButtons)
    return tr('Only 1 phone button');
  if (type === 'COPY_CODE' && draft.category !== 'MARKETING') return tr('Marketing templates only');
  if (type === 'COPY_CODE' && count('COPY_CODE') >= 1) return tr('Only 1 copy code button');
  if (type === 'FLOW' && count('FLOW') >= 1) return tr('Only 1 flow button');
  return null;
}

function ButtonsEditor({
  draft,
  setDraft,
  issues,
  wabaId,
}: {
  draft: TemplateDraft;
  setDraft: (d: TemplateDraft) => void;
  issues: Issues;
  wabaId?: string;
}) {
  useLocale();
  const { orgId } = useOrg();
  const flows = useListFlows(
    orgId,
    { wabaId },
    { query: { enabled: draft.buttons.some((b) => b.type === 'FLOW') } },
  );
  const update = (i: number, patch: Partial<TemplateButtonDraft>) =>
    setDraft({
      ...draft,
      buttons: draft.buttons.map((b, j) => (j === i ? ({ ...b, ...patch } as TemplateButtonDraft) : b)),
    });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...draft.buttons];
    const [b] = next.splice(i, 1);
    next.splice(i + dir, 0, b!);
    setDraft({ ...draft, buttons: next });
  };
  const add = (b: TemplateButtonDraft) => {
    // Keep quick replies grouped (Meta rejects them interleaved with other types).
    const buttons = [...draft.buttons];
    if (b.type === 'QUICK_REPLY') {
      const lastQr = buttons.map((x) => x.type).lastIndexOf('QUICK_REPLY');
      buttons.splice(lastQr >= 0 ? lastQr + 1 : buttons.length, 0, b);
    } else buttons.push(b);
    setDraft({ ...draft, buttons });
  };

  return (
    <div className="grid gap-3">
      {draft.buttons.map((b, i) => {
        const meta = BUTTON_TYPES.find((t) => t.type === b.type)!;
        const path = `buttons.${i}`;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: buttons are positional
          <div key={i} className="grid gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <meta.icon className="size-4 text-subtle" aria-hidden />
              <span className="flex-1 text-[13px] font-medium text-fg">{localizeText(meta.label)}</span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tr('Move up')}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tr('Move down')}
                disabled={i === draft.buttons.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tr('Remove button')}
                onClick={() => setDraft({ ...draft, buttons: draft.buttons.filter((_, j) => j !== i) })}
              >
                <Trash2 />
              </Button>
            </div>
            {b.type !== 'COPY_CODE' && (
              <Field
                label={tr('Button text')}
                htmlFor={`${path}-text`}
                aside={<CharCount value={b.text.length} max={LIMITS.buttonText} />}
                error={errorAt(issues, `${path}.text`)}
              >
                <Input
                  id={`${path}-text`}
                  value={b.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                />
              </Field>
            )}
            {b.type === 'URL' && (
              <>
                <Field
                  label={tr('URL')}
                  htmlFor={`${path}-url`}
                  hint={tr('Add {{1}} at the end for a dynamic suffix (e.g. a tracking code).')}
                  error={errorAt(issues, `${path}.url`)}
                >
                  <Input
                    id={`${path}-url`}
                    value={b.url}
                    onChange={(e) => update(i, { url: e.target.value })}
                    className="font-mono text-[13px]"
                  />
                </Field>
                {b.url.includes('{{') && (
                  <Field
                    label={tr('Sample suffix')}
                    htmlFor={`${path}-ex`}
                    error={errorAt(issues, `${path}.example`)}
                  >
                    <Input
                      id={`${path}-ex`}
                      value={b.example}
                      onChange={(e) => update(i, { example: e.target.value })}
                      className="font-mono text-[13px]"
                    />
                  </Field>
                )}
              </>
            )}
            {b.type === 'PHONE_NUMBER' && (
              <Field
                label={tr('Phone number')}
                htmlFor={`${path}-phone`}
                hint={tr('With country code, e.g. +5591999999999.')}
                error={errorAt(issues, `${path}.phoneNumber`)}
              >
                <Input
                  id={`${path}-phone`}
                  value={b.phoneNumber}
                  onChange={(e) => update(i, { phoneNumber: e.target.value })}
                  className="tabular-nums"
                />
              </Field>
            )}
            {b.type === 'COPY_CODE' && (
              <Field
                label={tr('Sample offer code')}
                htmlFor={`${path}-code`}
                aside={<CharCount value={b.example.length} max={LIMITS.copyCode} />}
                error={errorAt(issues, `${path}.example`)}
              >
                <Input
                  id={`${path}-code`}
                  value={b.example}
                  onChange={(e) => update(i, { example: e.target.value })}
                  className="font-mono"
                />
              </Field>
            )}
            {b.type === 'FLOW' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={tr('Flow')} htmlFor={`${path}-flow`} error={errorAt(issues, `${path}.flowId`)}>
                  <Select value={b.flowId || undefined} onValueChange={(v) => update(i, { flowId: v })}>
                    <SelectTrigger id={`${path}-flow`}>
                      <SelectValue
                        placeholder={flows.isLoading ? tr('Loading…') : tr('Select a published flow')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(flows.data ?? [])
                        .filter((f) => f.status === 'PUBLISHED')
                        .map((f) => (
                          <SelectItem key={f.id} value={f.metaFlowId}>
                            {f.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={tr('Action')} htmlFor={`${path}-action`}>
                  <Select
                    value={b.flowAction}
                    onValueChange={(v) => update(i, { flowAction: v as 'navigate' | 'data_exchange' })}
                  >
                    <SelectTrigger id={`${path}-action`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="navigate">{tr('Navigate to a screen')}</SelectItem>
                      <SelectItem value="data_exchange">{tr('Data exchange (endpoint)')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {b.flowAction === 'navigate' && (
                  <Field
                    label={tr('First screen ID')}
                    htmlFor={`${path}-screen`}
                    error={errorAt(issues, `${path}.navigateScreen`)}
                    className="sm:col-span-2"
                  >
                    <Input
                      id={`${path}-screen`}
                      value={b.navigateScreen}
                      onChange={(e) => update(i, { navigateScreen: e.target.value })}
                      className="font-mono"
                    />
                  </Field>
                )}
              </div>
            )}
          </div>
        );
      })}
      {issues
        .filter((i) => i.path === 'buttons')
        .map((i) => (
          <p key={i.message} className="text-[13px] text-danger-text">
            {i.message}
          </p>
        ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
            disabled={draft.buttons.length >= LIMITS.buttons}
          >
            <Plus /> {tr('Add button')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          {BUTTON_TYPES.map((t) => {
            const reason = buttonDisabledReason(draft, t.type);
            return (
              <DropdownMenuItem key={t.type} disabled={Boolean(reason)} onSelect={() => add(t.make())}>
                <t.icon />
                <span className="flex-1">{localizeText(t.label)}</span>
                {reason && <span className="text-xs text-subtle">{reason}</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function HeaderEditor({
  draft,
  setDraft,
  issues,
  wabaId,
}: {
  draft: TemplateDraft;
  setDraft: (d: TemplateDraft) => void;
  issues: Issues;
  wabaId?: string;
}) {
  useLocale();
  const { orgId } = useOrg();
  const upload = useUploadTemplateHeaderSample();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const h = draft.header;
  const setHeader = (patch: Partial<TemplateDraft['header']>) =>
    setDraft({ ...draft, header: { ...h, ...patch } });
  const accept =
    { IMAGE: 'image/jpeg,image/png', VIDEO: 'video/mp4', DOCUMENT: 'application/pdf' }[h.format as 'IMAGE'] ??
    '';

  return (
    <div className="grid gap-3">
      <Segmented<HeaderFormat>
        aria-label={tr('Header type')}
        size="sm"
        value={h.format}
        onValueChange={(format) =>
          setHeader({ format, mediaHandle: '', mediaPreviewUrl: undefined, mediaFileName: undefined })
        }
        options={(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'] as HeaderFormat[]).map((f) => ({
          value: f,
          label: humanize(f),
        }))}
        className="flex-wrap"
      />
      {h.format === 'TEXT' && (
        <>
          <Field
            label={tr('Header text')}
            htmlFor="header-text"
            aside={<CharCount value={h.text.length} max={LIMITS.headerText} />}
            error={errorAt(issues, 'header.text')}
            hint={tr('Up to one variable.')}
          >
            <Input id="header-text" value={h.text} onChange={(e) => setHeader({ text: e.target.value })} />
          </Field>
          <ExamplesEditor
            text={h.text}
            examples={h.examples}
            onChange={(examples) => setHeader({ examples })}
            issues={issues}
            pathPrefix="header"
          />
        </>
      )}
      {(h.format === 'IMAGE' || h.format === 'VIDEO' || h.format === 'DOCUMENT') && (
        <div className="grid gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="sr-only"
            aria-label={tr('Header sample file')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file || !wabaId) return;
              upload.mutate(
                { organizationId: orgId, wabaId, data: { file } },
                {
                  onSuccess: (r) =>
                    setHeader({
                      mediaHandle: r.handle,
                      mediaFileName: r.fileName,
                      mediaPreviewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
                    }),
                },
              );
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              loading={upload.isPending}
              disabled={!wabaId}
              onClick={() => fileRef.current?.click()}
            >
              <Upload /> {h.mediaHandle ? tr('Replace sample') : tr('Upload sample')}
            </Button>
            <span className="text-[13px] text-muted">
              {h.mediaHandle
                ? (h.mediaFileName ?? tr('Sample uploaded'))
                : !wabaId
                  ? tr('Choose a WhatsApp account first.')
                  : tr('Meta reviews this sample. The real file is chosen at send time.')}
            </span>
          </div>
          {errorAt(issues, 'header.mediaHandle') && (
            <p className="text-[13px] text-danger-text">{errorAt(issues, 'header.mediaHandle')}</p>
          )}
          {upload.error && <ErrorPanel error={upload.error} title={tr('Upload failed')} />}
        </div>
      )}
      {h.format === 'LOCATION' && (
        <p className="text-[13px] text-muted">
          {tr('The location (coordinates, name, address) is provided when sending.')}
        </p>
      )}
    </div>
  );
}

function AuthenticationEditor({
  draft,
  setDraft,
  issues,
}: {
  draft: TemplateDraft;
  setDraft: (d: TemplateDraft) => void;
  issues: Issues;
}) {
  useLocale();
  const a = draft.authentication;
  const set = (patch: Partial<TemplateDraft['authentication']>) =>
    setDraft({ ...draft, authentication: { ...a, ...patch } });
  return (
    <>
      <BuilderSection
        title={tr('Message')}
        description={tr('Meta writes the text of authentication templates; you choose the extras.')}
      >
        <label htmlFor="auth-security" className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium text-fg">{tr('Security recommendation')}</span>
            <span className="block text-[13px] text-muted">
              {tr('Adds "For your security, do not share this code."')}
            </span>
          </span>
          <Switch
            id="auth-security"
            checked={a.addSecurityRecommendation}
            onCheckedChange={(v) => set({ addSecurityRecommendation: v })}
          />
        </label>
        <Field
          label={tr('Code expiration (minutes)')}
          htmlFor="auth-exp"
          optional
          error={errorAt(issues, 'authentication.codeExpirationMinutes')}
          hint={tr('Shown in the footer, 1 to 90.')}
        >
          <Input
            id="auth-exp"
            type="number"
            min={1}
            max={90}
            value={a.codeExpirationMinutes ?? ''}
            onChange={(e) => set({ codeExpirationMinutes: e.target.value ? Number(e.target.value) : null })}
            className="w-28 tabular-nums"
          />
        </Field>
      </BuilderSection>
      <BuilderSection title={tr('Code delivery')}>
        <Segmented
          aria-label={tr('OTP type')}
          value={a.otpType}
          onValueChange={(otpType) => set({ otpType })}
          options={[
            { value: 'COPY_CODE', label: tr('Copy code') },
            { value: 'ONE_TAP', label: tr('One-tap autofill') },
            { value: 'ZERO_TAP', label: tr('Zero-tap') },
          ]}
        />
        <Field
          label={tr('Button text')}
          htmlFor="auth-btn"
          aside={<CharCount value={a.buttonText.length} max={LIMITS.buttonText} />}
          error={errorAt(issues, 'authentication.buttonText')}
        >
          <Input id="auth-btn" value={a.buttonText} onChange={(e) => set({ buttonText: e.target.value })} />
        </Field>
        {a.otpType !== 'COPY_CODE' && (
          <>
            <p className="text-[13px] text-muted">
              {tr('Autofill works only in your Android app. Copy code is used as a fallback.')}
            </p>
            <Field label={tr('Autofill button text')} htmlFor="auth-autofill">
              <Input
                id="auth-autofill"
                value={a.autofillText}
                onChange={(e) => set({ autofillText: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={tr('Android package name')}
                htmlFor="auth-pkg"
                error={errorAt(issues, 'authentication.packageName')}
              >
                <Input
                  id="auth-pkg"
                  value={a.packageName}
                  onChange={(e) => set({ packageName: e.target.value })}
                  className="font-mono text-[13px]"
                  placeholder={tr('com.example.app')}
                />
              </Field>
              <Field
                label={tr('App signature hash')}
                htmlFor="auth-hash"
                error={errorAt(issues, 'authentication.signatureHash')}
              >
                <Input
                  id="auth-hash"
                  value={a.signatureHash}
                  onChange={(e) => set({ signatureHash: e.target.value })}
                  className="font-mono text-[13px]"
                />
              </Field>
            </div>
          </>
        )}
        {a.otpType === 'ZERO_TAP' && (
          <label htmlFor="auth-terms" className="flex items-start gap-2.5 text-[13px] text-muted">
            <Checkbox
              id="auth-terms"
              checked={a.zeroTapTermsAccepted}
              onCheckedChange={(v) => set({ zeroTapTermsAccepted: v === true })}
              className="mt-0.5"
            />
            {tr(
              "I agree to Meta's zero-tap terms: the code is delivered to the app without user action, and I am responsible for its use.",
            )}
          </label>
        )}
      </BuilderSection>
    </>
  );
}

export function TemplateEditorPage() {
  useLocale();
  const { orgId } = useOrg();
  const { templateId } = useParams<{ templateId?: string }>();
  const [params] = useSearchParams();
  const duplicateFrom = params.get('from');
  const sourceId = templateId ?? duplicateFrom ?? '';
  const source = useGetTemplate(orgId, sourceId, { query: { enabled: Boolean(sourceId) } });
  const isEdit = Boolean(templateId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [draft, setDraft] = React.useState<TemplateDraft>(emptyTemplateDraft);
  const [wabaId, setWabaId] = React.useState<string | undefined>(params.get('waba') ?? undefined);
  const [mode, setMode] = React.useState<'builder' | 'json'>('builder');
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (!source.data || loaded.current) return;
    loaded.current = true;
    const d = draftFromMetaTemplate(source.data);
    if (!isEdit) d.name = `${source.data.name}_copy`.slice(0, 512);
    setDraft(d);
    setWabaId(source.data.waba.id);
  }, [source.data, isEdit]);

  const locale = useLocale();
  // biome-ignore lint/correctness/useExhaustiveDependencies: translations read the locale store, so recompute on language changes.
  const issues = React.useMemo(
    () => validateTemplateDraft(draft).map((issue) => ({ ...issue, message: tr(issue.message) })),
    [draft, locale],
  );
  const errors = issues.filter((i) => i.severity === 'error');
  const payload = React.useMemo(() => buildTemplateCreatePayload(draft), [draft]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: generated preview labels read the locale store.
  const preview = React.useMemo(() => previewFromDraft(draft), [draft, locale]);

  const create = useCreateTemplate();
  const edit = useEditTemplate();
  const mutation = isEdit ? edit : create;
  const approvedEdit = isEdit && source.data?.status === 'APPROVED';

  const switchMode = (next: 'builder' | 'json') => {
    if (next === 'json') {
      setJsonText(JSON.stringify(payload, null, 2));
      setJsonError(null);
    }
    setMode(next);
  };

  const onJsonChange = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text) as {
        name?: unknown;
        language?: unknown;
        category?: unknown;
        components?: unknown;
        parameter_format?: string;
      };
      if (
        typeof parsed.name !== 'string' ||
        typeof parsed.language !== 'string' ||
        !Array.isArray(parsed.components)
      ) {
        setJsonError('The payload needs "name", "language", "category" and a "components" array.');
        return;
      }
      if (isEdit && (parsed.name !== source.data?.name || parsed.language !== source.data?.language)) {
        setJsonError('Name and language cannot change when editing a template.');
        return;
      }
      setJsonError(null);
      setDraft(
        draftFromMetaTemplate({
          ...(parsed as { name: string; language: string; category: string; components: unknown[] }),
          parameterFormat: parsed.parameter_format,
        }),
      );
    } catch (e) {
      setJsonError(formatMessage('Invalid JSON: {0}', (e as Error).message));
    }
  };

  const submit = () => {
    if (isEdit && source.data) {
      edit.mutate(
        {
          organizationId: orgId,
          templateId: source.data.id,
          data: { components: payload.components, category: approvedEdit ? undefined : draft.category },
        },
        {
          onSuccess: (t) => {
            invalidateOrg(qc, orgId, 'templates');
            toast.success(tr('Edit submitted. Meta reviews the template again.'));
            navigate(orgPath(orgId, `templates/${t.id}`));
          },
        },
      );
    } else if (wabaId) {
      create.mutate(
        { organizationId: orgId, data: { wabaId, payload } },
        {
          onSuccess: (r) => {
            invalidateOrg(qc, orgId, 'templates');
            toast.success(tr('Submitted for review: {0}', r.template.status.toLowerCase()));
            for (const w of r.warnings) toast.warning(tr(w.message));
            navigate(orgPath(orgId, `templates/${r.template.id}`));
          },
        },
      );
    }
  };

  if (sourceId && source.isLoading) return <BlockSkeleton className="max-w-2xl px-6 py-8" lines={8} />;
  if (sourceId && source.error) return <ErrorState error={source.error} onRetry={() => source.refetch()} />;

  const isAuth = draft.category === 'AUTHENTICATION';
  const nameSanitize = (v: string) =>
    v
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        breadcrumbs={[
          { label: tr('Templates'), to: orgPath(orgId, 'templates') },
          { label: isEdit ? tr('Edit') : tr('New template') },
        ]}
        title={
          isEdit ? (
            <span className="font-mono">{draft.name}</span>
          ) : duplicateFrom ? (
            tr('Duplicate template')
          ) : (
            tr('New template')
          )
        }
        description={
          approvedEdit
            ? tr(
                'Approved templates can be edited once every 24 hours and 10 times every 30 days. The edit goes through review again.',
              )
            : tr('Build the message on the left; the preview shows what customers will see.')
        }
        actions={
          <>
            <Segmented
              aria-label={tr('Editor mode')}
              value={mode}
              onValueChange={switchMode}
              options={[
                { value: 'builder', label: tr('Builder') },
                { value: 'json', label: tr('JSON') },
              ]}
            />
            <Button
              variant="primary"
              disabled={errors.length > 0 || (!isEdit && !wabaId) || Boolean(jsonError && mode === 'json')}
              loading={mutation.isPending}
              onClick={submit}
            >
              {isEdit ? tr('Submit edit') : tr('Submit for review')}
            </Button>
          </>
        }
      />
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 border-border px-6 py-5 lg:border-r">
          {mutation.error && (
            <ErrorPanel
              className="mb-5"
              error={mutation.error}
              title={isEdit ? tr('Meta rejected the edit') : tr('Meta rejected the template')}
            />
          )}
          {mode === 'json' ? (
            <div className="grid gap-3">
              <p className="text-[13px] text-muted">
                {tr('This is the exact body sent to')}{' '}
                <code className="font-mono text-xs">
                  {tr('POST /')}
                  {'{waba-id}'}
                  {tr('/message_templates')}
                </code>
                {tr('. Edits are validated with the same rules as the builder.')}
              </p>
              <JsonEditor value={jsonText} onChange={onJsonChange} height="560px" />
              {jsonError && (
                <p className="flex items-center gap-1.5 text-[13px] text-danger-text">
                  <CircleAlert className="size-4" aria-hidden /> {tr(jsonError)}
                </p>
              )}
            </div>
          ) : (
            <div className="max-w-2xl">
              <BuilderSection title={tr('Basics')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={tr('WhatsApp account')} htmlFor="tpl-waba">
                    {isEdit ? (
                      <Input id="tpl-waba" value={source.data?.waba.name ?? ''} disabled />
                    ) : (
                      <WabaSelect id="tpl-waba" value={wabaId} onChange={setWabaId} className="w-full" />
                    )}
                  </Field>
                  <Field label={tr('Language')} htmlFor="tpl-lang" error={errorAt(issues, 'language')}>
                    <Select
                      value={draft.language}
                      onValueChange={(language) => setDraft({ ...draft, language })}
                      disabled={isEdit}
                    >
                      <SelectTrigger id="tpl-lang">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TEMPLATE_LANGUAGES).map(([code, label]) => (
                          <SelectItem key={code} value={code}>
                            {localizeText(label)}{' '}
                            <span className="ml-1 font-mono text-xs text-subtle">{code}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field
                  label={tr('Name')}
                  htmlFor="tpl-name"
                  error={errorAt(issues, 'name')}
                  hint={
                    isEdit
                      ? tr('Names cannot change after creation.')
                      : tr(
                          'Lowercase letters, numbers and underscores. A deleted approved name cannot be reused for 30 days.',
                        )
                  }
                >
                  <Input
                    id="tpl-name"
                    value={draft.name}
                    disabled={isEdit}
                    onChange={(e) => setDraft({ ...draft, name: nameSanitize(e.target.value) })}
                    className="font-mono"
                    placeholder={tr('order_ready')}
                  />
                </Field>
                <fieldset className="grid gap-2" disabled={approvedEdit}>
                  <legend className="mb-1.5 text-[13px] font-medium text-fg">{tr('Category')}</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={draft.category === c}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            category: c,
                            buttons:
                              c === 'AUTHENTICATION'
                                ? []
                                : draft.buttons.filter((b) => c === 'MARKETING' || b.type !== 'COPY_CODE'),
                          })
                        }
                        className={cn(
                          'rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                          draft.category === c
                            ? 'border-accent bg-accent-soft/40'
                            : 'border-border hover:bg-raised',
                        )}
                      >
                        <span className="block text-sm font-medium text-fg">{humanize(c)}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {localizeText(CATEGORY_HELP[c])}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                {!isAuth && (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="font-medium text-fg">{tr('Variables')}</span>
                      <Segmented
                        aria-label={tr('Parameter format')}
                        size="sm"
                        value={draft.parameterFormat}
                        onValueChange={(parameterFormat) => setDraft({ ...draft, parameterFormat })}
                        options={[
                          { value: 'POSITIONAL', label: tr('{{1}} Positional'), disabled: isEdit },
                          { value: 'NAMED', label: tr('{{name}} Named'), disabled: isEdit },
                        ]}
                      />
                    </div>
                    {!isEdit && (
                      <label htmlFor="tpl-allow" className="flex items-center gap-2 text-[13px] text-muted">
                        <Switch
                          id="tpl-allow"
                          checked={draft.allowCategoryChange}
                          onCheckedChange={(v) => setDraft({ ...draft, allowCategoryChange: v })}
                        />
                        {tr('Let Meta change the category instead of rejecting')}
                      </label>
                    )}
                  </div>
                )}
              </BuilderSection>

              {isAuth ? (
                <AuthenticationEditor draft={draft} setDraft={setDraft} issues={issues} />
              ) : (
                <>
                  <BuilderSection
                    title={tr('Header')}
                    description={tr('Optional. Text, media or location shown above the body.')}
                  >
                    <HeaderEditor draft={draft} setDraft={setDraft} issues={issues} wabaId={wabaId} />
                  </BuilderSection>
                  <BuilderSection
                    title={tr('Body')}
                    description={tr(
                      'The main message. Use *bold*, _italic_, ~strikethrough~ and ```monospace```.',
                    )}
                  >
                    <BodyEditor draft={draft} setDraft={setDraft} issues={issues} />
                  </BuilderSection>
                  <BuilderSection
                    title={tr('Footer')}
                    description={tr('Optional short line in gray, without variables.')}
                    aside={<CharCount value={draft.footer.text.length} max={LIMITS.footer} />}
                  >
                    <Input
                      value={draft.footer.text}
                      onChange={(e) => setDraft({ ...draft, footer: { text: e.target.value } })}
                      aria-label={tr('Footer text')}
                      aria-invalid={errorAt(issues, 'footer.text') ? true : undefined}
                      placeholder={tr('Reply STOP to unsubscribe')}
                    />
                    {errorAt(issues, 'footer.text') && (
                      <p className="text-[13px] text-danger-text">{errorAt(issues, 'footer.text')}</p>
                    )}
                  </BuilderSection>
                  <BuilderSection
                    title={tr('Buttons')}
                    description={tr('Optional. Up to 10; WhatsApp shows 3 and folds the rest into a list.')}
                  >
                    <ButtonsEditor draft={draft} setDraft={setDraft} issues={issues} wabaId={wabaId} />
                  </BuilderSection>
                </>
              )}
            </div>
          )}
        </div>
        <aside className="bg-raised/60 px-6 py-5">
          <div className="lg:sticky lg:top-5">
            <WhatsAppPreview
              businessName={source.data?.waba.name ?? tr('Your business')}
              messages={[preview]}
            />
            <div className="mx-auto mt-5 max-w-[340px]" aria-live="polite">
              {errors.length === 0 ? (
                <p className="text-center text-[13px] text-success-text">{tr('Ready to submit')}</p>
              ) : (
                <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
                  <p className="text-[13px] font-medium text-fg">
                    {errors.length} {errors.length === 1 ? tr('issue') : tr('issues')}{' '}
                    {tr('before submitting')}
                  </p>
                  <ul className="mt-1.5 grid gap-1">
                    {errors.slice(0, 6).map((e) => (
                      <li key={`${e.path}:${e.message}`} className="flex gap-1.5 text-xs text-muted">
                        <CircleAlert className="mt-px size-3.5 shrink-0 text-danger-text" aria-hidden />
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
