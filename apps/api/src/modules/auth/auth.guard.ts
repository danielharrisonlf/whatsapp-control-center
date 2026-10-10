import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Action, can } from '@wacc/types';
import { AppException, forbidden, notFound } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyAccessToken } from './access-token';
import { ACCESS_COOKIE } from './auth.cookies';
import { type AuthenticatedRequest, IS_PUBLIC, REQUIRED_ACTION } from './auth.decorators';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global guard.
 * 1. Every route requires a valid access cookie unless marked `@Public()`.
 * 2. Routes with an `:organizationId` param require a membership in that organization; the id
 *    from the URL is never trusted on its own.
 * 3. `@RequireAction()` enforces the minimum role for the action.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    const claims = token ? verifyAccessToken(token, this.env.AUTH_SECRET) : null;
    if (!claims) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Your session expired. Sign in again.',
      );
    }
    req.user = { id: claims.sub, sessionId: claims.sid };
    RequestContext.set({ userId: claims.sub });

    const param = req.params?.organizationId;
    const organizationId = typeof param === 'string' ? param : undefined;
    const action = this.reflector.getAllAndOverride<Action | undefined>(REQUIRED_ACTION, targets);
    if (!organizationId) return true;

    if (!UUID.test(organizationId)) throw notFound('Organization');
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: claims.sub, organizationId } },
      select: { role: true },
    });
    // Same response as a missing org: do not reveal which organizations exist.
    if (!membership) throw notFound('Organization');
    req.membership = { organizationId, role: membership.role };
    RequestContext.set({ organizationId });

    if (action && !can(membership.role, action)) {
      throw forbidden(`Your role (${membership.role}) cannot perform this action.`);
    }
    return true;
  }
}
