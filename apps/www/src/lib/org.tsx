import { type Capabilities, useGetCapabilities, useGetMe } from '@wacc/api-client';
import { type Action, can } from '@wacc/types';
import { useParams } from 'react-router';

/** The organization in the URL plus the current user's role in it. */
export function useOrg() {
  const { orgId } = useParams<{ orgId: string }>();
  const me = useGetMe();
  const membership = me.data?.memberships.find((m) => m.organization.id === orgId);
  return {
    orgId: orgId!,
    organization: membership?.organization,
    role: membership?.role,
    user: me.data?.user,
    memberships: me.data?.memberships ?? [],
  };
}

export function useCan(action: Action) {
  const { role } = useOrg();
  return can(role ?? null, action);
}

const NONE: Capabilities = {
  connected: false,
  canManageAccounts: false,
  canManageTemplates: false,
  canManagePhoneNumbers: false,
  canManageFlows: false,
  canViewAnalytics: false,
  canSendMessages: false,
  canManageMedia: false,
  canDiscoverBusinessAssets: false,
  missingPermissions: [],
};

/** What the connected Meta integrations allow (derived from token scopes by the API). */
export function useCapabilities() {
  const { orgId } = useOrg();
  const query = useGetCapabilities(orgId, { query: { staleTime: 60_000 } });
  return { ...(query.data ?? NONE), isLoading: query.isLoading };
}

export function orgPath(orgId: string, path = '') {
  return `/o/${orgId}${path ? `/${path.replace(/^\//, '')}` : ''}`;
}
