import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomToken, sha256 } from '../../common/crypto';
import { iso } from '../../common/dto';
import { AppException, conflict, forbidden } from '../../common/errors';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { signAccessToken } from './access-token';
import type { LoginDto, MeDto, RegisterDto } from './auth.dto';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

const invalidCredentials = () =>
  new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Email or password is incorrect.');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(input: RegisterDto, client: ClientInfo) {
    const userCount = await this.prisma.user.count();
    // The very first account can always be created, so a fresh install is usable.
    if (!this.env.AUTH_ALLOW_SIGNUP && userCount > 0) {
      throw forbidden('Sign up is disabled. Ask an organization admin for an invitation.');
    }
    try {
      const user = await this.prisma.user.create({
        data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password) },
      });
      return this.createSession(user.id, client);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('An account with this email already exists.');
      }
      throw error;
    }
  }

  async login(input: LoginDto, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always run the hash to avoid revealing which emails exist through timing.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) throw invalidCredentials();
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.createSession(user.id, client);
  }

  /**
   * Rotates the refresh token. Presenting an already-rotated token means it was stolen or
   * replayed: the whole session is revoked.
   */
  async refresh(refreshToken: string | undefined, client: ClientInfo): Promise<IssuedTokens> {
    if (!refreshToken) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Sign in again.');
    const hash = sha256(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });

    if (!session) {
      const reused = await this.prisma.session.findFirst({
        where: { previousTokenHash: hash, revokedAt: null },
      });
      if (reused) {
        this.logger.warn(`Refresh token reuse detected for session ${reused.id}; revoking it.`);
        await this.prisma.session.update({ where: { id: reused.id }, data: { revokedAt: new Date() } });
      }
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Your session expired. Sign in again.',
      );
    }
    if (session.revokedAt || session.expiresAt <= new Date()) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Your session expired. Sign in again.',
      );
    }

    const nextRefresh = randomToken();
    const updated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: hash },
      data: {
        refreshTokenHash: sha256(nextRefresh),
        previousTokenHash: hash,
        lastUsedAt: new Date(),
        userAgent: client.userAgent?.slice(0, 500),
        ipAddress: client.ip,
      },
    });
    // Two tabs refreshing at once: the loser gets a 401 and its next request uses the new cookie.
    if (updated.count === 0)
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Session refreshed elsewhere.');
    return {
      accessToken: this.accessToken(session.userId, session.id),
      refreshToken: nextRefresh,
      refreshExpiresAt: session.expiresAt,
    };
  }

  async logout(sessionId: string | undefined, refreshToken: string | undefined) {
    if (sessionId) {
      await this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (refreshToken) {
      await this.prisma.session.updateMany({
        where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { organization: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!user) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Account not found.');
    return {
      user: { id: user.id, email: user.email, name: user.name, createdAt: iso(user.createdAt) },
      memberships: user.memberships.map((m) => ({
        role: m.role,
        organization: { id: m.organization.id, name: m.organization.name, slug: m.organization.slug },
      })),
    };
  }

  private async createSession(
    userId: string,
    client: ClientInfo,
  ): Promise<IssuedTokens & { userId: string }> {
    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + this.env.AUTH_REFRESH_TTL_DAYS * 86_400_000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(refreshToken),
        expiresAt,
        userAgent: client.userAgent?.slice(0, 500),
        ipAddress: client.ip,
      },
    });
    return {
      userId,
      accessToken: this.accessToken(userId, session.id),
      refreshToken,
      refreshExpiresAt: expiresAt,
    };
  }

  private accessToken(userId: string, sessionId: string) {
    return signAccessToken(
      { sub: userId, sid: sessionId, exp: Math.floor(Date.now() / 1000) + this.env.AUTH_ACCESS_TTL_SECONDS },
      this.env.AUTH_SECRET,
    );
  }
}
