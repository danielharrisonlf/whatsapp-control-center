/**
 * Message template drafting rules shared by the builder (frontend) and the API (backend).
 *
 * Rules follow Meta's template component reference and review guidelines
 * (https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components).
 * Errors block creation; warnings describe things Meta commonly rejects but does not document
 * as hard limits.
 */
import type { TemplateCategory } from './meta';

export const TEMPLATE_LIMITS = {
  name: 512,
  headerText: 60,
  headerVariables: 1,
  body: 1024,
  footer: 60,
  buttons: 10,
  buttonText: 25,
  urlButtons: 2,
  url: 2000,
  phoneButtons: 1,
  phoneNumber: 20,
  copyCodeButtons: 1,
  copyCode: 20,
  codeExpirationMin: 1,
  codeExpirationMax: 90,
} as const;

export type HeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
export type ParameterFormat = 'POSITIONAL' | 'NAMED';
export type OtpType = 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';

export type TemplateButtonDraft =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string; example: string }
  | { type: 'PHONE_NUMBER'; text: string; phoneNumber: string }
  | { type: 'COPY_CODE'; example: string }
  | {
      type: 'FLOW';
      text: string;
      flowId: string;
      flowAction: 'navigate' | 'data_exchange';
      navigateScreen: string;
    };

export type TemplateButtonType = TemplateButtonDraft['type'];

export interface TemplateDraft {
  name: string;
  language: string;
  category: TemplateCategory;
  parameterFormat: ParameterFormat;
  allowCategoryChange: boolean;
  header: {
    format: HeaderFormat;
    text: string;
    /** Example value per variable key (`1` or `first_name`). */
    examples: Record<string, string>;
    /** Handle returned by the Resumable Upload API (`4::...`). */
    mediaHandle: string;
    /** Local object URL used only by the preview. */
    mediaPreviewUrl?: string;
    mediaFileName?: string;
  };
  body: { text: string; examples: Record<string, string> };
  footer: { text: string };
  buttons: TemplateButtonDraft[];
  authentication: {
    addSecurityRecommendation: boolean;
    codeExpirationMinutes: number | null;
    otpType: OtpType;
    buttonText: string;
    autofillText: string;
    packageName: string;
    signatureHash: string;
    zeroTapTermsAccepted: boolean;
  };
}

export function emptyTemplateDraft(): TemplateDraft {
  return {
    name: '',
    language: 'en_US',
    category: 'UTILITY',
    parameterFormat: 'POSITIONAL',
    allowCategoryChange: false,
    header: { format: 'NONE', text: '', examples: {}, mediaHandle: '' },
    body: { text: '', examples: {} },
    footer: { text: '' },
    buttons: [],
    authentication: {
      addSecurityRecommendation: true,
      codeExpirationMinutes: 10,
      otpType: 'COPY_CODE',
      buttonText: 'Copy code',
      autofillText: 'Autofill',
      packageName: '',
      signatureHash: '',
      zeroTapTermsAccepted: false,
    },
  };
}

// ─── Variables ───────────────────────────────────────────────────────────────

const VARIABLE_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;
const POSITIONAL_KEY_RE = /^[1-9]\d*$/;
const NAMED_KEY_RE = /^[a-z][a-z0-9_]*$/;

export interface VariableToken {
  key: string;
  raw: string;
  start: number;
  end: number;
}

export function extractVariables(text: string): VariableToken[] {
  const tokens: VariableToken[] = [];
  for (const match of text.matchAll(VARIABLE_RE)) {
    const start = match.index ?? 0;
    tokens.push({ key: match[1] ?? '', raw: match[0], start, end: start + match[0].length });
  }
  return tokens;
}

/** Unique variable keys in order of first appearance. */
export function variableKeys(text: string): string[] {
  return [...new Set(extractVariables(text).map((t) => t.key))];
}

