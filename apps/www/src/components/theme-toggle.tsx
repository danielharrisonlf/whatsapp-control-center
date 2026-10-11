import { Button, Tooltip } from '@wacc/ui';
import { Moon, Sun } from 'lucide-react';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** One click switches between light and dark. The icon shows the theme you will switch to. */
export function ThemeToggle() {
  useLocale();
  const { resolved, toggle } = useTheme();
  const label = resolved === 'dark' ? tr('Switch to light theme') : tr('Switch to dark theme');
  return (
    <Tooltip content={localizeText(label)}>
      <Button variant="ghost" size="icon" aria-label={localizeText(label)} onClick={toggle}>
        {resolved === 'dark' ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}
