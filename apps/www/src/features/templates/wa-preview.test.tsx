import { render, screen } from '@testing-library/react';
import { emptyTemplateDraft } from '@wacc/types';
import { describe, expect, it } from 'vitest';
import { previewFromDraft } from './template-preview-model';
import { WhatsAppPreview, WhatsAppText } from './wa-preview';

describe('WhatsAppText', () => {
  it('renders WhatsApp formatting as markup, never as HTML', () => {
    const { container } = render(
      <WhatsAppText text={'*bold* _italic_ ~gone~ ```code``` <img src=x onerror=alert(1)>'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('s')?.textContent).toBe('gone');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('previewFromDraft', () => {
  it('substitutes sample values and keeps unknown variables visible', () => {
    const draft = emptyTemplateDraft();
    draft.body = { text: 'Olá {{1}}, seu pedido {{2}} está pronto!', examples: { '1': 'Daniel' } };
    draft.buttons = [
      { type: 'QUICK_REPLY', text: 'Ok' },
      { type: 'COPY_CODE', example: 'X' },
    ];
    const preview = previewFromDraft(draft);
    expect(preview.body).toBe('Olá Daniel, seu pedido {{2}} está pronto!');
    expect(preview.buttons).toEqual([
      { kind: 'reply', text: 'Ok' },
      { kind: 'copy', text: 'Copy offer code' },
    ]);
  });

  it('uses the Meta-defined body for authentication templates', () => {
    const draft = emptyTemplateDraft();
    draft.category = 'AUTHENTICATION';
    const preview = previewFromDraft(draft);
    expect(preview.body).toContain('123456');
    expect(preview.footer).toBe('This code expires in 10 minutes.');
  });
});

describe('WhatsAppPreview', () => {
  it('folds more than three buttons into "See all options"', () => {
    render(
      <WhatsAppPreview
        businessName="Zed Store"
        messages={[
          {
            body: 'Pick one',
            buttons: ['A', 'B', 'C', 'D'].map((t) => ({ kind: 'reply' as const, text: t })),
          },
        ]}
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText('C')).toBeNull();
    expect(screen.getByText('See all options')).toBeInTheDocument();
  });
});