export function substituteVariables(text: string, values: Record<string, string | undefined>): string {
  return text.replace(VARIABLE_RE, (raw, key: string) => {
    const value = values[key.trim()];
    return value && value.length > 0 ? value : raw;
  });
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface TemplateIssue {
  /** Dotted path to the field, e.g. `body.text`, `buttons.1.url`. */
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

function validateVariableText(
  text: string,
  path: string,
  format: ParameterFormat,
  examples: Record<string, string>,
  issues: TemplateIssue[],
  /** Meta's leading/trailing variable rule applies to the body only. */
  checkEdges = true,
) {
  const opens = (text.match(/\{\{/g) ?? []).length;
  const closes = (text.match(/\}\}/g) ?? []).length;
  if (opens !== closes) {
    issues.push({
      path,
      severity: 'error',
      message: 'Variables have mismatched braces. Use {{1}} or {{name}}.',
    });
  }

  const tokens = extractVariables(text);
  if (tokens.length === 0) return;

  for (const token of tokens) {
    if (format === 'POSITIONAL' && !POSITIONAL_KEY_RE.test(token.key)) {
      issues.push({
        path,
        severity: 'error',
        message: `${token.raw} is not a positional variable. Use {{1}}, {{2}}… or switch to named parameters.`,
      });
    }
    if (format === 'NAMED' && !NAMED_KEY_RE.test(token.key)) {
      issues.push({
        path,
        severity: 'error',
        message: `${token.raw} is not a valid name. Use lowercase letters, numbers and underscores, starting with a letter.`,
      });
    }
  }

  if (format === 'POSITIONAL') {
    const numbers = [...new Set(tokens.map((t) => Number(t.key)).filter((n) => Number.isInteger(n)))].sort(
      (a, b) => a - b,
    );
    numbers.forEach((n, i) => {
      if (n !== i + 1) {
        issues.push({
          path,
          severity: 'error',
          message: `Variables must be sequential starting at {{1}}. Expected {{${i + 1}}}, found {{${n}}}.`,
        });
      }
    });
  }

  const trimmed = text.trim();
  if (checkEdges && trimmed.startsWith('{{')) {
    issues.push({
      path,
      severity: 'error',
      message: 'Text cannot start with a variable. Add text before it.',
    });
  }
  if (checkEdges && trimmed.endsWith('}}')) {
    issues.push({ path, severity: 'error', message: 'Text cannot end with a variable. Add text after it.' });
  }

  for (let i = 1; i < tokens.length; i++) {
    const between = text.slice(tokens[i - 1]!.end, tokens[i]!.start);
    if (between.trim().length === 0) {
      issues.push({
        path,
        severity: 'warning',
        message: `${tokens[i - 1]!.raw} and ${tokens[i]!.raw} are adjacent. Meta usually rejects variables without text between them.`,
      });
    }
  }

  const staticText = text.replace(VARIABLE_RE, '').replace(/\s+/g, ' ').trim();
  const words = staticText.length === 0 ? 0 : staticText.split(' ').length;
  if (tokens.length > 0 && words < tokens.length * 2) {
    issues.push({
      path,
      severity: 'warning',
      message:
        'Too many variables for the amount of text. Meta may reject templates that are mostly variables.',
    });
  }

  for (const key of new Set(tokens.map((t) => t.key))) {
    const example = examples[key];
    if (!example || example.trim().length === 0) {
      issues.push({
        path: `${path.replace(/\.text$/, '')}.examples.${key}`,
        severity: 'error',
        message: `Add a sample value for {{${key}}}. Meta requires examples for every variable.`,
      });
    }
  }
}

function hasVariables(text: string) {
  return extractVariables(text).length > 0;
}

export function validateTemplateDraft(draft: TemplateDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message, severity: 'error' });

  if (!draft.name) err('name', 'Name is required.');
  else if (!/^[a-z0-9_]+$/.test(draft.name))
    err('name', 'Use only lowercase letters, numbers and underscores.');
  else if (draft.name.length > TEMPLATE_LIMITS.name)
    err('name', `Maximum ${TEMPLATE_LIMITS.name} characters.`);

  if (!draft.language) err('language', 'Language is required.');

  if (draft.category === 'AUTHENTICATION') {
    const auth = draft.authentication;
    if (
      auth.codeExpirationMinutes !== null &&
      (auth.codeExpirationMinutes < TEMPLATE_LIMITS.codeExpirationMin ||
        auth.codeExpirationMinutes > TEMPLATE_LIMITS.codeExpirationMax)
    ) {
      err('authentication.codeExpirationMinutes', 'Code expiration must be between 1 and 90 minutes.');
    }
    if (auth.otpType === 'COPY_CODE' && !auth.buttonText.trim()) {
      err('authentication.buttonText', 'Button text is required.');
    }
    if (auth.buttonText.length > TEMPLATE_LIMITS.buttonText) {
      err('authentication.buttonText', `Maximum ${TEMPLATE_LIMITS.buttonText} characters.`);
    }
    if (auth.otpType !== 'COPY_CODE') {
      if (!auth.packageName.trim()) err('authentication.packageName', 'Android package name is required.');
      if (!/^[A-Za-z0-9+/=_-]{11}$/.test(auth.signatureHash.trim())) {
        err('authentication.signatureHash', 'The app signature hash has exactly 11 characters.');
      }
    }
    if (auth.otpType === 'ZERO_TAP' && !auth.zeroTapTermsAccepted) {
      err('authentication.zeroTapTermsAccepted', 'Accept the zero-tap terms to use this OTP type.');
    }
    return issues;
  }

  // Header
  const header = draft.header;
  if (header.format === 'TEXT') {
    if (!header.text.trim()) err('header.text', 'Header text is required, or choose no header.');
    if (header.text.length > TEMPLATE_LIMITS.headerText) {
      err('header.text', `Header text is limited to ${TEMPLATE_LIMITS.headerText} characters.`);
    }
    if (variableKeys(header.text).length > TEMPLATE_LIMITS.headerVariables) {
      err('header.text', 'The header supports only one variable.');
    }
    validateVariableText(header.text, 'header.text', draft.parameterFormat, header.examples, issues, false);
  }
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format) && !header.mediaHandle) {
    err('header.mediaHandle', 'Upload a sample file. Meta reviews media headers with an example.');
  }

  // Body
  if (!draft.body.text.trim()) err('body.text', 'Body is required.');
  if (draft.body.text.length > TEMPLATE_LIMITS.body) {
    err('body.text', `Body is limited to ${TEMPLATE_LIMITS.body} characters.`);
  }
  validateVariableText(draft.body.text, 'body.text', draft.parameterFormat, draft.body.examples, issues);

  // Footer
  if (draft.footer.text.length > TEMPLATE_LIMITS.footer) {
    err('footer.text', `Footer is limited to ${TEMPLATE_LIMITS.footer} characters.`);
  }
  if (hasVariables(draft.footer.text)) err('footer.text', 'The footer cannot contain variables.');

  // Buttons
  const buttons = draft.buttons;
  if (buttons.length > TEMPLATE_LIMITS.buttons) err('buttons', `Up to ${TEMPLATE_LIMITS.buttons} buttons.`);
  const count = (type: TemplateButtonType) => buttons.filter((b) => b.type === type).length;
  if (count('URL') > TEMPLATE_LIMITS.urlButtons) err('buttons', 'Up to 2 website buttons.');
  if (count('PHONE_NUMBER') > TEMPLATE_LIMITS.phoneButtons) err('buttons', 'Only 1 phone number button.');
  if (count('COPY_CODE') > TEMPLATE_LIMITS.copyCodeButtons) err('buttons', 'Only 1 copy code button.');
  if (count('FLOW') > 1) err('buttons', 'Only 1 flow button.');
  if (count('COPY_CODE') > 0 && draft.category !== 'MARKETING') {
    err('buttons', 'Copy code buttons are only available for marketing templates.');
  }

  const quickReplyIndexes = buttons.flatMap((b, i) => (b.type === 'QUICK_REPLY' ? [i] : []));
  if (quickReplyIndexes.length > 0) {
    const first = quickReplyIndexes[0]!;
    const last = quickReplyIndexes[quickReplyIndexes.length - 1]!;
    if (last - first + 1 !== quickReplyIndexes.length) {
      err('buttons', 'Keep quick reply buttons together. They cannot be mixed between other button types.');
    }
  }

  buttons.forEach((button, i) => {
    const path = `buttons.${i}`;
    if (button.type !== 'COPY_CODE') {
      if (!button.text.trim()) err(`${path}.text`, 'Button text is required.');
      if (button.text.length > TEMPLATE_LIMITS.buttonText) {
        err(`${path}.text`, `Button text is limited to ${TEMPLATE_LIMITS.buttonText} characters.`);
      }
      if (hasVariables(button.text)) err(`${path}.text`, 'Button text cannot contain variables.');
    }
    switch (button.type) {
      case 'URL': {
        if (!/^https?:\/\/\S+$/.test(button.url)) err(`${path}.url`, 'Enter a valid http(s) URL.');
        if (button.url.length > TEMPLATE_LIMITS.url) err(`${path}.url`, 'URL is limited to 2000 characters.');
        const vars = extractVariables(button.url);
        if (vars.length > 1) err(`${path}.url`, 'A URL supports only one variable.');
        if (vars.length === 1) {
          if (!button.url.trim().endsWith('}}')) err(`${path}.url`, 'The URL variable must be at the end.');
          if (vars[0]!.key !== '1') err(`${path}.url`, 'The URL variable must be {{1}}.');
          if (!button.example.trim()) {
            err(`${path}.example`, 'Add a sample value for the URL variable.');
          }
        }
        break;
      }
      case 'PHONE_NUMBER':
        if (!/^\+?[0-9]{6,19}$/.test(button.phoneNumber.replace(/[\s()-]/g, ''))) {
          err(`${path}.phoneNumber`, 'Enter a phone number with country code, up to 20 characters.');
        }
        break;
      case 'COPY_CODE':
        if (!button.example.trim()) err(`${path}.example`, 'Add a sample offer code.');
        if (button.example.length > TEMPLATE_LIMITS.copyCode) {
          err(`${path}.example`, `Offer code is limited to ${TEMPLATE_LIMITS.copyCode} characters.`);
        }
        break;
      case 'FLOW':
        if (!button.flowId.trim()) err(`${path}.flowId`, 'Choose a published flow.');
        if (button.flowAction === 'navigate' && !button.navigateScreen.trim()) {
          err(`${path}.navigateScreen`, 'Enter the first screen ID of the flow.');
        }
        break;
      default:
        break;
    }
  });

  return issues;
}

