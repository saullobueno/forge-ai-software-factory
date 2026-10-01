import { z } from 'zod';
import { userSchema } from './organization.ts';

/**
 * Corpo de `POST /auth/login` (Fase 2 — Auth/RBAC). A senha em texto claro
 * nunca é persistida nem logada; trafega apenas nesta requisição, sobre
 * TLS em produção.
 */
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Resposta de `POST /auth/login`. `user` nunca inclui o hash de senha —
 * `userSchema` não declara esse campo, então validar contra ele já
 * descarta qualquer campo sensível vindo da camada de persistência.
 */
export const loginResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * Login de conta com 2FA: a senha estava certa, falta o segundo fator. O
 * `challengeToken` (curto, não serve como sessão) é trocado por uma sessão em
 * `POST /auth/2fa/verify`.
 */
export const twoFactorChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challengeToken: z.string(),
});
export type TwoFactorChallenge = z.infer<typeof twoFactorChallengeSchema>;

/** Código de 6 dígitos do app autenticador OU código de recuperação (`xxxxx-xxxxx`). */
export const twoFactorCodeSchema = z.string().trim().min(6).max(20);

export const twoFactorVerifyRequestSchema = z.object({
  challengeToken: z.string().min(1),
  code: twoFactorCodeSchema,
});
export type TwoFactorVerifyRequest = z.infer<typeof twoFactorVerifyRequestSchema>;

export const twoFactorEnableRequestSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/u) });
export type TwoFactorEnableRequest = z.infer<typeof twoFactorEnableRequestSchema>;

export const twoFactorDisableRequestSchema = z.object({
  password: z.string().min(1).max(200),
  code: twoFactorCodeSchema,
});
export type TwoFactorDisableRequest = z.infer<typeof twoFactorDisableRequestSchema>;

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}

export interface AuthSessionView {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
}
