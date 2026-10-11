import { useQueryClient } from '@tanstack/react-query';
import { useListOrganizations, useLogout } from '@wacc/api-client';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Sheet,
  SheetContent,
  SheetTitle,
} from '@wacc/ui';
import {
  Activity,
  BarChart3,
  Building2,
  Check,
  ChevronsUpDown,
  FileText,
  Image,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  Phone,
  Plus,
  ScrollText,
  Search,
  Settings,
  Stethoscope,
  Sun,
  Users,
  Webhook,
  Workflow,
} from 'lucide-react';
import * as React from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { humanize } from '@/lib/format';
import { localizeText, t as tr, useLocale } from '@/lib/i18n';
import { orgPath, useOrg } from '@/lib/org';
import { type ThemePreference, useTheme } from '@/lib/theme';
import { CommandPalette } from './command-palette';
import { LanguageMenu } from './language-menu';
import { ThemeToggle } from './theme-toggle';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

function useNav(orgId: string): { title?: string; items: NavItem[] }[] {
  const p = (path: string) => orgPath(orgId, path);
  return [
    { items: [{ label: tr('Overview'), to: p(''), icon: LayoutDashboard, end: true }] },
    {
      title: tr('WhatsApp'),
      items: [
        { label: tr('Accounts'), to: p('accounts'), icon: Building2 },
        { label: tr('Phone numbers'), to: p('phone-numbers'), icon: Phone },
        { label: tr('Templates'), to: p('templates'), icon: FileText },
        { label: tr('Flows'), to: p('flows'), icon: Workflow },
        { label: tr('Messages'), to: p('messages'), icon: MessageSquare },
        { label: tr('Media'), to: p('media'), icon: Image },
      ],
    },
    { items: [{ label: tr('Analytics'), to: p('analytics'), icon: BarChart3 }] },
    {
      title: tr('Developers'),
      items: [
        { label: tr('Webhooks'), to: p('developers/webhooks'), icon: Webhook },
        { label: tr('Event logs'), to: p('developers/events'), icon: Activity },
        { label: tr('API logs'), to: p('developers/api-logs'), icon: ScrollText },
        { label: tr('Diagnostics'), to: p('developers/diagnostics'), icon: Stethoscope },
      ],
    },
    {
      title: tr('Organization'),
      items: [
        { label: tr('Members'), to: p('settings/members'), icon: Users },
        { label: tr('Settings'), to: p('settings'), icon: Settings, end: true },
      ],
    },
  ];
}

function OrgSwitcher() {
  useLocale();
  const { orgId, organization, role } = useOrg();
  const orgs = useListOrganizations();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.05]"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-semibold text-accent-fg">
            {(organization?.name ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">
              {organization?.name ?? tr('Organization')}
            </span>
            <span className="block truncate text-[11px] text-subtle">{role ? humanize(role) : ''}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>{tr('Organizations')}</DropdownMenuLabel>
        {(orgs.data ?? []).map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => navigate(orgPath(o.id))}>
            <span className="flex size-5 items-center justify-center rounded bg-raised text-[10px] font-semibold text-muted">
              {o.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === orgId && <Check className="!text-accent-text" aria-hidden />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/onboarding')}>
          <Plus /> {tr('New organization')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  useLocale();
  const { orgId } = useOrg();
  const groups = useNav(orgId);
  return (
    <nav aria-label={tr('Main')} className="flex flex-col gap-4">
      {groups.map((group, gi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static groups
        <div key={gi} className="grid gap-px">
          {group.title && <p className="px-2 pb-1 text-[11px] font-medium text-subtle">{group.title}</p>}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-surface text-fg shadow-xs ring-1 ring-border'
                    : 'text-muted hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.05]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn('size-4', isActive ? 'text-accent-text' : 'text-subtle')}
                    aria-hidden
                  />
                  {localizeText(item.label)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  useLocale();
  return (
    <div className="flex h-full flex-col gap-4 px-3 py-3">
      <OrgSwitcher />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav onNavigate={onNavigate} />
      </div>
    </div>
  );
}

const themeIcon: Record<ThemePreference, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

function ThemeMenu() {
  useLocale();
  const { preference, setPreference } = useTheme();
  const Icon = themeIcon[preference];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={tr('Theme: {0}', humanize(preference))}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> {tr('Light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> {tr('Dark')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> {tr('System')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu() {
  useLocale();
  const { user } = useOrg();
  const logout = useLogout();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={tr('Account menu')}
          className="flex size-8 items-center justify-center rounded-full bg-raised text-xs font-semibold text-muted ring-1 ring-border transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-fg">{user?.name}</p>
          <p className="truncate text-xs text-subtle">{user?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            logout.mutate(undefined, {
              onSettled: () => {
                qc.clear();
                navigate('/login');
              },
            })
          }
        >
          <LogOut /> {tr('Sign out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  useLocale();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const location = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // New page: start at the top. Focus stays in the document for keyboard users.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on path change only
  React.useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {tr('Skip to content')}
      </a>
      <aside className="hidden w-56 shrink-0 lg:block">
        <Sidebar />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" width="w-64" className="bg-canvas">
          <SheetTitle className="sr-only">{tr('Navigation')}</SheetTitle>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col p-0 lg:py-2 lg:pr-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:rounded-[10px] lg:border lg:border-border lg:shadow-xs">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={tr('Open navigation')}
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-8 w-full max-w-80 items-center gap-2 rounded-md border border-border bg-raised px-2.5 text-[13px] text-subtle transition-colors hover:border-border-strong hover:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search className="size-4" aria-hidden />
              <span className="flex-1 text-left">{tr('Search or jump to…')}</span>
              <Kbd>{tr('Ctrl K')}</Kbd>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <LanguageMenu />
              <ThemeToggle />
              <ThemeMenu />
              <ProfileMenu />
            </div>
          </div>
          <main id="main" ref={mainRef} className="min-h-0 flex-1 overflow-y-auto" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function AuthFrame({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  useLocale();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <LanguageMenu />
        <ThemeToggle />
        <ThemeMenu />
      </div>
      <Link to="/" className="mb-6 flex items-center gap-2 text-sm font-semibold text-fg">
        <img src="/favicon.svg" alt="" className="size-6" />
        {tr('WhatsApp Control Center')}
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xs">
        {children}
      </div>
      {footer && <div className="mt-4 text-center text-[13px] text-muted">{footer}</div>}
    </div>
  );
}
