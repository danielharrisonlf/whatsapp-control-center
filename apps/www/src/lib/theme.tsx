import * as React from 'react';
import { t as tr, useLocale } from '@/lib/i18n';

export type ThemePreference = 'light' | 'dark' | 'system';
const KEY = 'wacc.theme';

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function resolve(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(pref: ThemePreference) {
  const root = document.documentElement;
  // Suspend transitions for one frame so the whole UI does not animate the switch.
  root.classList.add('theme-switching');
  root.dataset.theme = resolve(pref);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}

const ThemeContext = React.createContext<{
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (p: ThemePreference) => void;
  /** Switches to the opposite of the theme currently shown and stores it as an explicit choice. */
  toggle: () => void;
} | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useLocale();
  const [preference, setPref] = React.useState<ThemePreference>(read);
  const [resolved, setResolved] = React.useState<'light' | 'dark'>(() => resolve(read()));

  React.useEffect(() => {
    apply(preference);
    setResolved(resolve(preference));
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      apply('system');
      setResolved(resolve('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = React.useCallback((p: ThemePreference) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      // Storage may be unavailable (private mode); the choice still applies for this session.
    }
    setPref(p);
  }, []);

  const toggle = React.useCallback(
    () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
    [resolved, setPreference],
  );

  const value = React.useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error(tr('useTheme must be used inside ThemeProvider'));
  return ctx;
}
