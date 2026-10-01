'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agentToolNameSchema,
  memberRoleSchema,
  type AgentView,
  type CreatedInvitation,
  type InvitationView,
  type MemberRole,
  type MemberView,
  type PolicyDecisionKind,
  type ToolPolicyView,
} from '@forge/types';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { ConfirmDeleteButton } from '@/components/confirm-delete-button';
import { ApiError, apiFetch } from '@/lib/api-client';
import { AGENT_ROLE_LABELS, MEMBER_ROLE_LABELS, POLICY_DECISION_LABELS } from '@/lib/labels';
import { canManageMembers, canManagePolicies } from '@/lib/project-permissions';
import type { ApiCurrentUser } from '@/lib/types';

const INPUT_CLASS = 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
const BUTTON_CLASS = 'rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

type TabKey = 'members' | 'invitations' | 'roles' | 'policies' | 'agents' | 'demo';

const errorMessage = (error: unknown): string => (error instanceof ApiError ? error.message : 'Não foi possível concluir a ação.');

const INVITATION_STATUS_LABELS: Record<InvitationView['status'], string> = {
  pending: 'Pendente',
  accepted: 'Aceito',
  revoked: 'Revogado',
  expired: 'Expirado',
};

function MembersTab({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['members'], queryFn: () => apiFetch<MemberView[]>('/members') });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: MemberRole }) =>
      apiFetch<MemberView>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (caught) => {
      setError(errorMessage(caught));
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const remove = async (id: string) => {
    await apiFetch<null>(`/members/${id}`, { method: 'DELETE' });
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['members'] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-3">
      <h2 id="members-heading" className="text-lg font-medium">
        Usuários
      </h2>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando usuários…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm" data-testid="members-table">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2 font-medium">Papel</th>
                <th className="px-3 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((member) => {
                const locked = member.isProtected || member.id === currentUserId;
                return (
                  <tr key={member.id} data-testid="member-row">
                    <td className="px-3 py-3 font-medium">
                      {member.name} {member.id === currentUserId && <Badge>Você</Badge>}{' '}
                      {member.isProtected && <Badge tone="attention">Demo</Badge>}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{member.email}</td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Papel de ${member.name}`}
                        value={member.role}
                        disabled={locked || changeRole.isPending}
                        onChange={(event) => changeRole.mutate({ id: member.id, role: event.target.value as MemberRole })}
                        className={INPUT_CLASS}
                      >
                        {memberRoleSchema.options.map((role) => (
                          <option key={role} value={role}>
                            {MEMBER_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {!locked && (
                        <ConfirmDeleteButton
                          label="Remover"
                          description={`Remover ${member.name} da organização?`}
                          onDelete={() => remove(member.id)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InvitationsTab() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('developer');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['invitations'], queryFn: () => apiFetch<InvitationView[]>('/invitations') });

  const invite = useMutation({
    mutationFn: () => apiFetch<CreatedInvitation>('/invitations', { method: 'POST', body: JSON.stringify({ email, role }) }),
    onSuccess: (result) => {
      setError(null);
      setCreated(result);
      setEmail('');
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (caught) => {
      setCreated(null);
      setError(errorMessage(caught));
    },
  });

  const revoke = async (id: string) => {
    await apiFetch<null>(`/invitations/${id}`, { method: 'DELETE' });
    void queryClient.invalidateQueries({ queryKey: ['invitations'] });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    invite.mutate();
  };

  const link = created ? `${window.location.origin}/accept-invite?token=${created.token}` : '';

  return (
    <section aria-labelledby="invitations-heading" className="flex flex-col gap-4">
      <h2 id="invitations-heading" className="text-lg font-medium">
        Convites
      </h2>
      <form onSubmit={handleSubmit} aria-label="Novo convite" className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-medium">
            E-mail
          </label>
          <input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={`${INPUT_CLASS} w-72`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            Papel
          </label>
          <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as MemberRole)} className={INPUT_CLASS}>
            {memberRoleSchema.options.map((option) => (
              <option key={option} value={option}>
                {MEMBER_ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={invite.isPending} className={BUTTON_CLASS}>
          Criar convite
        </button>
        {error && (
          <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>

      {created && (
        <div role="status" data-testid="invite-link" className="flex flex-col gap-1 rounded-lg border border-border p-4 text-sm">
          <span className="font-medium">Convite criado para {created.email}. Copie o link agora — ele não será exibido de novo:</span>
          <code className="break-all rounded bg-muted px-2 py-1 text-xs">{link}</code>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando convites…</p>}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum convite criado.</p>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border" data-testid="invitations-list">
          {data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.email}</span>
                <Badge>{MEMBER_ROLE_LABELS[item.role]}</Badge>
                <Badge tone={item.status === 'pending' ? 'attention' : item.status === 'accepted' ? 'positive' : 'neutral'}>
                  {INVITATION_STATUS_LABELS[item.status]}
                </Badge>
              </span>
              {item.status === 'pending' && (
                <ConfirmDeleteButton label="Revogar" description={`Revogar o convite de ${item.email}?`} onDelete={() => revoke(item.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RolesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => apiFetch<{ role: MemberRole; permissions: string[] }[]>('/members/roles'),
    staleTime: 5 * 60_000,
  });
  const permissions = data ? [...new Set(data.flatMap((item) => item.permissions))] : [];

  return (
    <section aria-labelledby="roles-heading" className="flex flex-col gap-3">
      <h2 id="roles-heading" className="text-lg font-medium">
        Papéis e permissões
      </h2>
      <p className="text-sm text-muted-foreground">Matriz fixa do sistema (somente leitura): cada papel e o que ele pode fazer.</p>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando papéis…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm" data-testid="roles-matrix">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Permissão</th>
                {data.map((item) => (
                  <th key={item.role} className="px-3 py-2 font-medium">
                    {MEMBER_ROLE_LABELS[item.role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {permissions.map((permission) => (
                <tr key={permission}>
                  <td className="px-3 py-2 font-mono text-xs">{permission}</td>
                  {data.map((item) => (
                    <td key={item.role} className="px-3 py-2">
                      {item.permissions.includes(permission) ? (
                        <span aria-label="Permitido">✓</span>
                      ) : (
                        <span aria-label="Não permitido" className="text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const STRICTNESS: Record<PolicyDecisionKind, number> = { allow: 0, require_approval: 1, deny: 2 };

function PoliciesTab() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['tool-policies'], queryFn: () => apiFetch<ToolPolicyView[]>('/policies/tools') });

  const update = useMutation({
    mutationFn: ({ toolName, decision }: { toolName: string; decision: PolicyDecisionKind }) =>
      apiFetch<ToolPolicyView[]>(`/policies/tools/${toolName}`, { method: 'PUT', body: JSON.stringify({ decision }) }),
    onSuccess: (result) => {
      setError(null);
      queryClient.setQueryData(['tool-policies'], result);
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <section aria-labelledby="policies-heading" className="flex flex-col gap-3">
      <h2 id="policies-heading" className="text-lg font-medium">
        Políticas de ferramentas
      </h2>
      <p className="text-sm text-muted-foreground">
        Define o que os agentes de IA podem fazer sem supervisão. Você só pode tornar uma ferramenta mais restritiva que o padrão do sistema — nunca mais permissiva.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando políticas…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm" data-testid="policies-table">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Ferramenta</th>
                <th className="px-3 py-2 font-medium">Padrão do sistema</th>
                <th className="px-3 py-2 font-medium">Decisão da organização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((tool) => (
                <tr key={tool.toolName} data-testid="policy-row">
                  <td className="px-3 py-3 font-mono text-xs">{tool.toolName}</td>
                  <td className="px-3 py-3">
                    <Badge>{POLICY_DECISION_LABELS[tool.defaultDecision]}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      aria-label={`Decisão para ${tool.toolName}`}
                      value={tool.decision}
                      disabled={update.isPending}
                      onChange={(event) => update.mutate({ toolName: tool.toolName, decision: event.target.value as PolicyDecisionKind })}
                      className={INPUT_CLASS}
                    >
                      {(Object.keys(POLICY_DECISION_LABELS) as PolicyDecisionKind[])
                        .filter((decision) => STRICTNESS[decision] >= STRICTNESS[tool.defaultDecision])
                        .map((decision) => (
                          <option key={decision} value={decision}>
                            {POLICY_DECISION_LABELS[decision]}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AgentCard({ agent }: { agent: AgentView }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(agent.instructions ?? '');
  const [tools, setTools] = useState<string[]>(agent.allowedTools);
  const [enabled, setEnabled] = useState(agent.isEnabled);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<AgentView>(`/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          instructions: instructions.trim() === '' ? null : instructions,
          allowedTools: tools,
          isEnabled: enabled,
        }),
      }),
    onSuccess: () => {
      setMessage({ tone: 'ok', text: 'Agente salvo.' });
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (caught) => setMessage({ tone: 'error', text: errorMessage(caught) }),
  });

  const toggleTool = (tool: string) =>
    setTools((current) => (current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool]));
  const id = `agent-${agent.id}`;

  return (
    <form
      aria-label={`Agente ${AGENT_ROLE_LABELS[agent.role]}`}
      data-testid="agent-card"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Badge>{AGENT_ROLE_LABELS[agent.role]}</Badge>
          {!enabled && <Badge tone="attention">Desabilitado</Badge>}
        </span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4 accent-foreground" />
          Habilitado
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Nome
        </label>
        <input id={`${id}-name`} required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className={`${INPUT_CLASS} w-full`} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-instructions`} className="text-sm font-medium">
          Instruções extras
        </label>
        <textarea
          id={`${id}-instructions`}
          rows={3}
          maxLength={4000}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Ex.: responda sempre em português e cite os arquivos analisados."
          className={`${INPUT_CLASS} w-full`}
        />
        <p className="text-xs text-muted-foreground">Enviadas ao modelo como configuração da organização; nunca alteram políticas, ferramentas permitidas ou isolamento de tenant.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Ferramentas permitidas</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {agentToolNameSchema.options.map((tool) => (
            <label key={tool} className="flex items-center gap-1.5 font-mono text-xs">
              <input type="checkbox" checked={tools.includes(tool)} onChange={() => toggleTool(tool)} className="size-3.5 accent-foreground" />
              {tool}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Escrita, comandos e Git continuam passando pela política de ferramentas e pela aprovação humana.</p>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={save.isPending} className={BUTTON_CLASS}>
          {save.isPending ? 'Salvando…' : 'Salvar agente'}
        </button>
        {message && (
          <span role={message.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${message.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

function AgentsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => apiFetch<AgentView[]>('/agents') });
  return (
    <section aria-labelledby="agents-heading" className="flex flex-col gap-3">
      <h2 id="agents-heading" className="text-lg font-medium">
        Agentes
      </h2>
      <p className="text-sm text-muted-foreground">Um agente por papel do pipeline: ajuste nome, instruções, ferramentas permitidas e se participa das execuções.</p>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando agentes…</p>}
      <div className="grid gap-4 lg:grid-cols-2">{data?.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>
    </section>
  );
}

function DemoTab() {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<Record<string, number | boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    const result = await apiFetch<Record<string, number | boolean>>('/demo/reset', { method: 'POST' });
    setError(null);
    setSummary(result);
    void queryClient.invalidateQueries();
  };

  return (
    <section aria-labelledby="demo-heading" className="flex flex-col gap-3">
      <h2 id="demo-heading" className="text-lg font-medium">
        Demonstração
      </h2>
      <p className="text-sm text-muted-foreground">
        Devolve a organização de demonstração ao estado inicial: remove projetos, usuários, convites e datasets criados por visitantes, restaura os agentes e limpa as políticas de ferramentas. O projeto de exemplo e as contas de demonstração são preservados.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div>
        <ConfirmDeleteButton
          label="Resetar demonstração"
          description="Remover tudo o que foi criado por visitantes e restaurar os padrões?"
          testId="demo-reset"
          onDelete={async () => {
            try {
              await reset();
            } catch (caught) {
              setError(errorMessage(caught));
              throw caught;
            }
          }}
        />
      </div>
      {summary && (
        <p role="status" data-testid="demo-reset-result" className="text-sm">
          Demonstração restaurada: {String(summary['projectsRemoved'])} projeto(s), {String(summary['membersRemoved'])} usuário(s) e {String(summary['invitationsRemoved'])} convite(s) removidos; {String(summary['agentsRestored'])} agente(s) restaurados.
        </p>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => apiFetch<ApiCurrentUser>('/auth/me') });
  const [chosen, setChosen] = useState<TabKey | null>(null);
  const demoStatus = useQuery({
    queryKey: ['demo-status'],
    queryFn: () => apiFetch<{ resettable: boolean }>('/demo/status'),
    enabled: user !== undefined && canManageMembers(user.role),
  });

  const tabs: { key: TabKey; label: string }[] = [];
  if (user && canManageMembers(user.role)) {
    tabs.push({ key: 'members', label: 'Usuários' }, { key: 'invitations', label: 'Convites' }, { key: 'roles', label: 'Papéis' });
  }
  if (user && canManagePolicies(user.role)) tabs.push({ key: 'policies', label: 'Políticas' }, { key: 'agents', label: 'Agentes' });
  if (demoStatus.data?.resettable) tabs.push({ key: 'demo', label: 'Demonstração' });
  const active = tabs.find((tab) => tab.key === chosen)?.key ?? tabs[0]?.key;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Configurações' }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">Usuários, convites, papéis e políticas de ferramentas da organização.</p>
      </div>

      {user && tabs.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Seu papel não tem acesso às configurações da organização.
        </p>
      )}

      {tabs.length > 0 && (
        <div role="tablist" aria-label="Seções de configurações" className="flex flex-wrap gap-2 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={active === tab.key}
              aria-controls="settings-panel"
              onClick={() => setChosen(tab.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                active === tab.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel" id="settings-panel" aria-labelledby={active ? `tab-${active}` : undefined}>
        {user && active === 'members' && <MembersTab currentUserId={user.id} />}
        {active === 'invitations' && <InvitationsTab />}
        {active === 'roles' && <RolesTab />}
        {active === 'policies' && <PoliciesTab />}
        {active === 'agents' && <AgentsTab />}
        {active === 'demo' && <DemoTab />}
      </div>
    </div>
  );
}
