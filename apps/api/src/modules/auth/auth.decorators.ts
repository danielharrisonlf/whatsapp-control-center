import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Action } from '@wacc/types';
import type { Request } from 'express';

export const IS_PUBLIC = 'auth:isPublic';
export const REQUIRED_ACTION = 'auth:requiredAction';

/** Skips authentication (login, signup, webhooks, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Minimum role for the route, resolved from `ACTION_MIN_ROLE` in @wacc/types. */
export const RequireAction = (action: Action) => SetMetadata(REQUIRED_ACTION, action);

export interface AuthUser {
  id: string;
  sessionId: string;
}

export interface OrgMembership {
  organizationId: string;
  role: Role;
}

export type AuthenticatedRequest = Request & { user?: AuthUser; membership?: OrgMembership };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user!;
});

/** Membership validated by AuthGuard for the `:organizationId` in the URL. */
export const CurrentMembership = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgMembership => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().membership!;
});
