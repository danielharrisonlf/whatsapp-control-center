import { describe, expect, it } from 'vitest';
import {
  buildTemplateCreatePayload,
  buildTemplateSendComponents,
  draftFromMetaTemplate,
  emptyTemplateDraft,
  getTemplateSendSlots,
  substituteVariables,
  validateTemplateDraft,
} from './template';

function draft(overrides: Partial<ReturnType<typeof emptyTemplateDraft>> = {}) {
  return { ...emptyTemplateDraft(), name: 'order_ready', ...overrides };
}

const errors = (d: ReturnType<typeof draft>) =>
  validateTemplateDraft(d)
    .filter((i) => i.severity === 'error')
    .map((i) => i.message);

describe('validateTemplateDraft', () => {
  it('accepts a well-formed utility template', () => {
    const d = draft({
      body: {
        text: 'Hello {{1}}, your order {{2}} is ready for pickup.',
        examples: { '1': 'Ana', '2': '#284' },
      },
    });
    expect(errors(d)).toEqual([]);
  });

  it('rejects variables at the start or end of the body', () => {
    const d = draft({ body: { text: '{{1}} your order is ready {{2}}', examples: { '1': 'a', '2': 'b' } } });
    const messages = errors(d);
    expect(messages).toContain('Text cannot start with a variable. Add text before it.');
    expect(messages).toContain('Text cannot end with a variable. Add text after it.');
  });

  it('requires sequential positional variables', () => {
    const d = draft({
      body: { text: 'Hi {{1}}, code {{3}} expires soon.', examples: { '1': 'a', '3': 'b' } },
    });
    expect(errors(d).some((m) => m.includes('sequential'))).toBe(true);
  });

  it('requires examples for every variable', () => {
    const d = draft({ body: { text: 'Hi {{1}}, welcome back to the store.', examples: {} } });
    expect(errors(d).some((m) => m.includes('sample value for {{1}}'))).toBe(true);
  });

  it('enforces button limits and copy code category', () => {
    const d = draft({
      body: { text: 'Plain body text here.', examples: {} },
      buttons: [
        { type: 'PHONE_NUMBER', text: 'Call', phoneNumber: '+5511999999999' },
        { type: 'PHONE_NUMBER', text: 'Call 2', phoneNumber: '+5511999999998' },
        { type: 'COPY_CODE', example: 'SAVE10' },
      ],
    });
    const messages = errors(d);
    expect(messages).toContain('Only 1 phone number button.');
    expect(messages).toContain('Copy code buttons are only available for marketing templates.');
  });

  it('rejects interleaved quick replies', () => {
    const d = draft({
      body: { text: 'Plain body text here.', examples: {} },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Yes' },
        { type: 'URL', text: 'Site', url: 'https://example.com', example: '' },
        { type: 'QUICK_REPLY', text: 'No' },
      ],
    });
    expect(errors(d).some((m) => m.includes('quick reply'))).toBe(true);
  });
});

describe('buildTemplateCreatePayload', () => {
  it('builds positional examples', () => {
    const d = draft({
      header: { format: 'TEXT', text: 'Order {{1}} update', examples: { '1': '#284' }, mediaHandle: '' },
      body: { text: 'Hello {{1}}, order {{2}} shipped today.', examples: { '1': 'Ana', '2': '#284' } },
      footer: { text: 'Reply STOP to opt out' },
      buttons: [{ type: 'URL', text: 'Track', url: 'https://shop.test/track/{{1}}', example: 'abc' }],
    });
    const payload = buildTemplateCreatePayload(d);
    expect(payload.components).toEqual([
      { type: 'HEADER', format: 'TEXT', text: 'Order {{1}} update', example: { header_text: ['#284'] } },
      {
        type: 'BODY',
        text: 'Hello {{1}}, order {{2}} shipped today.',
        example: { body_text: [['Ana', '#284']] },
      },
      { type: 'FOOTER', text: 'Reply STOP to opt out' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Track',
            url: 'https://shop.test/track/{{1}}',
            example: ['https://shop.test/track/abc'],
          },
        ],
      },
    ]);
  });

  it('builds named examples', () => {
    const d = draft({
      parameterFormat: 'NAMED',
      body: { text: 'Hi {{first_name}}, thanks for joining us.', examples: { first_name: 'Ana' } },
    });
    const body = buildTemplateCreatePayload(d).components[0];
    expect(body).toEqual({
      type: 'BODY',
      text: 'Hi {{first_name}}, thanks for joining us.',
      example: { body_text_named_params: [{ param_name: 'first_name', example: 'Ana' }] },
    });
  });

  it('round-trips through draftFromMetaTemplate', () => {
    const d = draft({
      body: { text: 'Hello {{1}}, order {{2}} shipped today.', examples: { '1': 'Ana', '2': '#284' } },
      buttons: [{ type: 'QUICK_REPLY', text: 'Thanks' }],
    });
    const payload = buildTemplateCreatePayload(d);
    const back = draftFromMetaTemplate({ ...payload, parameterFormat: payload.parameter_format });
    expect(back.body).toEqual(d.body);
    expect(back.buttons).toEqual(d.buttons);
  });
});

describe('send components', () => {
  it('maps slots to message parameters', () => {
    const template = {
      category: 'UTILITY',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hi {{1}}, order {{2}}.' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Track', url: 'https://x.test/{{1}}' }] },
      ],
    };
    expect(getTemplateSendSlots(template).map((s) => s.id)).toEqual([
      'header.media',
      'body.1',
      'body.2',
      'button.0',
    ]);
    const components = buildTemplateSendComponents(template, {
      'header.media': 'https://cdn.test/a.png',
      'body.1': 'Ana',
      'body.2': '#1',
      'button.0': 'abc',
    });
    expect(components).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.test/a.png' } }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ana' },
          { type: 'text', text: '#1' },
        ],
      },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'abc' }] },
    ]);
  });
});

it('substitutes variables and keeps unknown ones', () => {
  expect(substituteVariables('Hi {{1}} and {{2}}', { '1': 'Ana' })).toBe('Hi Ana and {{2}}');
});
