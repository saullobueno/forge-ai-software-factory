import { Injectable, Logger } from '@nestjs/common';
import { hasPermission } from '@forge/domain';
import { NotificationsRepository, type NotificationRow } from './notifications.repository.js';

export interface NotificationView {
  id: string;
  kind: NotificationRow['kind'];
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: Date;
  /** Caminho da interface para abrir o item relacionado (`null` se ele não existe mais). */
  link: string | null;
}

/**
 * Notificações dentro do app. Os métodos `notify*` são best-effort: uma falha
 * aqui nunca pode derrubar o fluxo que a originou (atribuir tarefa, concluir
 * execução), então erros só viram log.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly repository: NotificationsRepository) {}

  async list(organizationId: string, userId: string, limit = 30): Promise<{ items: NotificationView[]; unreadCount: number }> {
    const [rows, unreadCount] = await Promise.all([
      this.repository.listForUser(organizationId, userId, limit),
      this.repository.countUnread(organizationId, userId),
    ]);

    const taskIds = rows.filter((row) => row.relatedEntityType === 'task' && row.relatedEntityId).map((row) => row.relatedEntityId as string);
    const runIds = rows.filter((row) => row.relatedEntityType === 'agent_run' && row.relatedEntityId).map((row) => row.relatedEntityId as string);
    const [taskProjects, runLocations] = await Promise.all([
      this.repository.taskProjects(taskIds),
      this.repository.runLocations(runIds),
    ]);

    const items = rows.map((row) => {
      let link: string | null = null;
      if (row.relatedEntityType === 'task' && row.relatedEntityId) {
        const projectId = taskProjects.get(row.relatedEntityId);
        link = projectId ? `/projects/${projectId}/tasks/${row.relatedEntityId}` : null;
      } else if (row.relatedEntityType === 'agent_run' && row.relatedEntityId) {
        const location = runLocations.get(row.relatedEntityId);
        link = location ? `/projects/${location.projectId}/tasks/${location.taskId}/runs/${row.relatedEntityId}` : null;
      }
      return { id: row.id, kind: row.kind, title: row.title, body: row.body, isRead: row.isRead, createdAt: row.createdAt, link };
    });
    return { items, unreadCount };
  }

  markRead(id: string, organizationId: string, userId: string): Promise<boolean> {
    return this.repository.markRead(id, organizationId, userId);
  }

  markAllRead(organizationId: string, userId: string): Promise<void> {
    return this.repository.markAllRead(organizationId, userId);
  }

  /** Avisa o novo responsável (não avisa quem se atribuiu a si mesmo). */
  async notifyTaskAssigned(input: {
    organizationId: string;
    taskId: string;
    taskTitle: string;
    projectId: string;
    assigneeId: string;
    actorUserId: string;
  }): Promise<void> {
    if (input.assigneeId === input.actorUserId) return;
    await this.safely('task_assigned', async () => {
      const projectName = await this.repository.findProjectName(input.projectId);
      await this.repository.insertMany([
        {
          organizationId: input.organizationId,
          userId: input.assigneeId,
          kind: 'task_assigned',
          title: `Você foi designado para "${input.taskTitle}"`,
          body: projectName ? `Projeto ${projectName}` : null,
          relatedEntityType: 'task',
          relatedEntityId: input.taskId,
        },
      ]);
    });
  }

  /** Avisa quem pode aprovar execuções de IA (`agent_run:approve`) que há uma decisão pendente. */
  async notifyApprovalRequested(agentRunId: string): Promise<void> {
    await this.safely('approval_requested', async () => {
      const run = await this.repository.findRunContext(agentRunId);
      if (!run) return;
      const members = await this.repository.findOrganizationMembers(run.organizationId);
      await this.repository.insertMany(
        members
          .filter((member) => hasPermission(member.role, 'agent_run:approve'))
          .map((member) => ({
            organizationId: run.organizationId,
            userId: member.id,
            kind: 'approval_requested' as const,
            title: `Aprovação pendente: ${run.taskTitle}`,
            body: 'Uma execução de IA aguarda sua decisão.',
            relatedEntityType: 'agent_run' as const,
            relatedEntityId: agentRunId,
          })),
      );
    });
  }

  /** Avisa quem disparou a execução que ela terminou (concluída/falhou); cancelada não gera aviso. */
  async notifyAgentRunFinished(agentRunId: string, status: string, actorUserId?: string): Promise<void> {
    if (status !== 'completed' && status !== 'failed') return;
    await this.safely('agent_run_finished', async () => {
      const run = await this.repository.findRunContext(agentRunId);
      if (!run || !run.requestedByUserId || run.requestedByUserId === actorUserId) return;
      await this.repository.insertMany([
        {
          organizationId: run.organizationId,
          userId: run.requestedByUserId,
          kind: status === 'completed' ? 'agent_run_completed' : 'agent_run_failed',
          title: status === 'completed' ? `Execução concluída: ${run.taskTitle}` : `Execução falhou: ${run.taskTitle}`,
          body: null,
          relatedEntityType: 'agent_run',
          relatedEntityId: agentRunId,
        },
      ]);
    });
  }

  private async safely(label: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.warn(`Falha ao gerar notificação (${label}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
