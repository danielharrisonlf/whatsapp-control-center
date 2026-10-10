import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { SuccessDto, success } from '../../common/dto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { verifyAccessToken } from './access-token';
import { ACCESS_COOKIE, clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './auth.cookies';
import { type AuthUser, CurrentUser, Public } from './auth.decorators';
import { AuthConfigDto, LoginDto, MeDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';

const clientInfo = (req: Request) => ({ userAgent: req.headers['user-agent'], ip: req.ip });

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get('config')
  @ApiOperation({ operationId: 'getAuthConfig', summary: 'Public authentication settings' })
  @ZodResponse({ type: AuthConfigDto })
  config() {
    return { signupEnabled: this.env.AUTH_ALLOW_SIGNUP };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ operationId: 'register', summary: 'Create an account and start a session' })
  @ZodResponse({ status: 201, type: MeDto })
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.register(body, clientInfo(req));
    setAuthCookies(res, this.env, session);
    return this.auth.me(session.userId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ operationId: 'login', summary: 'Sign in with email and password' })
  @ZodResponse({ status: 200, type: MeDto })
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(body, clientInfo(req));
    setAuthCookies(res, this.env, session);
    return this.auth.me(session.userId);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'refreshSession',
    summary: 'Rotate the refresh token and issue a new access cookie',
  })
  @ZodResponse({ status: 200, type: SuccessDto })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], clientInfo(req));
      setAuthCookies(res, this.env, tokens);
      return success;
    } catch (error) {
      clearAuthCookies(res, this.env);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ operationId: 'logout', summary: 'End the current session' })
  @ZodResponse({ status: 200, type: SuccessDto })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    const claims = access ? verifyAccessToken(access, this.env.AUTH_SECRET) : null;
    await this.auth.logout(claims?.sid, req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.env);
    return success;
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ operationId: 'getMe', summary: 'Current user and organization memberships' })
  @ZodResponse({ type: MeDto })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
