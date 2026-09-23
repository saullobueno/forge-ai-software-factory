import { z } from 'zod';
import { userSchema } from './organization';

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