export function hasBlockingIssues(issues: TemplateIssue[]) {
  return issues.some((i) => i.severity === 'error');
}

// ─── Meta payload ────────────────────────────────────────────────────────────

export type MetaTemplateComponent = Record<string, unknown> & { type: string };

export interface MetaTemplateCreatePayload {
  name: string;
  language: string;
  category: TemplateCategory;
  parameter_format?: 'POSITIONAL' | 'NAMED';
  allow_category_change?: boolean;
  components: MetaTemplateComponent[];
}

function textExample(
  text: string,
  examples: Record<string, string>,
  format: ParameterFormat,
  kind: 'header' | 'body',
): Record<string, unknown> | undefined {
  const keys = variableKeys(text);
  if (keys.length === 0) return undefined;
  if (format === 'NAMED') {
    return {
      [`${kind}_text_named_params`]: keys.map((k) => ({ param_name: k, example: examples[k] ?? '' })),
    };
  }
  const ordered = [...keys].sort((a, b) => Number(a) - Number(b)).map((k) => examples[k] ?? '');
  return kind === 'header' ? { header_text: ordered } : { body_text: [ordered] };
}

export function buildTemplateComponents(draft: TemplateDraft): MetaTemplateComponent[] {
  if (draft.category === 'AUTHENTICATION') {
    const auth = draft.authentication;
    const components: MetaTemplateComponent[] = [
      { type: 'BODY', add_security_recommendation: auth.addSecurityRecommendation },
    ];
    if (auth.codeExpirationMinutes !== null) {
      components.push({ type: 'FOOTER', code_expiration_minutes: auth.codeExpirationMinutes });
    }
    const otp: Record<string, unknown> = { type: 'OTP', otp_type: auth.otpType };
    if (auth.buttonText.trim()) otp.text = auth.buttonText.trim();
    if (auth.otpType !== 'COPY_CODE') {
      if (auth.autofillText.trim()) otp.autofill_text = auth.autofillText.trim();
      otp.supported_apps = [
        { package_name: auth.packageName.trim(), signature_hash: auth.signatureHash.trim() },
      ];
    }
    if (auth.otpType === 'ZERO_TAP') otp.zero_tap_terms_accepted = auth.zeroTapTermsAccepted;
    components.push({ type: 'BUTTONS', buttons: [otp] });
    return components;
  }

  const components: MetaTemplateComponent[] = [];
  const { header } = draft;
  if (header.format === 'TEXT') {
    const example = textExample(header.text, header.examples, draft.parameterFormat, 'header');
    components.push({ type: 'HEADER', format: 'TEXT', text: header.text, ...(example ? { example } : {}) });
  } else if (header.format === 'LOCATION') {
    components.push({ type: 'HEADER', format: 'LOCATION' });
  } else if (header.format !== 'NONE') {
    components.push({
      type: 'HEADER',
      format: header.format,
      example: { header_handle: [header.mediaHandle] },
    });
  }

  const bodyExample = textExample(draft.body.text, draft.body.examples, draft.parameterFormat, 'body');
  components.push({ type: 'BODY', text: draft.body.text, ...(bodyExample ? { example: bodyExample } : {}) });

  if (draft.footer.text.trim()) components.push({ type: 'FOOTER', text: draft.footer.text });

  if (draft.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: draft.buttons.map((b) => {
        switch (b.type) {
          case 'QUICK_REPLY':
            return { type: 'QUICK_REPLY', text: b.text };
          case 'URL': {
            const hasVar = extractVariables(b.url).length > 0;
            return {
              type: 'URL',
              text: b.text,
              url: b.url,
              ...(hasVar ? { example: [substituteVariables(b.url, { '1': b.example })] } : {}),
            };
          }
          case 'PHONE_NUMBER':
            return {
              type: 'PHONE_NUMBER',
              text: b.text,
              phone_number: b.phoneNumber.replace(/[\s()-]/g, ''),
            };
          case 'COPY_CODE':
            return { type: 'COPY_CODE', example: b.example };
          case 'FLOW':
            return {
              type: 'FLOW',
              text: b.text,
              flow_id: b.flowId,
              flow_action: b.flowAction,
              ...(b.flowAction === 'navigate' ? { navigate_screen: b.navigateScreen } : {}),
            };
          default:
            return b;
        }
      }),
    });
  }
  return components;
}

