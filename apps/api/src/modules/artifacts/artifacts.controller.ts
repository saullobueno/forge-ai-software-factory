import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { idSchema } from '@forge/types';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { ArtifactsService } from './artifacts.service.js';

/**
 * Fase 6 — persistência de artefatos (spec §9/§12). Só o conteúdo de um
 * artefato específico já resolvido por id; a listagem por execução vive em
 * `GET /agent-runs/:id/artifacts` (`AgentRunsController`), já que é sempre
 * navegada a partir de uma execução. Usa `task:read` como permissão mínima
 * — mesmo raciocínio de `AgentRunsController`: ver o conteúdo de um
 * artefato de teste é leitura, não uma ação sobre a execução de IA.
 */
@Controller('artifacts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  @Get(':id/content')
  @RequirePermission('task:read')
  async content(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Artefato não encontrado.');
    }

    return this.artifactsService.getContent(id, user.organizationId);
  }
}
