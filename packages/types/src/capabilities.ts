/**
 * What a Meta connection can do, derived from the scopes reported by GET /debug_token.
 * The UI uses this to disable actions the integration cannot perform.
 */
export interface Capabilities {
  canManageAccounts: boolean;
  canManageTemplates: boolean;
  canManagePhoneNumbers: boolean;
  canManageFlows: boolean;
  canViewAnalytics: boolean;
  canSendMessages: boolean;
  canManageMedia: boolean;
  canDiscoverBusinessAssets: boolean;
  missingPermissions: string[];
}

export function capabilitiesFromScopes(scopes: readonly string[]): Capabilities {
  const has = (s: string) => scopes.includes(s);
  const management = has('whatsapp_business_management');
  const messaging = has('whatsapp_business_messaging');
  const business = has('business_management');
  const missingPermissions = ['whatsapp_business_management', 'whatsapp_business_messaging'].filter(
    (s) => !has(s),
  );
  return {
    canManageAccounts: management,
    canManageTemplates: management,
    canManagePhoneNumbers: management && messaging,
    canManageFlows: management,
    canViewAnalytics: management,
    canSendMessages: messaging,
    canManageMedia: messaging,
    canDiscoverBusinessAssets: business,
    missingPermissions,
  };
}

export const NO_CAPABILITIES: Capabilities = capabilitiesFromScopes([]);