export function buildTemplateCreatePayload(draft: TemplateDraft): MetaTemplateCreatePayload {
  const payload: MetaTemplateCreatePayload = {
    name: draft.name,
    language: draft.language,
    category: draft.category,
    components: buildTemplateComponents(draft),
  };
  if (draft.category !== 'AUTHENTICATION') payload.parameter_format = draft.parameterFormat;
  if (draft.allowCategoryChange) payload.allow_category_change = true;
  return payload;
}

// ─── Meta → draft (edit / duplicate) ─────────────────────────────────────────

type AnyRecord = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function draftFromMetaTemplate(template: {
  name: string;
  language: string;
  category: string;
  parameterFormat?: string | null;
  components: unknown;
}): TemplateDraft {
  const draft = emptyTemplateDraft();
  draft.name = template.name;
  draft.language = template.language;
  draft.category = (
    ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(template.category) ? template.category : 'UTILITY'
  ) as TemplateCategory;
  draft.parameterFormat = template.parameterFormat?.toUpperCase() === 'NAMED' ? 'NAMED' : 'POSITIONAL';

  const components = Array.isArray(template.components) ? (template.components as AnyRecord[]) : [];
  for (const c of components) {
    const type = str(c.type).toUpperCase();
    const example = (c.example ?? {}) as AnyRecord;
    if (type === 'HEADER') {
      const format = str(c.format).toUpperCase() as HeaderFormat;
      draft.header.format = ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].includes(format)
        ? format
        : 'NONE';
      draft.header.text = str(c.text);
      draft.header.examples = examplesFrom(draft.header.text, example, 'header', draft.parameterFormat);
      const handles = example.header_handle;
      if (Array.isArray(handles) && typeof handles[0] === 'string') draft.header.mediaHandle = handles[0];
    } else if (type === 'BODY') {
      draft.body.text = str(c.text);
      draft.body.examples = examplesFrom(draft.body.text, example, 'body', draft.parameterFormat);
      if (typeof c.add_security_recommendation === 'boolean') {
        draft.authentication.addSecurityRecommendation = c.add_security_recommendation;
      }
    } else if (type === 'FOOTER') {
      draft.footer.text = str(c.text);
      if (typeof c.code_expiration_minutes === 'number') {
        draft.authentication.codeExpirationMinutes = c.code_expiration_minutes;
      }
    } else if (type === 'BUTTONS' && Array.isArray(c.buttons)) {
      for (const b of c.buttons as AnyRecord[]) {
        const bt = str(b.type).toUpperCase();
        if (bt === 'QUICK_REPLY') draft.buttons.push({ type: 'QUICK_REPLY', text: str(b.text) });
        else if (bt === 'URL') {
          const exampleUrl = Array.isArray(b.example) ? str(b.example[0]) : '';
          const url = str(b.url);
          const prefix = url.split('{{')[0] ?? '';
          draft.buttons.push({
            type: 'URL',
            text: str(b.text),
            url,
            example: exampleUrl.startsWith(prefix) ? exampleUrl.slice(prefix.length) : '',
          });
        } else if (bt === 'PHONE_NUMBER') {
          draft.buttons.push({ type: 'PHONE_NUMBER', text: str(b.text), phoneNumber: str(b.phone_number) });
        } else if (bt === 'COPY_CODE') {
          draft.buttons.push({
            type: 'COPY_CODE',
            example: Array.isArray(b.example) ? str(b.example[0]) : str(b.example),
          });
        } else if (bt === 'FLOW') {
          draft.buttons.push({
            type: 'FLOW',
            text: str(b.text),
            flowId: str(b.flow_id),
            flowAction: str(b.flow_action) === 'data_exchange' ? 'data_exchange' : 'navigate',
            navigateScreen: str(b.navigate_screen),
          });
        } else if (bt === 'OTP') {
          const otpType = str(b.otp_type).toUpperCase();
          draft.authentication.otpType = (
            ['COPY_CODE', 'ONE_TAP', 'ZERO_TAP'].includes(otpType) ? otpType : 'COPY_CODE'
          ) as OtpType;
          draft.authentication.buttonText = str(b.text) || draft.authentication.buttonText;
          const apps = Array.isArray(b.supported_apps) ? (b.supported_apps as AnyRecord[]) : [];
          draft.authentication.packageName = str(apps[0]?.package_name ?? b.package_name);
          draft.authentication.signatureHash = str(apps[0]?.signature_hash ?? b.signature_hash);
        }
      }
    }
  }
  return draft;
}

