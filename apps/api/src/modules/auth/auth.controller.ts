import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import {
  idSchema,
  loginRequestSchema,
  twoFactorDisableRequestSchema,
  twoFactorEnableRequestSchema,
  twoFactorVerifyRequestSchema,
  type AuthSessionView,
  type LoginRequest,
  type LoginResponse,
  type TwoFactorChallenge,
  type TwoFactorDisableRequest,
  type TwoFactorEnableRequest,
  type TwoFactorSetup,
  type TwoFactorStatus,
  type TwoFactorVerifyRequest,
  type User,
} from '@forge/types';
import { env } from '../../infrastructure/config/env.js';
import { RateLimiterService } from '../../infrastructure/rate-limit/rate-limiter.service.js';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { readSessionTimes } from './auth.config.js';
import { AuthService, type AuthSessionIssue } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedUser, JwtPayload } from './types.js';

const SESSION_COOKIE_NAME = 'forge_session';
const REFRESH_COOKIE_NAME = 'forge_refresh';
/** Via proxy do Next, o navegador enxerga a API em `/api/*`: o refresh só viaja para `/api/auth/*`. */
const REFRESH_COOKIE_PATH = '/api/auth';
const REFRESH_RATE_LIMIT = { max: 60, windowMs: 60 * 1000 };

function clientMeta(request: Request) {
  return { userAgent: request.headers['user-agent'] ?? null, ipAddress: request.ip ?? null };
}

function cookieBase() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: env.NODE_ENV === 'production' };
}

/**
 * Cookies de sessão. `forge_session` guarda o JWT de acesso (curto) mas vive tanto quanto o refresh:
 * o `proxy.ts` do Next só checa a PRESENÇA dele para as rotas de página, e um JWT vencido é renovado
 * pelo cliente via `/auth/refresh` (cookie `forge_refresh`, opaco e rotativo, restrito a `/api/auth`).
 */
function setSessionCookies(response: Response, issued: AuthSessionIssue): void {
  const maxAge = readSessionTimes().refreshTtlMs;
  response.cookie(SESSION_COOKIE_NAME, issued.result.token, { ...cookieBase(), maxAge });
  response.cookie(REFRESH_COOKIE_NAME, issued.refreshToken, { ...cookieBase(), maxAge, path: REFRESH_COOKIE_PATH });
}

function clearSessionCookies(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, cookieBase());
  response.clearCookie(REFRESH_COOKIE_NAME, { ...cookieBase(), path: REFRESH_COOKIE_PATH });
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse | TwoFactorChallenge> {
    const outcome = await this.authService.login(body, clientMeta(request));
    if (outcome.kind === 'challenge') return { twoFactorRequired: true, challengeToken: outcome.challengeToken };

    // O corpo (`token`) continua sendo o caminho de chamadas de API/testes diretas (supertest), sem proxy.
    setSessionCookies(response, outcome);
    return outcome.result;
  }

  /** Segundo passo do login quando a conta tem 2FA. */
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactor(
    @Body(new ZodValidationPipe(twoFactorVerifyRequestSchema)) body: TwoFactorVerifyRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const issued = await this.authService.verifySecondFactor(body.challengeToken, body.code, clientMeta(request));
    setSessionCookies(response, issued);
    return issued.result;
  }

  /** Troca o refresh token (cookie) por um novo par de tokens. Sem JwtAuthGuard: é usado quando o acesso já venceu. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<LoginResponse> {
    this.rateLimiter.consume(`refresh:${request.ip ?? 'unknown'}`, REFRESH_RATE_LIMIT.max, REFRESH_RATE_LIMIT.windowMs);
    const refreshToken = (request.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) throw new UnauthorizedException('Sessão expirada. Entre novamente.');

    try {
      const issued = await this.authService.refresh(refreshToken, clientMeta(request));
      setSessionCookies(response, issued);
      return issued.result;
    } catch (error) {
      clearSessionCookies(response);
      throw error;
    }
  }

  // Sem JwtAuthGuard de propósito: quem tem um JWT já vencido precisa
  // conseguir sair (os cookies são httpOnly, só o servidor consegue apagá-los).
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const cookies = (request.cookies as Record<string, string> | undefined) ?? {};
    const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    const decoded = this.jwtService.decode<JwtPayload | null>(cookies[SESSION_COOKIE_NAME] ?? bearer ?? '');
    // Só o `sid` do próprio token (assinado pelo servidor) vale; um token forjado não encerra sessão alheia
    // porque o id é um UUID imprevisível e o refresh token exige posse do cookie.
    const sessionId = typeof decoded?.sid === 'string' && idSchema.safeParse(decoded.sid).success ? decoded.sid : undefined;
    await this.authService.logout(cookies[REFRESH_COOKIE_NAME], sessionId);
    clearSessionCookies(response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.authService.findAuthenticatedUser(user.userId);
  }

  // ---------- sessões

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async sessions(@CurrentUser() user: AuthenticatedUser): Promise<AuthSessionView[]> {
    return this.authService.listSessions(await this.authService.requireUser(user.userId), user.sessionId);
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  async revokeOthers(@CurrentUser() user: AuthenticatedUser): Promise<{ revoked: number }> {
    const revoked = await this.authService.revokeOtherSessions(await this.authService.requireUser(user.userId), user.sessionId);
    return { revoked };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async revokeSession(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    if (!idSchema.safeParse(id).success) throw new NotFoundException('Sessão não encontrada.');
    const found = await this.authService.revokeSession(await this.authService.requireUser(user.userId), user.sessionId, id);
    if (!found) throw new NotFoundException('Sessão não encontrada.');
  }

  // ---------- 2FA

  @Get('2fa')
  @UseGuards(JwtAuthGuard)
  async twoFactorStatus(@CurrentUser() user: AuthenticatedUser): Promise<TwoFactorStatus> {
    return this.authService.twoFactorStatus(await this.authService.requireUser(user.userId));
  }

  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async twoFactorSetup(@CurrentUser() user: AuthenticatedUser): Promise<TwoFactorSetup> {
    return this.authService.twoFactorSetup(await this.authService.requireUser(user.userId));
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async twoFactorEnable(
    @Body(new ZodValidationPipe(twoFactorEnableRequestSchema)) body: TwoFactorEnableRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.authService.twoFactorEnable(await this.authService.requireUser(user.userId), body.code);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async twoFactorDisable(
    @Body(new ZodValidationPipe(twoFactorDisableRequestSchema)) body: TwoFactorDisableRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.authService.twoFactorDisable(await this.authService.requireUser(user.userId), body.password, body.code);
  }
}
