import {
  authenticationPreviewText,
  draftFromMetaTemplate,
  substituteVariables,
  type TemplateDraft,
} from '@wacc/types';
import { t as tr } from '@/lib/i18n';
import type { PreviewButton, PreviewMessage } from './wa-preview';

/** Builds the WhatsApp preview for a draft, with example values substituted. */
export function previewFromDraft(draft: TemplateDraft): PreviewMessage {
  if (draft.category === 'AUTHENTICATION') {
    const auth = draft.authentication;
    return {
      body: substituteVariables(authenticationPreviewText(auth.addSecurityRecommendation), { '1': '123456' }),
      footer: auth.codeExpirationMinutes
        ? tr('This code expires in {0} minutes.', auth.codeExpirationMinutes)
        : undefined,
      buttons: [
        {
          kind: 'copy',
          text:
            auth.otpType === 'COPY_CODE'
              ? auth.buttonText || tr('Copy code')
              : auth.autofillText || tr('Autofill'),
        },
      ],
    };
  }
  const header = draft.header;
  return {
    header:
      header.format === 'NONE'
        ? undefined
        : header.format === 'TEXT'
          ? { kind: 'text', text: substituteVariables(header.text, header.examples) }
          : header.format === 'LOCATION'
            ? { kind: 'location' }
            : {
                kind: header.format.toLowerCase() as 'image' | 'video' | 'document',
                url: header.mediaPreviewUrl,
                fileName: header.mediaFileName,
              },
    body: substituteVariables(draft.body.text, draft.body.examples),
    footer: draft.footer.text || undefined,
    buttons: draft.buttons.map((b): PreviewButton => {
      switch (b.type) {
        case 'QUICK_REPLY':
          return { kind: 'reply', text: b.text };
        case 'URL':
          return { kind: 'url', text: b.text };
        case 'PHONE_NUMBER':
          return { kind: 'phone', text: b.text };
        case 'COPY_CODE':
          return { kind: 'copy', text: tr('Copy offer code') };
        case 'FLOW':
          return { kind: 'flow', text: b.text };
        default:
          return { kind: 'reply', text: '' };
      }
    }),
  };
}

/** Preview of a template as stored by Meta (detail page, list hover, playground). */
export function previewFromTemplate(t: {
  name: string;
  language: string;
  category: string;
  parameterFormat?: string | null;
  components: unknown;
}) {
  return previewFromDraft(draftFromMetaTemplate(t));
}