function examplesFrom(
  text: string,
  example: AnyRecord,
  kind: 'header' | 'body',
  format: ParameterFormat,
): Record<string, string> {
  const result: Record<string, string> = {};
  const named = example[`${kind}_text_named_params`];
  if (format === 'NAMED' && Array.isArray(named)) {
    for (const p of named as AnyRecord[]) result[str(p.param_name)] = str(p.example);
    return result;
  }
  const raw = example[`${kind}_text`];
  const values: unknown[] =
    kind === 'body' && Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : ((raw as []) ?? []);
  const keys = variableKeys(text)
    .filter((k) => POSITIONAL_KEY_RE.test(k))
    .sort((a, b) => Number(a) - Number(b));
  keys.forEach((k, i) => {
    result[k] = str(values[i]);
  });
  return result;
}

// ─── Send-time parameters ────────────────────────────────────────────────────

/** A value the sender must provide when sending an approved template. */
export interface TemplateSendSlot {
  id: string;
  component: 'header' | 'body' | 'button';
  kind: 'text' | 'image' | 'video' | 'document' | 'location' | 'coupon_code' | 'otp' | 'flow_token';
  label: string;
  /** Variable key for text parameters (`1`, `first_name`). */
  key?: string;
  buttonIndex?: number;
  example?: string;
}

