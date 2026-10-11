import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  BUSINESS_VERTICALS,
  MESSAGING_LIMIT_TIERS,
  META_PERMISSIONS,
  TEMPLATE_LANGUAGES,
  TEMPLATE_REJECTION_REASONS,
} from '@wacc/types';
import { Field, Input } from '@wacc/ui';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from '@/components/page';
import { TemplateStatusBadge } from '@/components/status';
import { formatDateTime, formatNumber, formatPercent, formatRelative, humanize, pluralize } from './format';
import { getLocale, setLocale, t, useLocale } from './i18n';
import { ptBR } from './locales';

function LocaleForm() {
  useLocale();
  const [name, setName] = useState('Support');
  return (
    <Field label={t('Name')} htmlFor="customer-name" error="Enter your name.">
      <Input id="customer-name" value={name} onChange={(event) => setName(event.target.value)} />
    </Field>
  );
}

describe('language selection', () => {
  it('persists the selection and updates document language and title', () => {
    setLocale('pt-BR');
    expect(getLocale()).toBe('pt-BR');
    expect(localStorage.getItem('wacc.locale')).toBe('pt-BR');
    expect(document.documentElement.lang).toBe('pt-BR');
    expect(document.title).toBe('Central de controle do WhatsApp');
    setLocale('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('WhatsApp Control Center');
  });

  it('changes labels and visible validation without losing entered values', () => {
    render(<LocaleForm />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Customer named Templates' } });
    act(() => setLocale('pt-BR'));
    expect(screen.getByLabelText('Nome')).toHaveValue('Customer named Templates');
    expect(screen.getByRole('alert')).toHaveTextContent('Digite seu nome.');
    act(() => setLocale('en'));
    expect(screen.getByLabelText('Name')).toHaveValue('Customer named Templates');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name.');
  });

  it('keeps real account names in breadcrumbs unchanged', () => {
    setLocale('pt-BR');
    render(<PageHeader title="Support" breadcrumbs={[{ label: 'Templates' }]} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Support');
    expect(screen.getByText('Templates')).toHaveAttribute('aria-current', 'page');
  });

  it('localizes enum labels without changing API values', () => {
    render(<TemplateStatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(humanize('PENDING_REVIEW')).toBe('Análise pendente');
    expect(t('wamid.original-id')).toBe('wamid.original-id');
  });

  it('works when browser storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('disabled');
    });
    try {
      expect(() => setLocale('pt-BR')).not.toThrow();
      expect(getLocale()).toBe('pt-BR');
      expect(t('Password')).toBe('Senha');
    } finally {
      spy.mockRestore();
    }
  });

  it('synchronizes a language selection from another tab', () => {
    localStorage.setItem('wacc.locale', 'pt-BR');
    window.dispatchEvent(new StorageEvent('storage', { key: 'wacc.locale', newValue: 'pt-BR' }));
    expect(getLocale()).toBe('pt-BR');
    expect(document.documentElement.lang).toBe('pt-BR');
  });
});

describe('localized presentation', () => {
  it('uses Brazilian number, percentage, date, and plural conventions', () => {
    setLocale('pt-BR');
    expect(formatNumber(1234)).toBe('1.234');
    expect(formatPercent(1, 4)).toBe('25,0%');
    expect(formatDateTime('2026-02-12T12:00:00Z')).toContain('12/02/2026');
    expect(formatRelative(null)).toBe('nunca');
    expect(pluralize(2, 'connection')).toBe('2 conexões');
    setLocale('en');
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatPercent(1, 4)).toBe('25.0%');
  });

  it('preserves template variables and substitutes UI interpolation exactly once', () => {
    setLocale('pt-BR');
    expect(t('Hello {{1}}, your order {{2}} is ready for pickup.')).toContain('{{1}}');
    expect(t('Header text is limited to {0} characters.', 60)).toBe(
      'O texto do cabeçalho é limitado a 60 caracteres.',
    );
    const source = 'Variables must be sequential starting at {{1}}. Expected {{{0}}}, found {{{1}}}.';
    expect(t(source, 1, 3)).toContain('{{1}}');
    expect(t(source, 1, 3)).toContain('{{3}}');
    expect(t('Header text is limited to 60 characters.')).toBe(
      t('Header text is limited to {0} characters.', 60),
    );
  });

  it('preserves every positional interpolation in the Portuguese catalog', () => {
    const tokens = (value: string) => [...value.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
    for (const [key, message] of Object.entries(ptBR)) {
      expect(tokens(message), key).toEqual(tokens(key));
    }
  });

  it('covers the shared display labels while keeping template language codes unchanged', () => {
    for (const labels of [
      BUSINESS_VERTICALS,
      MESSAGING_LIMIT_TIERS,
      META_PERMISSIONS,
      TEMPLATE_LANGUAGES,
      TEMPLATE_REJECTION_REASONS,
    ]) {
      for (const label of Object.values(labels)) expect(ptBR, label).toHaveProperty(label);
    }
    setLocale('pt-BR');
    expect(t(TEMPLATE_LANGUAGES.en_US)).toBe('Inglês (EUA)');
    expect(t('Header {{first_name}}')).toBe('Cabeçalho {{first_name}}');
    expect(t('Body {{1}}')).toBe('Corpo {{1}}');
    expect(t('pt_BR')).toBe('pt_BR');
  });
});
