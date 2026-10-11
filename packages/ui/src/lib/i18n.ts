import { useSyncExternalStore } from 'react';

export type Locale = 'pt-BR' | 'en';
export const LOCALE_STORAGE_KEY = 'wacc.locale';
let catalogs: Partial<Record<Locale, Readonly<Record<string, string>>>> = {};
let patterns: { expression: RegExp; key: string; indices: number[] }[] = [];
const listeners = new Set<() => void>();

function readLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'pt-BR';
  } catch {
    return 'pt-BR';
  }
}

let locale: Locale = readLocale();
export const getLocale = () => locale;

/** Keep stateful error messages in their source language and translate when displaying them. */
export function formatMessage(key: string, ...values: (string | number | null | undefined)[]): string {
  return key.replace(
    /(?<!\{)\{(\d+)\}(?!\})|(?<=\{\{)\{(\d+)\}(?=\}\})/g,
    (placeholder, outer: string, nested: string) =>
      Number(outer ?? nested) < values.length ? String(values[Number(outer ?? nested)] ?? '') : placeholder,
  );
}

export function t(key: string, ...values: (string | number | null | undefined)[]): string {
  let message = catalogs[locale]?.[key];
  if (message === undefined && locale !== 'en' && values.length === 0) {
    // Shared validators return complete messages; match only registered message templates.
    for (const pattern of patterns) {
      const match = pattern.expression.exec(key);
      if (!match) continue;
      message = catalogs[locale]?.[pattern.key];
      values = [];
      pattern.indices.forEach((index, position) => {
        values[index] = match[position + 1];
      });
      break;
    }
  }
  message ??= key;
  return formatMessage(message, ...values);
}

/** Localized presentation labels may also contain icons or other React nodes. */
export function localizeText<T>(value: T): T {
  return (typeof value === 'string' ? t(value) : value) as T;
}

function applyLocale() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.title = t('WhatsApp Control Center');
}

export function configureTranslations(translations: typeof catalogs) {
  catalogs = translations;
  patterns = Object.keys(translations['pt-BR'] ?? {}).flatMap((key) => {
    const indices: number[] = [];
    let position = 0;
    let expression = '^';
    for (const match of key.matchAll(/(?<!\{)\{(\d+)\}(?!\})|(?<=\{\{)\{(\d+)\}(?=\}\})/g)) {
      expression += key.slice(position, match.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(.+?)';
      indices.push(Number(match[1] ?? match[2]));
      position = match.index + match[0].length;
    }
    if (!indices.length) return [];
    expression += key.slice(position).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
    return [{ expression: new RegExp(expression), key, indices }];
  });
  applyLocale();
}

export function setLocale(next: Locale) {
  if (next !== 'pt-BR' && next !== 'en') return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // The selection still works for the current session when storage is unavailable.
  }
  if (locale === next) return;
  locale = next;
  applyLocale();
  listeners.forEach((listener) => {
    listener();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe components without replacing the route tree or losing form state. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => 'pt-BR');
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== LOCALE_STORAGE_KEY && event.key !== null) return;
    const next = readLocale();
    if (locale === next) return;
    locale = next;
    applyLocale();
    listeners.forEach((listener) => {
      listener();
    });
  });
}
