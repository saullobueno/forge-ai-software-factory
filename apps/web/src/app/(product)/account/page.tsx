'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSessionView, TwoFactorSetup, TwoFactorStatus } from '@forge/types';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { ConfirmDeleteButton } from '@/components/confirm-delete-button';
import { ApiError, apiFetch } from '@/lib/api-client';

const INPUT_CLASS = 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
const BUTTON_CLASS = 'rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

const errorMessage = (error: unknown): string => (error instanceof ApiError ? error.message : 'Não foi possível concluir a ação.');

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo desconhecido';
  const browser = /Edg\//u.test(userAgent) ? 'Edge' : /Chrome\//u.test(userAgent) ? 'Chrome' : /Firefox\//u.test(userAgent) ? 'Firefox' : /Safari\//u.test(userAgent) ? 'Safari' : 'Navegador';
  const system = /Windows/u.test(userAgent) ? 'Windows' : /Android/u.test(userAgent) ? 'Android' : /iPhone|iPad/u.test(userAgent) ? 'iOS' : /Mac OS/u.test(userAgent) ? 'macOS' : /Linux/u.test(userAgent) ? 'Linux' : 'sistema desconhecido';
  return `${browser} em ${system}`;
}

function SessionsSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['auth-sessions'], queryFn: () => apiFetch<AuthSessionView[]>('/auth/sessions') });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });

  const revokeOthers = useMutation({
    mutationFn: () => apiFetch<{ revoked: number }>('/auth/sessions', { method: 'DELETE' }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const revoke = async (id: string) => {
    await apiFetch<null>(`/auth/sessions/${id}`, { method: 'DELETE' });
    refresh();
  };

  const others = (data ?? []).filter((session) => !session.current);

  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sessions-heading" className="text-lg font-medium">
          Sessões ativas
        </h2>
        {others.length > 0 && (
          <button type="button" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending} className={BUTTON_CLASS}>
            Encerrar todas as outras
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Cada login cria uma sessão. Encerrar uma sessão a desconecta na hora, em qualquer dispositivo.</p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando sessões…</p>}
      <ul className="divide-y divide-border rounded-lg border border-border" data-testid="sessions-list">
        {(data ?? []).map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 font-medium">
                {describeAgent(session.userAgent)}
                {session.current && <Badge tone="positive">Esta sessão</Badge>}
              </span>
              <span className="text-xs text-muted-foreground">
                {session.ipAddress ?? 'IP desconhecido'} · último uso {new Date(session.lastUsedAt).toLocaleString('pt-BR')}
              </span>
            </span>
            {!session.current && <ConfirmDeleteButton label="Encerrar" description="Encerrar esta sessão?" onDelete={() => revoke(session.id)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TwoFactorSection() {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({ queryKey: ['auth-2fa'], queryFn: () => apiFetch<TwoFactorStatus>('/auth/2fa') });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['auth-2fa'] });

  const start = useMutation({
    mutationFn: () => apiFetch<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST' }),
    onSuccess: (result) => {
      setError(null);
      setSetup(result);
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const enable = useMutation({
    mutationFn: () => apiFetch<{ recoveryCodes: string[] }>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    onSuccess: (result) => {
      setError(null);
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setCode('');
      refresh();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const disable = useMutation({
    mutationFn: () => apiFetch<null>('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password, code }) }),
    onSuccess: () => {
      setError(null);
      setPassword('');
      setCode('');
      setRecoveryCodes(null);
      refresh();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const submit = (action: () => void) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    action();
  };

  return (
    <section aria-labelledby="twofactor-heading" className="flex flex-col gap-3">
      <h2 id="twofactor-heading" className="flex items-center gap-2 text-lg font-medium">
        Verificação em duas etapas
        {status.data && <Badge tone={status.data.enabled ? 'positive' : 'neutral'}>{status.data.enabled ? 'Ativa' : 'Desativada'}</Badge>}
      </h2>
      <p className="text-sm text-muted-foreground">
        Além da senha, o login passa a pedir um código de 6 dígitos de um app autenticador (Google Authenticator, Authy, 1Password…).
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {recoveryCodes && (
        <div role="status" data-testid="recovery-codes" className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
          <span className="font-medium">Guarde estes códigos de recuperação agora — eles não serão exibidos de novo. Cada um vale uma vez.</span>
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
            {recoveryCodes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {status.data && !status.data.enabled && !setup && (
        <div>
          <button type="button" onClick={() => start.mutate()} disabled={start.isPending} className={BUTTON_CLASS}>
            Ativar verificação em duas etapas
          </button>
        </div>
      )}

      {setup && (
        <form onSubmit={submit(() => enable.mutate())} aria-label="Confirmar verificação em duas etapas" className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            No app autenticador, adicione uma conta manualmente com a chave abaixo (ou abra o endereço <code className="break-all text-xs">otpauth</code>) e digite o código gerado para confirmar.
          </p>
          <code data-testid="totp-secret" className="break-all rounded bg-muted px-2 py-1 text-sm">
            {setup.secret}
          </code>
          <code className="break-all rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{setup.otpauthUrl}</code>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="enable-code" className="text-sm font-medium">
                Código de 6 dígitos
              </label>
              <input id="enable-code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} className={INPUT_CLASS} />
            </div>
            <button type="submit" disabled={enable.isPending || code.length !== 6} className={BUTTON_CLASS}>
              Confirmar e ativar
            </button>
          </div>
        </form>
      )}

      {status.data?.enabled && (
        <form onSubmit={submit(() => disable.mutate())} aria-label="Desativar verificação em duas etapas" className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Códigos de recuperação restantes: {status.data.recoveryCodesRemaining}. Para desativar, confirme a senha e um código.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="disable-password" className="text-sm font-medium">
                Senha
              </label>
              <input id="disable-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="disable-code" className="text-sm font-medium">
                Código (app ou recuperação)
              </label>
              <input id="disable-code" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} className={INPUT_CLASS} />
            </div>
            <button type="submit" disabled={disable.isPending} className={BUTTON_CLASS}>
              Desativar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-8">
      <Breadcrumb items={[{ label: 'Minha conta' }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Segurança do seu acesso: sessões ativas e verificação em duas etapas.</p>
      </div>
      <TwoFactorSection />
      <SessionsSection />
    </div>
  );
}