export function getTemplateSendSlots(template: {
  category: string;
  parameterFormat?: string | null;
  components: unknown;
}): TemplateSendSlot[] {
  const slots: TemplateSendSlot[] = [];
  const components = Array.isArray(template.components) ? (template.components as AnyRecord[]) : [];
  const isAuth = template.category.toUpperCase() === 'AUTHENTICATION';

  for (const c of components) {
    const type = str(c.type).toUpperCase();
    if (type === 'HEADER') {
      const format = str(c.format).toUpperCase();
      if (format === 'TEXT') {
        for (const key of variableKeys(str(c.text))) {
          slots.push({
            id: `header.${key}`,
            component: 'header',
            kind: 'text',
            key,
            label: `Header {{${key}}}`,
          });
        }
      } else if (format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT') {
        slots.push({
          id: 'header.media',
          component: 'header',
          kind: format.toLowerCase() as 'image',
          label: `Header ${format.toLowerCase()} (media ID or https link)`,
        });
      } else if (format === 'LOCATION') {
        slots.push({
          id: 'header.location',
          component: 'header',
          kind: 'location',
          label: 'Header location',
        });
      }
    } else if (type === 'BODY') {
      if (isAuth) {
        slots.push({ id: 'otp', component: 'body', kind: 'otp', label: 'One-time code' });
        continue;
      }
      for (const key of variableKeys(str(c.text))) {
        slots.push({ id: `body.${key}`, component: 'body', kind: 'text', key, label: `Body {{${key}}}` });
      }
    } else if (type === 'BUTTONS' && Array.isArray(c.buttons)) {
      (c.buttons as AnyRecord[]).forEach((b, index) => {
        const bt = str(b.type).toUpperCase();
        if (bt === 'URL' && extractVariables(str(b.url)).length > 0) {
          slots.push({
            id: `button.${index}`,
            component: 'button',
            kind: 'text',
            buttonIndex: index,
            label: `Button "${str(b.text)}" URL suffix`,
          });
        } else if (bt === 'COPY_CODE') {
          slots.push({
            id: `button.${index}`,
            component: 'button',
            kind: 'coupon_code',
            buttonIndex: index,
            label: 'Offer code',
          });
        } else if (bt === 'FLOW') {
          slots.push({
            id: `button.${index}`,
            component: 'button',
            kind: 'flow_token',
            buttonIndex: index,
            label: `Flow token for "${str(b.text)}" (optional)`,
          });
        }
      });
    }
  }
  return slots;
}

