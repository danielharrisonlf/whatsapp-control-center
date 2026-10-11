import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { setLocale } from '@/lib/i18n';

// Existing assertions use English; locale-specific tests choose their language explicitly.
beforeEach(() => setLocale('en'));
