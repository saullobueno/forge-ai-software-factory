import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  aiPlaygroundEvaluationRequestSchema,
  createPlaygroundDatasetRequestSchema,
  createPlaygroundDatasetVersionRequestSchema,
  idSchema,
  type AIPlaygroundEvaluationRequest,
  type CreatePlaygroundDatasetRequest,
  type CreatePlaygroundDatasetVersionRequest,
} from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { AIPlaygroundService } from './ai-playground.service.js';
import { PlaygroundDatasetsService } from './playground-datasets.service.js';

@Controller('ai-playground')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AIPlaygroundController {
  constructor(
    private readonly playground: AIPlaygroundService,
    private readonly auditLogsService: AuditLogsService,
    private readonly datasets: PlaygroundDatasetsService,
  ) {}

  @Get('config')
  @RequirePermission('ai_playground:use')
  config() {
    return {
      models: this.playground.getModels(),
      defaultDataset: this.playground.getDefaultDataset(),
    };
  }

  @Post('evaluations')
  @RequirePermission('ai_playground:use')
  async evaluate(
    @Body(new ZodValidationPipe(aiPlaygroundEvaluationRequestSchema)) input: AIPlaygroundEvaluationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    let items = input.dataset;
    if (input.datasetVersionId) {
      items = await this.datasets.resolveVersionItems(input.datasetVersionId, user.organizationId);
      if (!items) throw new NotFoundException('Versão de dataset não encontrada.');
    }
    if (!items) throw new NotFoundException('Dataset não informado.');
    const evaluation = this.playground.evaluate({ ...input, dataset: items });
    await this.auditLogsService.record({
      organizationId: user.organizationId,
      actorType: 'user',
      actorUserId: user.userId,
      action: 'ai_playground.evaluated',
      targetType: 'ai_playground',
      metadata: {
        models: input.models,
        datasetSize: items.length,
        datasetVersionId: input.datasetVersionId ?? null,
        requireStructuredOutput: input.requireStructuredOutput ?? false,
        winner: evaluation.winner,
        totalTokens: evaluation.results.reduce((total, result) => total + result.totalTokens, 0),
        totalCostUsd: evaluation.results.reduce((total, result) => total + result.totalCostUsd, 0),
      },
    });
    return evaluation;
  }

  @Get('datasets')
  @RequirePermission('ai_playground:use')
  async listDatasets(@CurrentUser() user: AuthenticatedUser) {
    return this.datasets.list(user.organizationId);
  }

  @Post('datasets')
  @RequirePermission('ai_playground:use')
  async createDataset(
    @Body(new ZodValidationPipe(createPlaygroundDatasetRequestSchema)) body: CreatePlaygroundDatasetRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.datasets.create(user, body);
  }

  @Get('datasets/:id')
  @RequirePermission('ai_playground:use')
  async getDataset(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.datasets.get(this.requireId(id), user.organizationId);
  }

  @Get('datasets/:id/versions/:version')
  @RequirePermission('ai_playground:use')
  async getDatasetVersion(@Param('id') id: string, @Param('version') version: string, @CurrentUser() user: AuthenticatedUser) {
    const number = Number(version);
    if (!Number.isInteger(number) || number < 1) throw new NotFoundException('Versão não encontrada.');
    return this.datasets.getVersion(this.requireId(id), number, user.organizationId);
  }

  @Post('datasets/:id/versions')
  @RequirePermission('ai_playground:use')
  async addDatasetVersion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createPlaygroundDatasetVersionRequestSchema)) body: CreatePlaygroundDatasetVersionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.datasets.addVersion(this.requireId(id), user, body);
  }

  @Delete('datasets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('ai_playground:use')
  async deleteDataset(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.datasets.remove(this.requireId(id), user);
  }

  private requireId(id: string): string {
    if (!idSchema.safeParse(id).success) throw new NotFoundException('Dataset não encontrado.');
    return id;
  }
}