/** Builds `template.components` for POST /{phone-number-id}/messages from slot values. */
export function buildTemplateSendComponents(
  template: { category: string; parameterFormat?: string | null; components: unknown },
  values: Record<string, string>,
): AnyRecord[] {
  const slots = getTemplateSendSlots(template);
  const named = template.parameterFormat?.toUpperCase() === 'NAMED';
  const header: AnyRecord[] = [];
  const body: AnyRecord[] = [];
  const buttons: AnyRecord[] = [];

  const textParam = (slot: TemplateSendSlot) => ({
    type: 'text',
    ...(named && slot.key ? { parameter_name: slot.key } : {}),
    text: values[slot.id] ?? '',
  });

  for (const slot of slots) {
    const value = values[slot.id] ?? '';
    if (slot.component === 'header') {
      if (slot.kind === 'text') header.push(textParam(slot));
      else if (slot.kind === 'location') {
        const [latitude, longitude, name, address] = value.split('|');
        header.push({
          type: 'location',
          location: { latitude: Number(latitude), longitude: Number(longitude), name, address },
        });
      } else {
        const ref = /^https?:\/\//.test(value) ? { link: value } : { id: value };
        header.push({ type: slot.kind, [slot.kind]: ref });
      }
    } else if (slot.component === 'body') {
      if (slot.kind === 'otp') {
        body.push({ type: 'text', text: value });
        buttons.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: value }],
        });
      } else body.push(textParam(slot));
    } else if (slot.kind === 'coupon_code') {
      buttons.push({
        type: 'button',
        sub_type: 'copy_code',
        index: String(slot.buttonIndex),
        parameters: [{ type: 'coupon_code', coupon_code: value }],
      });
    } else if (slot.kind === 'flow_token') {
      if (value) {
        buttons.push({
          type: 'button',
          sub_type: 'flow',
          index: String(slot.buttonIndex),
          parameters: [{ type: 'action', action: { flow_token: value } }],
        });
      }
    } else {
      buttons.push({
        type: 'button',
        sub_type: 'url',
        index: String(slot.buttonIndex),
        parameters: [{ type: 'text', text: value }],
      });
    }
  }

  const components: AnyRecord[] = [];
  if (header.length) components.push({ type: 'header', parameters: header });
  if (body.length) components.push({ type: 'body', parameters: body });
  components.push(...buttons);
  return components;
}

/** Text Meta renders for authentication templates (the body is preset by Meta). */
export function authenticationPreviewText(addSecurityRecommendation: boolean) {
  return addSecurityRecommendation
    ? '*{{1}}* is your verification code. For your security, do not share this code.'
    : '*{{1}}* is your verification code.';
}
