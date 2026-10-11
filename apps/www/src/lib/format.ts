import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { getLocale, t as tr } from '@/lib/i18n';

export function formatNumber(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(getLocale() === 'en' ? 'en-US' : 'pt-BR').format(n);
}

export function formatPercent(part: number, total: number) {
  if (!total) return '—';
  return new Intl.NumberFormat(getLocale() === 'en' ? 'en-US' : 'pt-BR', {
    style: 'percent',
    minimumFractionDigits: part === total ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(part / total);
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const number = new Intl.NumberFormat(getLocale() === 'en' ? 'en-US' : 'pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (bytes < 1024 * 1024) return `${number.format(bytes / 1024)} KB`;
  return `${number.format(bytes / 1024 / 1024)} MB`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return format(new Date(iso), getLocale() === 'en' ? 'MMM d, yyyy HH:mm:ss' : 'dd/MM/yyyy HH:mm:ss', {
    locale: getDateLocale(),
  });
}

export function formatShortDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'HH:mm:ss');
  if (isYesterday(d)) return `${tr('Yesterday')} ${format(d, 'HH:mm')}`;
  return format(d, getLocale() === 'en' ? 'MMM d, HH:mm' : 'dd/MM, HH:mm', { locale: getDateLocale() });
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return tr('never');
  const d = new Date(iso);
  if (Date.now() - d.getTime() < 45_000) return tr('just now');
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: getDateLocale() });
}

/** `5591999999999` or `+55 91 99999-9999` → international display format. */
export function formatPhone(raw: string | null | undefined) {
  if (!raw) return '—';
  const digits = raw.replace(/[^\d+]/g, '');
  const parsed = parsePhoneNumberFromString(digits.startsWith('+') ? digits : `+${digits}`);
  return parsed?.formatInternational() ?? raw;
}

const ACRONYMS = new Set(['api', 'url', 'id', 'waba', 'otp', 'cta', 'sms', 'pmp']);

export function humanize(value: string | null | undefined) {
  if (!value) return '—';
  return tr(
    value
      .toLowerCase()
      .split('_')
      .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
      .join(' ')
      .replace(/^\w/, (c) => c.toUpperCase()),
  );
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${formatNumber(n)} ${tr(n === 1 ? one : many)}`;
}

export function getDateLocale() {
  return getLocale() === 'en' ? enUS : ptBR;
}
