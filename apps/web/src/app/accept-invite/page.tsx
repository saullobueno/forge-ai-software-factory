'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { InvitationLookup } from '@forge/types';
import { ThemeToggle } from '@/components/theme-toggle';
import { MEMBER_ROLE_LABELS } from '@/lib/labels';

const INPUT_CLASS = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

async function readMessage(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return body !== null && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : fallback;
}

function AcceptInviteForm() {
  const token = useSearchParams().get('token') ?? '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  // Endpoint público: usa fetch direto (apiFetch redirecionaria para /login em 401).
  const lookup = useQuery({
    queryKey: ['invitation-lookup', token],
    enabled: token.length > 0,
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/invitations/lookup/${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(await readMessage(response, 'Convite inválido, expirado ou já utilizado.'));
      return (await response.json()) as InvitationLookup;
    },
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      if (!response.ok) throw new Error(await readMessage(response, 'Não foi possível aceitar o convite.'));
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível aceitar o convite.');
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-sm">Conta criada com sucesso.</p>
        <Link href="/login" className="rounded-md border border-border px-3 py-2 text-center text-sm font-medium hover:bg-muted">
          Ir para o login
        </Link>
      </div>
    );
  }

  if (token.length === 0 || lookup.isError) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {lookup.error instanceof Error ? lookup.error.message : 'Convite inválido, expirado ou já utilizado.'}
      </p>
    );
  }

  if (!lookup.data) return <p className="text-sm text-muted-foreground">Verificando convite…</p>;

  return (
    <form onSubmit={handleSubmit} aria-label="Aceitar convite" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Você foi convidado para <strong className="text-foreground">{lookup.data.organizationName}</strong> como{' '}
        <strong className="text-foreground">{MEMBER_ROLE_LABELS[lookup.data.role]}</strong> ({lookup.data.email}).
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="invite-name" className="text-sm font-medium">
          Nome
        </label>
        <input id="invite-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={INPUT_CLASS} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="invite-password" className="text-sm font-medium">
          Senha (mínimo 8 caracteres)
        </label>
        <input
          id="invite-password"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
        Criar conta
      </button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Aceitar convite</h1>
        <ThemeToggle />
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
        <AcceptInviteForm />
      </Suspense>
    </main>
  );
}
