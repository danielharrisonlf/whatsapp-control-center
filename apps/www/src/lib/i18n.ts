import { configureTranslations } from '@wacc/ui';
import { en, ptBR } from './locales';

configureTranslations({ 'pt-BR': ptBR, en });

export { formatMessage, getLocale, type Locale, localizeText, setLocale, t, useLocale } from '@wacc/ui';
