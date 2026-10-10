export const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { VIEWER: 0, DEVELOPER: 1, ADMIN: 2, OWNER: 3 };

/** True when `role` is at least as privileged as `minimum`. */
export function hasRole(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

/**
 * Minimum role per action. The API enforces these; the UI uses them to hide or disable actions.
 * - VIEWER: read everything except secrets.
 * - DEVELOPER: send test messages, upload media, manage templates and flows, replay webhooks.
 * - ADMIN: phone registration, business profile, Meta connections, webhooks, members.
 * - OWNER: delete the organization.
 */
export const ACTION_MIN_ROLE = {
  'org.read': 'VIEWER',
  'org.update': 'ADMIN',
  'org.delete': 'OWNER',
  'members.manage': 'ADMIN',
  'connections.manage': 'ADMIN',
  'wabas.sync': 'DEVELOPER',
  'wabas.subscribe': 'ADMIN',
  'phones.manage': 'ADMIN',
  'profile.update': 'ADMIN',
  'templates.manage': 'DEVELOPER',
  'flows.manage': 'DEVELOPER',
  'messages.send': 'DEVELOPER',
  'media.manage': 'DEVELOPER',
  'webhooks.manage': 'ADMIN',
  'webhooks.replay': 'DEVELOPER',
  'logs.read': 'DEVELOPER',
  'audit.read': 'ADMIN',
} as const satisfies Record<string, Role>;

export type Action = keyof typeof ACTION_MIN_ROLE;

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return hasRole(role, ACTION_MIN_ROLE[action]);
}
