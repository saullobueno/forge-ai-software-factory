import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { idSchema } from '@forge/types';
import type { Observable } from 'rxjs';
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { AgentRunsService } from './agent-runs.service.js';

/**
 * Fase 6 — "Execuções de IA" (spec §9): detalhe (execução + steps + tool
 * calls), cancelamento (transição de estado real via `@forge/domain`),
 * canal de tempo real (SSE) e artefatos. `task:read` é a permissão mínima
 * de leitura em toda a API (todo `MemberRole` a tem — ver
 * `permissions.test.ts`) e cobre bem "ver uma execução de IA": uma
 * execução sempre pertence a uma tarefa, e quem pode ler a tarefa pode ver
 * sua execução. `agent_run:cancel` é a única permissão nova desta fase,
 * reservada para quem também pode `agent_run:trigger`.
 */
@Controller('agent-runs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentRunsController {
  constructor(
    private readonly agentRunsService: AgentRunsService,
    private readonly artifactsService: ArtifactsService,
  ) {}

  @Get(':id')
  @RequirePermission('task:read')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    const run = await this.agentRunsService.getDetail(id, user.organizationId);
    if (!run) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    return run;
  }

  /**
   * `HttpCode(200)`: o default do Nest para POST é 201 (criação) — cancelar
   * é uma atualização de estado sobre um recurso já existente, não uma
   * criação.
   */
  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('agent_run:cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    return this.agentRunsService.cancel(id, user.organizationId);
  }

  @Sse(':id/events')
  @RequirePermission('task:read')
  async events(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Observable<MessageEvent>> {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    return this.agentRunsService.streamEvents(id, user.organizationId);
  }

  @Get(':id/artifacts')
  @RequirePermission('task:read')
  async artifacts(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    const run = await this.agentRunsService.getDetail(id, user.organizationId);
    if (!run) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    return this.artifactsService.listForAgentRun(id, user.organizationId);
  }
}
