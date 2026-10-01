'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest, type LoginResponse } from '@forge/types';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { useForm } from 'react-hook-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { ApiError } from '@/lib/api-client';

// Credenciais do seed demo (packages/database/src/seed/run-seed.ts) —
// organização fictícia "Acme Platform", nunca dados reais. Exibidas e
// pré-preenchidas de propósito: este é um portfólio público, o objetivo é
// deixar qualquer visitante testar o produto sem precisar criar conta.
const DEMO_ACCOUNTS = [
  { email: 'tech-lead@acme-platform.example', password: 'demo1234', role: 'Tech Lead' },
  { email: 'platform@acme-platform.example', password: 'demo1234', role: 'Platform Engineer' },
  { email: 'dev@acme-platform.example', password: 'demo1234', role: 'Developer' },
  { email: 'admin@acme-platform.example', password: 'demo1234', role: 'Admin' },
] as const;

// `false` no servidor/antes da hidratação, `true` depois: enquanto o React não assumiu a página,
// um submit nativo mandaria e-mail e senha na URL (GET) — por isso o botão só habilita hidratado.
const subscribeNever = () => () => undefined;

export default function LoginPage() {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: DEMO_ACCOUNTS[0].email, password: DEMO_ACCOUNTS[0].password },
  });

  const onSubmit = async (data: LoginRequest) => {
    setFormError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        // Mostra exatamente a mensagem genérica que a API retorna (ex.:
        // "Credenciais inválidas.") — nunca inventa detalhamento que a API
        // não dá, por design de segurança (evita account enumeration).
        const message =
          body !== null && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : 'Não foi possível entrar.';
        throw new ApiError(message, response.status);
      }

      void (body as LoginResponse);
      router.push('/projects');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível entrar. Tente novamente.');
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-mono text-sm font-semibold tracking-tight">forge</span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-5 rounded-lg border border-border p-6">
          <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5">
            <div className="space-y-1.5 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Entrar no Forge</h1>
              <p className="text-sm text-muted-foreground">Use as credenciais da sua organização.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                {...register('email')}
              />
              {errors.email && <p className="text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
              )}
            </div>

            {formError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !hydrated}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <footer className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Credenciais de demonstração</p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="font-mono">{account.email}</span>
                  <span className="font-mono whitespace-nowrap">
                    {account.password} · {account.role}
                  </span>
                </li>
              ))}
            </ul>
          </footer>
        </div>
      </main>
    </div>
  );
}
