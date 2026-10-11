import { isApiRequestError, useGetMe } from '@wacc/api-client';
import * as React from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation, useParams } from 'react-router';
import { AppShell } from '@/components/app-shell';
import { BlockSkeleton, ErrorState } from '@/components/states';

const lazy = <T extends object>(load: () => Promise<T>, name: keyof T) =>
  React.lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType })));

const LoginPage = lazy(() => import('@/features/auth/auth-pages'), 'LoginPage');
const RegisterPage = lazy(() => import('@/features/auth/auth-pages'), 'RegisterPage');
const AcceptInvitePage = lazy(() => import('@/features/auth/accept-invite'), 'AcceptInvitePage');
const OnboardingPage = lazy(() => import('@/features/onboarding/onboarding-page'), 'OnboardingPage');
const OverviewPage = lazy(() => import('@/features/dashboard/overview-page'), 'OverviewPage');
const ConnectPage = lazy(() => import('@/features/connect/connect-page'), 'ConnectPage');
const AccountsPage = lazy(() => import('@/features/accounts/accounts-page'), 'AccountsPage');
const AccountDetailPage = lazy(() => import('@/features/accounts/account-detail-page'), 'AccountDetailPage');
const PhoneNumbersPage = lazy(() => import('@/features/phones/phone-numbers-page'), 'PhoneNumbersPage');
const PhoneDetailPage = lazy(() => import('@/features/phones/phone-detail-page'), 'PhoneDetailPage');
const AddPhonePage = lazy(() => import('@/features/phones/add-phone-page'), 'AddPhonePage');
const TemplatesPage = lazy(() => import('@/features/templates/templates-page'), 'TemplatesPage');
const TemplateDetailPage = lazy(
  () => import('@/features/templates/template-detail-page'),
  'TemplateDetailPage',
);
const TemplateEditorPage = lazy(
  () => import('@/features/templates/template-editor-page'),
  'TemplateEditorPage',
);
const FlowsPage = lazy(() => import('@/features/flows/flows-page'), 'FlowsPage');
const FlowEditorPage = lazy(() => import('@/features/flows/flow-editor-page'), 'FlowEditorPage');
const InboxPage = lazy(() => import('@/features/messages/inbox-page'), 'InboxPage');
const PlaygroundPage = lazy(() => import('@/features/messages/playground-page'), 'PlaygroundPage');
const MediaPage = lazy(() => import('@/features/media/media-page'), 'MediaPage');
const AnalyticsPage = lazy(() => import('@/features/analytics/analytics-page'), 'AnalyticsPage');
const WebhooksPage = lazy(() => import('@/features/developers/webhooks-page'), 'WebhooksPage');
const EventsPage = lazy(() => import('@/features/developers/events-page'), 'EventsPage');
const ApiLogsPage = lazy(() => import('@/features/developers/api-logs-page'), 'ApiLogsPage');
const DiagnosticsPage = lazy(() => import('@/features/developers/diagnostics-page'), 'DiagnosticsPage');
const AuditPage = lazy(() => import('@/features/developers/audit-page'), 'AuditPage');
const MembersPage = lazy(() => import('@/features/organization/members-page'), 'MembersPage');
const SettingsPage = lazy(() => import('@/features/organization/settings-page'), 'SettingsPage');

function PageFallback() {
  return <BlockSkeleton className="max-w-xl px-6 py-8" lines={5} />;
}

function Suspended({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<div className="h-dvh bg-canvas" aria-busy="true" />}>
      {children}
    </React.Suspense>
  );
}

/** Requires a session; redirects to /login otherwise. */
function RequireAuth() {
  const me = useGetMe({ query: { staleTime: 5 * 60_000 } });
  const location = useLocation();
  if (me.isLoading) return <div className="h-dvh bg-canvas" aria-busy="true" />;
  if (me.error) {
    if (isApiRequestError(me.error) && me.error.status === 401) {
      return (
        <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
      );
    }
    return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  }
  return <Outlet />;
}

/** `/` → first organization, or onboarding when the user has none. */
function HomeRedirect() {
  const me = useGetMe();
  const first = me.data?.memberships[0]?.organization.id;
  return <Navigate to={first ? `/o/${first}` : '/onboarding'} replace />;
}

/** Guards `/o/:orgId`: the user must be a member (the API enforces it too). */
function OrgGate() {
  const { orgId } = useParams();
  const me = useGetMe();
  const member = me.data?.memberships.some((m) => m.organization.id === orgId);
  if (!member) return <Navigate to="/" replace />;
  return (
    <React.Suspense fallback={<PageFallback />}>
      <Outlet />
    </React.Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspended>
        <LoginPage />
      </Suspended>
    ),
  },
  {
    path: '/register',
    element: (
      <Suspended>
        <RegisterPage />
      </Suspended>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <HomeRedirect /> },
      {
        path: '/onboarding',
        element: (
          <Suspended>
            <OnboardingPage />
          </Suspended>
        ),
      },
      {
        path: '/invite/:token',
        element: (
          <Suspended>
            <AcceptInvitePage />
          </Suspended>
        ),
      },
      {
        path: '/o/:orgId',
        element: <AppShell />,
        children: [
          {
            element: <OrgGate />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'connect', element: <ConnectPage /> },
              { path: 'accounts', element: <AccountsPage /> },
              { path: 'accounts/:wabaId', element: <AccountDetailPage /> },
              { path: 'phone-numbers', element: <PhoneNumbersPage /> },
              { path: 'phone-numbers/new', element: <AddPhonePage /> },
              { path: 'phone-numbers/:phoneId', element: <PhoneDetailPage /> },
              { path: 'templates', element: <TemplatesPage /> },
              { path: 'templates/new', element: <TemplateEditorPage /> },
              { path: 'templates/:templateId', element: <TemplateDetailPage /> },
              { path: 'templates/:templateId/edit', element: <TemplateEditorPage /> },
              { path: 'flows', element: <FlowsPage /> },
              { path: 'flows/:flowId', element: <FlowEditorPage /> },
              { path: 'messages', element: <InboxPage /> },
              { path: 'messages/playground', element: <PlaygroundPage /> },
              { path: 'media', element: <MediaPage /> },
              { path: 'analytics', element: <AnalyticsPage /> },
              { path: 'developers/webhooks', element: <WebhooksPage /> },
              { path: 'developers/events', element: <EventsPage /> },
              { path: 'developers/api-logs', element: <ApiLogsPage /> },
              { path: 'developers/diagnostics', element: <DiagnosticsPage /> },
              { path: 'developers/audit', element: <AuditPage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'settings/members', element: <MembersPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
