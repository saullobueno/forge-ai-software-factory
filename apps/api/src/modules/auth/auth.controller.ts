import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { loginRequestSchema, type LoginRequest, type LoginResponse, type User } from '@forge/types';
import { env } from '../../infrastructure/config/env.js';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedUser } from './types.js';

const SESSION_COOKIE_NAME = 'forge_session';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(body);

    // Cookie httpOnly same-origin. Fase 4 adicionou o proxy same-origin em
    // apps/web (`next.config.ts` `rewrites()` de `/api/*` para esta API) —
    // o browser chama `/api/auth/login` na mesma origem do Next.js e
    // recebe/mantém este cookie automaticamente. O corpo da resposta
    // (`token`) continua sendo o caminho usado por chamadas de API/testes
    // diretas (ex.: supertest), sem passar pelo proxy.
    response.cookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
    });

    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.authService.findAuthenticatedUser(user.userId);
  }
}
