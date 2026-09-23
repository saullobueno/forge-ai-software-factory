'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest, type LoginResponse } from '@forge/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { ApiError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });

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
        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
          className="w-full max-w-sm space-y-5"
        >
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
            disabled={isSubmitting}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  );
}
